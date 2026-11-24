begin;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000012');
insert into public.businesses (id, owner_id, name) values
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000011', 'Usaha Target Alfa'),
  ('00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000012', 'Usaha Target Beta');

set local role service_role;

do $$
declare
  owner_id constant uuid := '00000000-0000-4000-8000-000000000011';
  other_id constant uuid := '00000000-0000-4000-8000-000000000012';
  business_id constant uuid := '00000000-0000-4000-8000-000000000013';
  revenue_id constant uuid := '00000000-0000-4000-8000-000000000015';
  orders_id constant uuid := '00000000-0000-4000-8000-000000000016';
  gross_id constant uuid := '00000000-0000-4000-8000-000000000017';
  net_id constant uuid := '00000000-0000-4000-8000-000000000018';
begin
  perform public.ramu_save_target(owner_id, business_id, revenue_id, null, 'revenue', 30000000, '2026-11-01', '2026-11-30', null, true);
  perform public.ramu_save_target(owner_id, business_id, orders_id, null, 'orders', 400, '2026-11-01', '2026-11-30', 10, true);
  perform public.ramu_save_target(owner_id, business_id, gross_id, null, 'gross-profit', 12000000, '2026-11-01', '2026-11-30', 0, false);
  perform public.ramu_save_target(owner_id, business_id, net_id, null, 'net-profit', 8000000, '2026-11-01', '2026-11-30', null, false);
  perform public.ramu_save_target(owner_id, business_id, revenue_id, null, 'revenue', 30000000, '2026-11-01', '2026-11-30', null, true);
  if (select count(*) from public.business_targets where is_primary) <> 1 or
     (select is_primary from public.business_targets where id = orders_id) is not true or
     (select count(*) from public.business_targets) <> 4 then
    raise exception 'Target utama harus tunggal dan pengulangan tidak boleh mengubahnya';
  end if;
  begin
    perform public.ramu_save_target(owner_id, business_id, revenue_id, 1, 'revenue', 25000000, '2026-11-01', '2026-11-30', null, false);
    raise exception 'Perubahan versi lama seharusnya ditolak';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.ramu_save_target(other_id, business_id, orders_id, 1, 'orders', 1, '2026-11-01', '2026-11-30', null, false);
    raise exception 'Perubahan lintas usaha seharusnya ditolak';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ramu_save_target(owner_id, business_id, gross_id, 1, 'gross-profit', 0, '2026-11-01', '2026-11-30', null, true);
    raise exception 'Target nol seharusnya ditolak';
  exception when check_violation then null;
  end;
  if (select is_primary from public.business_targets where id = orders_id) is not true then
    raise exception 'Kegagalan penyimpanan seharusnya menjaga target utama';
  end if;
  perform public.ramu_save_target(owner_id, business_id, orders_id, 1, 'orders', 450, '2026-11-01', '2026-11-30', 0, true);
  if (select amount from public.business_targets where id = orders_id) <> 450 then
    raise exception 'Target perubahan seharusnya tersimpan';
  end if;
  perform public.ramu_delete_target(owner_id, business_id, net_id, 1);
  perform public.ramu_delete_target(owner_id, business_id, net_id, 1);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000012', true);
do $$
begin
  if exists (select 1 from public.business_targets) or
     has_table_privilege('authenticated', 'public.business_targets', 'insert,update,delete') or
     has_function_privilege('authenticated', 'public.ramu_delete_target(uuid,uuid,uuid,integer)', 'execute') then
    raise exception 'Akun lain seharusnya tidak dapat membaca atau menulis target';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000011', true);
do $$
begin
  if (select count(*) from public.business_targets) <> 3 then
    raise exception 'Pemilik seharusnya dapat membaca target tersimpan';
  end if;
end;
$$;

rollback;
