begin;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

insert into public.businesses (owner_id, name) values
  ('00000000-0000-4000-8000-000000000001', 'Usaha Alfa');

do $$
begin
  begin
    insert into public.businesses (owner_id, name) values
      ('00000000-0000-4000-8000-000000000002', 'Usaha tanpa izin');
    raise exception 'Pemilik lain seharusnya ditolak';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.import_runs;
    raise exception 'Berkas sementara seharusnya tidak dapat dibaca pengguna';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('authenticated', 'public.ramu_activate_import(uuid,uuid,uuid,boolean)', 'execute') or
     has_function_privilege('authenticated', 'public.ramu_set_source_paused(uuid,uuid,uuid,boolean)', 'execute') then
    raise exception 'Mutasi sumber langsung seharusnya ditolak';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
insert into public.businesses (owner_id, name) values
  ('00000000-0000-4000-8000-000000000002', 'Usaha Beta');

set local role service_role;

do $$
declare
  alfa constant uuid := '00000000-0000-4000-8000-000000000001';
  beta constant uuid := '00000000-0000-4000-8000-000000000002';
  biz uuid := (select id from public.businesses where owner_id = alfa);
  run_a uuid := gen_random_uuid();
  run_b uuid := gen_random_uuid();
  run_c uuid := gen_random_uuid();
  run_d uuid := gen_random_uuid();
  run_e uuid := gen_random_uuid();
  run_f uuid := gen_random_uuid();
  rev_a uuid;
  rev_b uuid;
  rev_c uuid;
  same_source uuid;
  draft jsonb := '{
    "name":"penjualan.csv", "kind":"csv", "from":"2026-11-01", "through":"2026-11-17",
    "sales":70000, "orders":1, "products":false, "basis":"line", "timezone":"Asia/Jakarta", "mapping":{},
    "facts":[{"row":2,"date":"2026-11-17","order_id":"0001","status":"completed","revenue":70000}]
  }';
begin
  perform public.ramu_stage_import(alfa, biz, null, run_a, draft);
  perform public.ramu_stage_import(alfa, biz, null, run_b, draft);
  if (select active_revision_id from public.businesses where id = biz) is not null then
    raise exception 'Pratinjau seharusnya belum aktif';
  end if;
  begin
    perform public.ramu_activate_import(beta, biz, run_a, true);
    raise exception 'Akun Beta seharusnya tidak dapat mengaktifkan impor Alfa';
  exception when insufficient_privilege then null;
  end;
  rev_a := public.ramu_activate_import(alfa, biz, run_a, false);
  if rev_a is distinct from public.ramu_activate_import(alfa, biz, run_a, false) then
    raise exception 'Konfirmasi ulang seharusnya menghasilkan revisi yang sama';
  end if;
  begin
    perform public.ramu_activate_import(alfa, biz, run_b, false);
    raise exception 'Pratinjau tertinggal seharusnya ditolak';
  exception when sqlstate 'PT409' then null;
  end;
  perform public.ramu_stage_import(alfa, biz, rev_a, run_c, draft);
  perform public.ramu_cancel_import(alfa, biz, run_c);
  begin
    perform public.ramu_activate_import(alfa, biz, run_c, false);
    raise exception 'Impor batal seharusnya ditolak';
  exception when sqlstate 'PT410' then null;
  end;
  perform public.ramu_stage_import(alfa, biz, rev_a, run_d,
    jsonb_set(draft, '{facts}', (draft -> 'facts') || (draft -> 'facts')));
  begin
    perform public.ramu_activate_import(alfa, biz, run_d, false);
    raise exception 'Fakta ganda seharusnya gagal disimpan';
  exception when unique_violation then null;
  end;
  if (select count(*) from public.sales_revisions where business_id = biz) <> 1 or
     (select count(*) from public.data_sources where business_id = biz) <> 1 or
     (select active_revision_id from public.businesses where id = biz) is distinct from rev_a then
    raise exception 'Kegagalan seharusnya tidak mengubah revisi, sumber, atau pointer';
  end if;
  perform public.ramu_stage_import(alfa, biz, rev_a, run_e, jsonb_set(draft, '{from}', '"2026-11-10"'));
  begin
    perform public.ramu_activate_import(alfa, biz, run_e, false);
    raise exception 'Cakupan yang berkurang harus dikonfirmasi';
  exception when sqlstate 'PT422' then null;
  end;
  rev_b := public.ramu_activate_import(alfa, biz, run_e, true);
  if rev_a = rev_b or (select active_revision_id from public.businesses where id = biz) is distinct from rev_b then
    raise exception 'Revisi baru seharusnya menjadi sumber aktif';
  end if;
  if public.ramu_activate_import(alfa, biz, run_a, true) is distinct from rev_a or
     (select active_revision_id from public.businesses where id = biz) is distinct from rev_b then
    raise exception 'Retry impor lama seharusnya tidak mengembalikan pointer';
  end if;

  select source_id into same_source from public.sales_revisions where id = rev_b;
  if same_source = (select source_id from public.sales_revisions where id = rev_a) then
    raise exception 'Penggantian harus menghasilkan sumber baru';
  end if;
  begin
    perform public.ramu_set_source_paused(beta, biz, rev_b, true);
    raise exception 'Akun lain tidak boleh menonaktifkan sumber';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ramu_set_source_paused(alfa, biz, rev_a, true);
    raise exception 'Status dari halaman lama tidak boleh menimpa sumber aktif';
  exception when sqlstate 'PT409' then null;
  end;
  perform public.ramu_stage_import(alfa, biz, rev_b, run_f, draft || '{"operation":"update","name":"penjualan-baru.csv"}');
  perform public.ramu_set_source_paused(alfa, biz, rev_b, true);
  begin
    perform public.ramu_activate_import(alfa, biz, run_f, false);
    raise exception 'Pembaruan sumber nonaktif harus ditolak';
  exception when sqlstate 'PT423' then null;
  end;
  if (select active_revision_id from public.businesses where id = biz) is distinct from rev_b or
     (select paused_at from public.data_sources where id = same_source) is null then
    raise exception 'Sumber nonaktif harus mempertahankan revisi terakhir';
  end if;
  perform public.ramu_set_source_paused(alfa, biz, rev_b, false);
  rev_c := public.ramu_activate_import(alfa, biz, run_f, false);
  if (select source_id from public.sales_revisions where id = rev_c) is distinct from same_source or
     (select file_name from public.sales_revisions where id = rev_c) is distinct from 'penjualan-baru.csv' or
     (select file_name from public.sales_revisions where id = rev_b) is distinct from 'penjualan.csv' then
    raise exception 'Pembaruan harus menjaga identitas sumber dan nama file setiap revisi';
  end if;
end;
$$;

set local role authenticated;

do $$
begin
  if (select count(*) from public.businesses) <> 1 or
     exists (select 1 from public.sales_revisions) or
     exists (select 1 from public.sales_facts) or
     exists (select 1 from public.data_sources) then
    raise exception 'Akun Beta seharusnya hanya melihat usaha sendiri';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

do $$
begin
  if (select count(*) from public.businesses) <> 1 or
     (select count(*) from public.sales_revisions) <> 3 or
     (select count(*) from public.sales_facts where order_id = '0001') <> 3 then
    raise exception 'Akun Alfa seharusnya dapat membaca data sendiri';
  end if;
end;
$$;

rollback;
