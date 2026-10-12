-- Claim/assign return an assignment, not a work item. Keep the audit in the same transaction.
begin;
do $assignment$
declare original text; patched text; marker text := 'elsif new.result_type=''work_item_result'' then';
begin
 select pg_get_functiondef(p.oid) into original from pg_proc p where p.pronamespace='private'::regnamespace and p.proname='audit_source_command_receipt';
 if original is null or position(marker in original)=0 then raise exception 'work_receipt_audit_contract_missing';end if;
 patched:=replace(original,marker,'elsif new.result_type=''work_item_assignment'' then
  select w.branch_id into b from public.work_item_assignments a join public.work_items w on w.id=a.work_item_id where a.id=new.result_entity_id;
 '||marker);
 execute patched;
end $assignment$;
revoke all on function private.audit_source_command_receipt() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
