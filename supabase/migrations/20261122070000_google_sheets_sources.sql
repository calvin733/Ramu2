begin;

alter table public.data_sources
  drop constraint data_sources_kind_check,
  add column spreadsheet_id text,
  add column sheet_id integer,
  add constraint data_sources_kind_check check (kind in ('csv', 'xlsx', 'google_sheets')),
  add constraint data_sources_sheet_identity check (
    (kind = 'google_sheets' and spreadsheet_id is not null and spreadsheet_id ~ '^[A-Za-z0-9_-]{10,200}$' and sheet_id is not null and sheet_id >= 0)
    or (kind <> 'google_sheets' and spreadsheet_id is null and sheet_id is null)
  );

create or replace function public.ramu_activate_import(p_owner uuid, p_business uuid, p_run uuid, p_accept_reduced_coverage boolean)
returns uuid language plpgsql set search_path = '' as $$
declare
  run public.import_runs%rowtype;
  prior public.sales_revisions%rowtype;
  prior_source public.data_sources%rowtype;
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
  select * into run from public.import_runs where id = p_run and business_id = p_business for update;
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

  if run.payload ->> 'operation' = 'update' then
    if live_revision is null then raise exception using errcode = 'PT409', message = 'revision_changed'; end if;
    select * into strict prior_source from public.data_sources where business_id = p_business and id = prior.source_id;
    if prior_source.paused_at is not null then
      raise exception using errcode = 'PT423', message = 'source_paused';
    end if;
    if prior_source.kind is distinct from run.payload ->> 'kind' then
      raise exception using errcode = 'PT409', message = 'source_format_changed';
    end if;
    if prior_source.kind = 'google_sheets' and (
      prior_source.spreadsheet_id is distinct from run.payload ->> 'spreadsheetId'
      or prior_source.sheet_id is distinct from (run.payload ->> 'sheetId')::integer
    ) then
      raise exception using errcode = 'PT409', message = 'spreadsheet_changed';
    end if;
    source := prior_source.id;
  else
    insert into public.data_sources (business_id, kind, name, sheet, spreadsheet_id, sheet_id)
      values (
        p_business, run.payload ->> 'kind', run.payload ->> 'name', run.payload ->> 'sheet',
        run.payload ->> 'spreadsheetId', (run.payload ->> 'sheetId')::integer
      )
      returning id into source;
  end if;

  insert into public.sales_revisions (
    business_id, source_id, import_run_id, covered_from, covered_through, total_sales, order_count, product_available, basis, mapping, file_name, file_sheet
  ) values (
    p_business, source, p_run, starts, ends, (run.payload ->> 'sales')::bigint, (run.payload ->> 'orders')::integer,
    (run.payload ->> 'products')::boolean, run.payload ->> 'basis', run.payload -> 'mapping',
    run.payload ->> 'name', run.payload ->> 'sheet'
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

commit;
