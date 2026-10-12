-- One-time maintenance explicitly requested by the owner on 2026-10-13.
-- Backup waived by the owner. No generated IDs are hardcoded.
-- Natural document keys were independently classified as UAT by the owner.
-- All application rows outside the exact UAT closure must remain identical.
do $cleanup$
declare
  b uuid; so uuid; pos uuid[]; sol uuid[]; pol uuid[]; allocations uuid[];
  uat_roles uuid[]; entities uuid[]; row_count integer; removed integer:=0;
  tbl record; gate record; predicate text; facts jsonb;
  retained_before jsonb:='{}'; retained_after jsonb:='{}';
  gates_before jsonb; gates_after jsonb;
begin
  perform set_config('lock_timeout','5s',true);
  perform set_config('statement_timeout','60s',true);
  perform set_config('search_path','',true);
  perform pg_advisory_xact_lock(hashtextextended('hienxa-authorized-uat-cleanup-20261013',0));
  if current_user<>'postgres' then raise exception 'maintenance_actor_required'; end if;
  if (select count(*) from supabase_migrations.schema_migrations)<>78
    or (select max(version) from supabase_migrations.schema_migrations)<>'20261009224842'
  then raise exception 'reviewed_schema78_required'; end if;
  for tbl in select n.nspname s,c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind='r' order by n.nspname,c.relname loop
    execute format('lock table %I.%I in share row exclusive mode',tbl.s,tbl.t);
  end loop;
  select id into b from public.branches where code='LUAT_PROOF_B_261008';
  select id into so from public.sales_orders where order_number='SO-2026-000013'
    and commercial_state='DRAFT' and branch_id=(select id from public.branches where code='HX');
  select array_agg(id order by id) into pos from public.purchase_orders
    where purchase_order_number in ('PO-2026-000010','PO-2026-000011','PO-2026-000012')
      and state in ('DRAFT','CANCELLED') and branch_id=(select id from public.branches where code='HX');
  select array_agg(id order by id) into sol from public.sales_order_lines where sales_order_id=so;
  select array_agg(id order by id) into pol from public.purchase_order_lines where purchase_order_id=any(pos);
  select array_agg(id order by id) into allocations from public.supply_allocations where sales_order_line_id=any(sol);
  select array_agg(id order by id) into uat_roles from public.roles where code in ('uat_sales','uat_worker');
  if b is null or so is null or cardinality(pos)<>3 or cardinality(sol)<>1
    or cardinality(pol)<>3 or cardinality(allocations)<>1 or cardinality(uat_roles)<>2
  then raise exception 'confirmed_uat_closure_changed'; end if;
  if exists(select 1 from public.employee_branch_access where role_id=any(uat_roles))
    or exists(select 1 from public.payments) or exists(select 1 from public.inventory_movements)
    or exists(select 1 from public.receivable_obligations) or exists(select 1 from public.payable_obligations)
    or exists(select 1 from public.deliveries) or exists(select 1 from public.purchase_receipts)
    or exists(select 1 from public.supplier_fulfillments)
  then raise exception 'new_operational_data_requires_recheck'; end if;
  entities:=array[so,b]||pos||sol||pol||allocations||uat_roles;
  for tbl in select n.nspname s,c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind='r' order by n.nspname,c.relname loop
    predicate:=case tbl.s||'.'||tbl.t
      when 'public.sales_orders' then format('id=%L::uuid',so)
      when 'public.purchase_orders' then format('id=any(%L::uuid[])',pos)
      when 'public.sales_order_lines' then format('id=any(%L::uuid[])',sol)
      when 'public.purchase_order_lines' then format('id=any(%L::uuid[])',pol)
      when 'public.supply_allocations' then format('id=any(%L::uuid[])',allocations)
      when 'public.command_receipts' then format('result_entity_id=any(%L::uuid[])',entities)
      when 'public.audit_events' then format('entity_id=any(%L::uuid[]) or branch_id=%L::uuid',entities,b)
      when 'private.branch_operational_states' then format('branch_id=%L::uuid',b)
      when 'public.branches' then format('id=%L::uuid',b)
      when 'public.roles' then format('id=any(%L::uuid[])',uat_roles)
      when 'public.role_permissions' then format('role_id=any(%L::uuid[])',uat_roles)
      else 'false' end;
    execute format('select jsonb_build_object(''n'',count(*),''hash'',md5(coalesce(string_agg(md5(to_jsonb(x)::text),'','' order by to_jsonb(x)::text),''''))) from %I.%I x where not coalesce((%s),false)',tbl.s,tbl.t,predicate) into facts;
    retained_before:=retained_before||jsonb_build_object(tbl.s||'.'||tbl.t,facts);
  end loop;
  select jsonb_object_agg(tgrelid::regclass::text||'.'||tgname,jsonb_build_object('enabled',tgenabled,'definition',pg_get_triggerdef(oid)))
    into gates_before from pg_trigger where not tgisinternal and (
      (tgrelid='public.purchase_order_lines'::regclass and tgname='purchase_line_guard') or
      (tgrelid='public.purchase_orders'::regclass and tgname in ('purchase_order_guard','operational_posting_guard')) or
      (tgrelid in ('public.sales_orders'::regclass,'public.supply_allocations'::regclass) and tgname='operational_posting_guard'));
  if (select count(*) from jsonb_object_keys(gates_before))<>5 or exists(select 1 from jsonb_each(gates_before) x where x.value->>'enabled'<>'O')
  then raise exception 'maintenance_trigger_prestate_changed'; end if;
  -- DELETE is intentionally blocked on ordinary purchase documents. This bounded
  -- maintenance transaction locks writes, suspends only five known guards,
  -- retains every FK and other trigger, and restores identical guards before exit.
  for gate in select key from jsonb_each(gates_before) loop
    execute format('alter table %I.%I disable trigger %I',split_part(gate.key,'.',1),split_part(gate.key,'.',2),split_part(gate.key,'.',3));
  end loop;
  delete from public.audit_events where entity_id=any(entities) or branch_id=b;
  get diagnostics row_count=row_count; if row_count<>6 then raise exception 'audit_count_changed'; end if; removed:=removed+row_count;
  delete from public.command_receipts where result_entity_id=any(entities);
  get diagnostics row_count=row_count; if row_count<>6 then raise exception 'receipt_count_changed'; end if; removed:=removed+row_count;
  delete from public.supply_allocations where id=any(allocations);
  get diagnostics row_count=row_count; if row_count<>1 then raise exception 'allocation_count_changed'; end if; removed:=removed+row_count;
  delete from public.purchase_order_lines where id=any(pol);
  get diagnostics row_count=row_count; if row_count<>3 then raise exception 'po_line_count_changed'; end if; removed:=removed+row_count;
  delete from public.purchase_orders where id=any(pos);
  get diagnostics row_count=row_count; if row_count<>3 then raise exception 'po_count_changed'; end if; removed:=removed+row_count;
  delete from public.sales_order_lines where id=any(sol);
  get diagnostics row_count=row_count; if row_count<>1 then raise exception 'so_line_count_changed'; end if; removed:=removed+row_count;
  delete from public.sales_orders where id=so;
  get diagnostics row_count=row_count; if row_count<>1 then raise exception 'so_count_changed'; end if; removed:=removed+row_count;
  delete from private.branch_operational_states where branch_id=b;
  get diagnostics row_count=row_count; if row_count<>1 then raise exception 'state_count_changed'; end if; removed:=removed+row_count;
  delete from public.branches where id=b;
  get diagnostics row_count=row_count; if row_count<>1 then raise exception 'branch_count_changed'; end if; removed:=removed+row_count;
  delete from public.role_permissions where role_id=any(uat_roles);
  get diagnostics row_count=row_count; if row_count<>9 then raise exception 'role_permission_count_changed'; end if; removed:=removed+row_count;
  delete from public.roles where id=any(uat_roles);
  get diagnostics row_count=row_count; if row_count<>2 then raise exception 'role_count_changed'; end if; removed:=removed+row_count;
  for gate in select key from jsonb_each(gates_before) loop
    execute format('alter table %I.%I enable trigger %I',split_part(gate.key,'.',1),split_part(gate.key,'.',2),split_part(gate.key,'.',3));
  end loop;
  select jsonb_object_agg(tgrelid::regclass::text||'.'||tgname,jsonb_build_object('enabled',tgenabled,'definition',pg_get_triggerdef(oid)))
    into gates_after from pg_trigger where not tgisinternal and (
      (tgrelid='public.purchase_order_lines'::regclass and tgname='purchase_line_guard') or
      (tgrelid='public.purchase_orders'::regclass and tgname in ('purchase_order_guard','operational_posting_guard')) or
      (tgrelid in ('public.sales_orders'::regclass,'public.supply_allocations'::regclass) and tgname='operational_posting_guard'));
  if gates_before is distinct from gates_after then raise exception 'maintenance_guards_not_restored'; end if;
  for tbl in select n.nspname s,c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind='r' order by n.nspname,c.relname loop
    execute format('select jsonb_build_object(''n'',count(*),''hash'',md5(coalesce(string_agg(md5(to_jsonb(x)::text),'','' order by to_jsonb(x)::text),''''))) from %I.%I x',tbl.s,tbl.t) into facts;
    retained_after:=retained_after||jsonb_build_object(tbl.s||'.'||tbl.t,facts);
  end loop;
  if removed<>34 or retained_before is distinct from retained_after then raise exception 'retained_data_changed_rollback'; end if;
  raise notice 'authorized_uat_cleanup_complete: 34 UAT rows removed; all retained application rows and five guards identical';
end $cleanup$;
