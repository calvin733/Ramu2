begin;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  kind text check (kind in ('Makanan & minuman', 'Ritel', 'Jasa', 'Lainnya')),
  currency text not null default 'IDR' check (currency = 'IDR'),
  timezone text not null default 'Asia/Jakarta' check (timezone in ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura')),
  active_revision_id uuid,
  created_at timestamptz not null default now()
);

create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('csv', 'xlsx')),
  name text not null check (char_length(name) between 1 and 180),
  sheet text,
  created_at timestamptz not null default now(),
  unique (business_id, id)
);

create table public.import_runs (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  base_revision_id uuid,
  state text not null default 'ready' check (state in ('ready', 'activated', 'cancelled', 'expired')),
  payload jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  unique (business_id, id),
  check ((state = 'ready') = (payload is not null))
);

create table public.sales_revisions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  source_id uuid not null,
  import_run_id uuid not null unique,
  covered_from date not null,
  covered_through date not null check (covered_through >= covered_from),
  total_sales bigint not null check (total_sales between -9007199254740991 and 9007199254740991),
  order_count integer check (order_count >= 0),
  product_available boolean not null,
  basis text not null check (basis in ('line', 'order', 'unit')),
  mapping jsonb not null,
  imported_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, source_id) references public.data_sources(business_id, id),
  foreign key (business_id, import_run_id) references public.import_runs(business_id, id)
);

alter table public.businesses add constraint active_sales_revision
  foreign key (id, active_revision_id) references public.sales_revisions(business_id, id)
  deferrable initially deferred;

create table public.sales_facts (
  business_id uuid not null,
  revision_id uuid not null,
  source_row integer not null check (source_row >= 2),
  business_date date not null,
  occurred_at timestamptz,
  order_id text,
  product text,
  quantity integer check (quantity > 0),
  status text not null check (status in ('completed', 'refunded')),
  revenue bigint not null check (
    revenue between -9007199254740991 and 9007199254740991
    and ((status = 'completed' and revenue >= 0) or (status = 'refunded' and revenue <= 0))
  ),
  product_revenue bigint check (product_revenue is null or product_revenue = revenue),
  primary key (business_id, revision_id, source_row),
  foreign key (business_id, revision_id) references public.sales_revisions(business_id, id) on delete cascade
);

create index on public.sales_facts (business_id, revision_id, business_date);
create index on public.import_runs (business_id, expires_at) where state = 'ready';

alter table public.businesses enable row level security;
alter table public.data_sources enable row level security;
alter table public.import_runs enable row level security;
alter table public.sales_revisions enable row level security;
alter table public.sales_facts enable row level security;

revoke all on public.businesses, public.data_sources, public.import_runs, public.sales_revisions, public.sales_facts from public, anon, authenticated;
grant select on public.businesses, public.data_sources, public.sales_revisions, public.sales_facts to authenticated;
grant select, insert, update, delete on public.businesses, public.data_sources, public.import_runs, public.sales_revisions, public.sales_facts to service_role;
grant insert (owner_id, name, kind, timezone), update (name, kind, timezone) on public.businesses to authenticated;

create policy read_own_business on public.businesses for select to authenticated
  using (owner_id = (select auth.uid()));
create policy create_own_business on public.businesses for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy update_own_business on public.businesses for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy read_own_sources on public.data_sources for select to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())));
create policy read_own_revisions on public.sales_revisions for select to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())));
create policy read_own_facts on public.sales_facts for select to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

create function public.ramu_protect_business_timezone()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.active_revision_id is not null and new.timezone is distinct from old.timezone then
    raise exception using errcode = '22023', message = 'sales_timezone_locked';
  end if;
  return new;
end;
$$;

create trigger lock_sales_timezone before update of timezone on public.businesses
  for each row execute function public.ramu_protect_business_timezone();
revoke execute on function public.ramu_protect_business_timezone() from public, anon, authenticated;

