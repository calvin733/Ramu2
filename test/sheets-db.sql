begin;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000031'),
  ('00000000-0000-4000-8000-000000000032');
insert into public.businesses (owner_id, name) values
  ('00000000-0000-4000-8000-000000000031', 'Google Alfa'),
  ('00000000-0000-4000-8000-000000000032', 'Google Beta');

set local role service_role;

do $$
declare
  alfa constant uuid := '00000000-0000-4000-8000-000000000031';
  biz uuid := (select id from public.businesses where owner_id = alfa);
  first_run uuid := gen_random_uuid();
  next_run uuid := gen_random_uuid();
  run uuid;
  first_revision uuid;
  updated_revision uuid;
  first_source uuid;
  invalid jsonb;
  draft jsonb := '{
    "kind":"google_sheets", "name":"Penjualan November", "sheet":"Transaksi",
    "spreadsheetId":"sheet_fixture_ABC123", "sheetId":0, "operation":"replace",
    "from":"2026-11-01", "through":"2026-11-17", "basis":"line", "timezone":"Asia/Jakarta",
    "sales":50000, "orders":1, "products":false, "mapping":{},
    "facts":[{"row":2,"date":"2026-11-17","order_id":"0001","status":"completed","revenue":50000}]
  }';
begin
  perform public.ramu_stage_import(alfa, biz, null, first_run, draft);
  first_revision := public.ramu_activate_import(alfa, biz, first_run, false);
  select source_id into strict first_source from public.sales_revisions where id = first_revision;
  if not exists (
    select 1 from public.data_sources where id = first_source and kind = 'google_sheets'
      and spreadsheet_id = 'sheet_fixture_ABC123' and sheet_id = 0
  ) then
    raise exception 'Identitas spreadsheet dan tab belum tersimpan';
  end if;

  draft := draft || '{"operation":"update","sheet":"Tab yang diubah namanya"}';
  foreach invalid in array array['{"sheetId":42}'::jsonb, '{"spreadsheetId":"sheet_fixture_OTHER"}'::jsonb] loop
    run := gen_random_uuid();
    perform public.ramu_stage_import(alfa, biz, first_revision, run, draft || invalid);
    begin
      perform public.ramu_activate_import(alfa, biz, run, true);
      raise exception 'Pembaruan ke spreadsheet atau tab lain seharusnya ditolak';
    exception when sqlstate 'PT409' then null;
    end;
  end loop;

  perform public.ramu_stage_import(alfa, biz, first_revision, next_run, draft);
  perform public.ramu_set_source_paused(alfa, biz, first_revision, true);
  begin
    perform public.ramu_activate_import(alfa, biz, next_run, false);
    raise exception 'Pembaruan sumber nonaktif seharusnya ditolak';
  exception when sqlstate 'PT423' then null;
  end;
  if (select active_revision_id from public.businesses where id = biz) is distinct from first_revision then
    raise exception 'Revisi aktif berubah setelah pembaruan yang gagal';
  end if;

  perform public.ramu_set_source_paused(alfa, biz, first_revision, false);
  updated_revision := public.ramu_activate_import(alfa, biz, next_run, false);
  if first_revision = updated_revision
    or updated_revision is distinct from public.ramu_activate_import(alfa, biz, next_run, false)
    or not exists (select 1 from public.sales_revisions where id = updated_revision and source_id = first_source)
    or (select file_sheet from public.sales_revisions where id = first_revision) <> 'Transaksi'
    or (select file_sheet from public.sales_revisions where id = updated_revision) <> 'Tab yang diubah namanya'
    or exists (select 1 from public.import_runs where id = next_run and payload is not null) then
    raise exception 'Pembaruan perlu menjaga sumber, jejak revisi, dan aktivasi idempotent';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000032', true);
do $$
begin
  if exists (select 1 from public.data_sources where spreadsheet_id = 'sheet_fixture_ABC123') then
    raise exception 'Identitas spreadsheet milik Alfa terbaca oleh Beta';
  end if;
end;
$$;

rollback;
