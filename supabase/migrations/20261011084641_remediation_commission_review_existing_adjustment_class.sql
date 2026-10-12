-- Use the existing OPEX ADJUSTMENT contract; the linked unpaid commission supplies its debt source.
begin;
create or replace function public.resolve_commission_reconciliation(target_case_id uuid,resolution_kind text,
 target_unpaid_earning_id uuid,target_adjustment_rule_id uuid,expected_earning_version integer,
 resolution_reason text,operation_id uuid) returns uuid
 language plpgsql security definer set search_path='' as $resolve$
declare c public.commission_reconciliation_cases%rowtype; target public.earning_events%rowtype; rule public.compensation_rules%rowtype;
 receipt public.command_receipts%rowtype; hash text; resolution_id uuid:=gen_random_uuid(); basis uuid; adjustment uuid; payable uuid;
begin
 select * into c from public.commission_reconciliation_cases where id=target_case_id for update;
 if c.id is null or not private.has_permission(c.branch_id,'compensation.manage')
 then raise exception 'forbidden_or_commission_case_not_found' using errcode='42501';end if;
 if operation_id is null or resolution_kind not in('WAIVE','RECOVER_UNPAID_COMMISSION')
  or coalesce(length(trim(resolution_reason)),0) not between 3 and 500 then raise exception 'invalid_commission_resolution' using errcode='22023';end if;
 hash:=private.command_payload_hash(jsonb_build_object('case',target_case_id,'kind',resolution_kind,'earning',target_unpaid_earning_id,
  'rule',target_adjustment_rule_id,'version',expected_earning_version,'reason',trim(resolution_reason)));
 perform pg_advisory_xact_lock(hashtextextended(operation_id::text,0));
 select * into receipt from public.command_receipts r where r.operation_id=resolve_commission_reconciliation.operation_id;
 if found then
  if receipt.command_name<>'resolve_commission_reconciliation' or receipt.payload_hash<>hash or receipt.actor_auth_user_id is distinct from auth.uid()
  then raise exception 'operation_payload_conflict' using errcode='23505';end if;return receipt.result_entity_id;
 end if;
 if exists(select 1 from public.commission_review_resolutions where case_id=c.id)
 then raise exception 'commission_case_already_resolved' using errcode='55000';end if;
 if resolution_kind='WAIVE' then
  if not private.operational_owner(c.branch_id) or target_unpaid_earning_id is not null or target_adjustment_rule_id is not null or expected_earning_version is not null
  then raise exception 'commission_waiver_requires_owner' using errcode='42501';end if;
 else
  if not private.has_permission(c.branch_id,'compensation.approve') then raise exception 'commission_recovery_approval_required' using errcode='42501';end if;
  select * into target from public.earning_events where id=target_unpaid_earning_id for update;
  if target.id is null or target.branch_id<>c.branch_id or target.employee_id<>c.employee_id or target.classification<>'SALES_COMMISSION'
   or target.approval_state<>'APPROVED' or target.approved_amount_vnd<=0
  then raise exception 'commission_recovery_source_mismatch' using errcode='23514';end if;
  if target.version is distinct from expected_earning_version then raise exception 'commission_recovery_version_conflict' using errcode='PT409';end if;
  select id into payable from public.payable_obligations where earning_event_id=target.id for update;
  if payable is null or private.current_payable_outstanding(payable)<c.reduction_amount_vnd
  then raise exception 'commission_recovery_exceeds_unpaid' using errcode='23514';end if;
  select * into rule from public.compensation_rules where id=target_adjustment_rule_id;
  if rule.id is null or rule.branch_id<>c.branch_id or rule.earning_type<>'ADJUSTMENT' or rule.calculation_kind<>'FIXED_PER_BASIS'
   or rule.rate_vnd_per_unit<>1 or rule.classification<>'OPEX'
   or(rule.employee_id is not null and rule.employee_id<>c.employee_id)
  then raise exception 'commission_recovery_adjustment_rule_required' using errcode='23514';end if;
  basis:=public.record_compensation_basis(c.branch_id,c.employee_id,'ADJUSTMENT',-c.reduction_amount_vnd::numeric,
   current_date,current_date,trim(resolution_reason),target.id,null,gen_random_uuid());
  adjustment:=public.calculate_earning_event(rule.id,'MANUAL_BASIS',basis,gen_random_uuid());
  perform public.approve_earning_event(adjustment,-c.reduction_amount_vnd,current_date,1,gen_random_uuid());
 end if;
 insert into public.commission_review_resolutions(id,case_id,branch_id,employee_id,resolution_kind,reduction_amount_vnd,
  target_earning_event_id,adjustment_earning_event_id,reason,recorded_by)
 values(resolution_id,c.id,c.branch_id,c.employee_id,resolution_kind,c.reduction_amount_vnd,target_unpaid_earning_id,adjustment,trim(resolution_reason),auth.uid());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
 values(auth.uid(),c.branch_id,'commission.review_resolved','commission_review_resolution',resolution_id,operation_id,
  array['source_case','resolution','unpaid_commission_adjustment'],trim(resolution_reason));
 insert into public.command_receipts values(operation_id,auth.uid(),'resolve_commission_reconciliation',hash,'commission_review_resolution',resolution_id,now());
 return resolution_id;
end $resolve$;
revoke all on function public.resolve_commission_reconciliation(uuid,text,uuid,uuid,integer,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.resolve_commission_reconciliation(uuid,text,uuid,uuid,integer,text,uuid) to authenticated;
commit;