create function public.ramu_stage_import(p_owner uuid, p_business uuid, p_base uuid, p_run uuid, p_payload jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  live_revision uuid;
  business_timezone text;
begin
  select active_revision_id, timezone into live_revision, business_timezone from public.businesses
    where id = p_business and owner_id = p_owner for update;
  if not found then raise exception using errcode = '42501', message = 'business_not_found'; end if;
  if live_revision is distinct from p_base or business_timezone is distinct from p_payload ->> 'timezone' then
    raise exception using errcode = 'PT409', message = 'revision_changed';
  end if;
  if jsonb_typeof(p_payload -> 'facts') is distinct from 'array'
    or jsonb_array_length(p_payload -> 'facts') not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'invalid_preview';
  end if;
  update public.import_runs set state = 'expired', payload = null
    where business_id = p_business and state = 'ready' and expires_at <= now();
  insert into public.import_runs (id, business_id, base_revision_id, payload)
    values (p_run, p_business, p_base, p_payload);
end;
$$;

create function public.ramu_cancel_import(p_owner uuid, p_business uuid, p_run uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.businesses where id = p_business and owner_id = p_owner for update;
  if not found then raise exception using errcode = '42501', message = 'business_not_found'; end if;
  update public.import_runs set state = 'cancelled', payload = null
    where id = p_run and business_id = p_business and state = 'ready';
end;
$$;

create function public.ramu_activate_import(p_owner uuid, p_business uuid, p_run uuid, p_accept_reduced_coverage boolean)
returns uuid language plpgsql set search_path = '' as $$
declare
  run public.import_runs%rowtype;
  prior public.sales_revisions%rowtype;
  live_revision uuid;
  business_timezone text;
  source uuid;
  revision uuid;
  starts date;
  ends date;
begin
  select active_revision_id, timezone into live_revision, business_timezone from public.businesses
    where id = p_business and owner_id = p_owner for update;
  if not found then raise exception using errcode = '42501', message = 'business_not_found'; end if;
  select * into run from public.import_runs where id = p_run and business_id = p_business;
  if not found then raise exception using errcode = 'PT404', message = 'preview_not_found'; end if;
  if run.state = 'activated' then
    return (select id from public.sales_revisions where import_run_id = p_run and business_id = p_business);
  end if;
  if run.state <> 'ready' or run.expires_at <= now() then
    raise exception using errcode = 'PT410', message = 'preview_expired';
  end if;
  if live_revision is distinct from run.base_revision_id or business_timezone is distinct from run.payload ->> 'timezone' then
    raise exception using errcode = 'PT409', message = 'revision_changed';
  end if;

  starts := (run.payload ->> 'from')::date;
  ends := (run.payload ->> 'through')::date;
  if live_revision is not null then
    select * into strict prior from public.sales_revisions where id = live_revision and business_id = p_business;
    if (starts > prior.covered_from or ends < prior.covered_through) and p_accept_reduced_coverage is not true then
      raise exception using errcode = 'PT422', message = 'coverage_confirmation_required';
    end if;
  end if;

  insert into public.data_sources (business_id, kind, name, sheet)
    values (p_business, run.payload ->> 'kind', run.payload ->> 'name', run.payload ->> 'sheet')
    returning id into source;
  insert into public.sales_revisions (
    business_id, source_id, import_run_id, covered_from, covered_through, total_sales, order_count, product_available, basis, mapping
  ) values (
    p_business, source, p_run, starts, ends, (run.payload ->> 'sales')::bigint, (run.payload ->> 'orders')::integer,
    (run.payload ->> 'products')::boolean, run.payload ->> 'basis', run.payload -> 'mapping'
  ) returning id into revision;

  insert into public.sales_facts (
    business_id, revision_id, source_row, business_date, occurred_at, order_id, product, quantity, status, revenue, product_revenue
  ) select p_business, revision, f.row, f.date, f.occurred_at, f.order_id, f.product, f.quantity, f.status, f.revenue, f.product_revenue
    from jsonb_to_recordset(run.payload -> 'facts') as f(
      row integer, date date, occurred_at timestamptz, order_id text, product text, quantity integer, status text, revenue bigint, product_revenue bigint
    );

  update public.businesses set active_revision_id = revision where id = p_business;
  update public.import_runs set state = 'activated', payload = null where id = p_run;
  return revision;
end;
$$;

revoke execute on function public.ramu_stage_import(uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.ramu_cancel_import(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ramu_activate_import(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.ramu_stage_import(uuid, uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.ramu_cancel_import(uuid, uuid, uuid) to service_role;
grant execute on function public.ramu_activate_import(uuid, uuid, uuid, boolean) to service_role;

commit;
