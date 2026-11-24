begin;
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
create index if not exists businesses_active_sales_revision_idx on public.businesses (id, active_revision_id) where active_revision_id is not null;
create index if not exists sales_revisions_source_idx on public.sales_revisions (business_id, source_id);
create index if not exists sales_revisions_import_run_idx on public.sales_revisions (business_id, import_run_id);
commit;
