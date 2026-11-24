begin;

create table public.business_period_costs (
  business_id uuid not null references public.businesses(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  cost_of_goods bigint check (cost_of_goods between 0 and 9007199254740991),
  operating_cost bigint check (operating_cost between 0 and 9007199254740991),
  updated_at timestamptz not null default now(),
  primary key (business_id, starts_on, ends_on),
  check (ends_on between starts_on and starts_on + 366),
  check (cost_of_goods is not null or operating_cost is not null)
);

create table public.business_conversations (
  business_id uuid not null references public.businesses(id) on delete cascade,
  id uuid not null,
  turns jsonb not null,
  version integer not null default 1 check (version > 0),
  title text not null check (char_length(title) between 1 and 100),
  updated_at timestamptz not null default now(),
  primary key (business_id, id),
  check (jsonb_typeof(turns) = 'array' and jsonb_array_length(turns) between 1 and 24),
  check (octet_length(turns::text) <= 180000)
);
create index on public.business_conversations (business_id, updated_at desc);

alter table public.business_period_costs enable row level security;
alter table public.business_conversations enable row level security;
revoke all on public.business_period_costs, public.business_conversations from public, anon, authenticated;
grant select on public.business_period_costs, public.business_conversations to authenticated;
grant select, insert, update, delete on public.business_period_costs, public.business_conversations to service_role;
create policy read_owned_period_costs on public.business_period_costs
  for select to authenticated using (
    exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid()))
  );
create policy read_owned_conversations on public.business_conversations
  for select to authenticated using (
    exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid()))
  );

commit;
