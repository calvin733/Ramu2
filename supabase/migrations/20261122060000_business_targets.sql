begin;

create table public.business_targets (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('revenue', 'orders', 'gross-profit', 'net-profit')),
  amount bigint not null check (amount between 1 and 9007199254740991),
  starts_on date not null check (starts_on >= date '1900-01-01'),
  ends_on date not null check (ends_on >= starts_on and ends_on <= date '2199-12-31'),
  selling_days integer check (selling_days between 0 and (ends_on - starts_on + 1)),
  is_primary boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index business_target_primary on public.business_targets (business_id) where is_primary;
create index business_target_owner on public.business_targets (business_id, id);

alter table public.business_targets enable row level security;
revoke all on public.business_targets from public, anon, authenticated;
grant select on public.business_targets to authenticated;
grant select, insert, update, delete on public.business_targets to service_role;

create policy read_own_targets on public.business_targets for select to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

create function public.ramu_save_target(
  p_owner uuid, p_business uuid, p_id uuid, p_version integer, p_kind text,
  p_amount bigint, p_starts date, p_ends date, p_selling_days integer, p_primary boolean
)
returns uuid language plpgsql set search_path = '' as $$
declare
  stored_version integer;
begin
  perform 1 from public.businesses where id = p_business and owner_id = p_owner for update;
  if not found then raise exception using errcode = '42501', message = 'business_not_found'; end if;
  select version into stored_version from public.business_targets where id = p_id and business_id = p_business;
  if p_version is null and stored_version is not null then return p_id; end if;
  if p_version is not null and stored_version is distinct from p_version then
    raise exception using errcode = 'PT409', message = 'target_changed';
  end if;
  if p_primary then
    update public.business_targets set is_primary = false, version = version + 1, updated_at = now()
      where business_id = p_business and id <> p_id and is_primary;
  end if;

  if p_version is null then
    insert into public.business_targets (id, business_id, kind, amount, starts_on, ends_on, selling_days, is_primary)
    values (p_id, p_business, p_kind, p_amount, p_starts, p_ends, p_selling_days, p_primary);
  else
    update public.business_targets set kind = p_kind, amount = p_amount, starts_on = p_starts,
      ends_on = p_ends, selling_days = p_selling_days, is_primary = p_primary,
      version = version + 1, updated_at = now()
    where id = p_id and business_id = p_business;
  end if;
  return p_id;
end;
$$;

create function public.ramu_delete_target(p_owner uuid, p_business uuid, p_id uuid, p_version integer)
returns void language plpgsql set search_path = '' as $$
declare
  stored_version integer;
begin
  perform 1 from public.businesses where id = p_business and owner_id = p_owner for update;
  if not found then raise exception using errcode = '42501', message = 'business_not_found'; end if;
  select version into stored_version from public.business_targets where id = p_id and business_id = p_business;
  if stored_version is null then return; end if;
  if stored_version is distinct from p_version then
    raise exception using errcode = 'PT409', message = 'target_changed';
  end if;
  delete from public.business_targets where id = p_id and business_id = p_business;
end;
$$;

revoke execute on function public.ramu_save_target(uuid, uuid, uuid, integer, text, bigint, date, date, integer, boolean) from public, anon, authenticated;
revoke execute on function public.ramu_delete_target(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.ramu_save_target(uuid, uuid, uuid, integer, text, bigint, date, date, integer, boolean) to service_role;
grant execute on function public.ramu_delete_target(uuid, uuid, uuid, integer) to service_role;

commit;
