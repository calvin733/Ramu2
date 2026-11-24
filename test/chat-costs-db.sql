begin;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000041'),
  ('00000000-0000-4000-8000-000000000042');
insert into public.businesses (id, owner_id, name) values
  ('10000000-0000-4000-8000-000000000041', '00000000-0000-4000-8000-000000000041', 'Alfa Chat'),
  ('10000000-0000-4000-8000-000000000042', '00000000-0000-4000-8000-000000000042', 'Beta Chat');

set local role service_role;
insert into public.business_period_costs (business_id, starts_on, ends_on, cost_of_goods)
values ('10000000-0000-4000-8000-000000000041', '2026-11-01', '2026-11-17', 0);
insert into public.business_conversations (business_id, id, title, turns)
values (
  '10000000-0000-4000-8000-000000000041', '20000000-0000-4000-8000-000000000041',
  'Ringkasan usaha', '[{"id":"30000000-0000-4000-8000-000000000041","question":"Bagaimana penjualan?"}]'
);
do $$
begin
  if not exists (select 1 from public.business_period_costs where cost_of_goods = 0 and operating_cost is null) then
    raise exception 'HPP nol dan biaya kosong perlu tetap berbeda';
  end if;
  update public.business_conversations set version = 2 where id = '20000000-0000-4000-8000-000000000041' and version = 1;
  if not found then raise exception 'Versi awal perlu dapat diubah'; end if;
  update public.business_conversations set version = 2 where id = '20000000-0000-4000-8000-000000000041' and version = 1;
  if found then raise exception 'Versi kedaluwarsa seharusnya ditolak'; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000042', true);
do $$
begin
  if exists (select 1 from public.business_conversations) or exists (select 1 from public.business_period_costs) then
    raise exception 'Akun Beta seharusnya tidak membaca biaya dan percakapan Alfa';
  end if;
  if has_table_privilege('authenticated', 'public.business_conversations', 'UPDATE')
    or has_table_privilege('authenticated', 'public.business_period_costs', 'INSERT') then
    raise exception 'Penulisan langsung oleh akun seharusnya dibatasi';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000041', true);
do $$
begin
  if (select count(*) from public.business_conversations) <> 1 or
     (select count(*) from public.business_period_costs) <> 1 then
    raise exception 'Akun Alfa seharusnya dapat membaca catatannya';
  end if;
end;
$$;

rollback;
