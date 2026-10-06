-- Linked Worker proof is readable by a same-branch delivery verifier.
-- This changes no role grants, evidence management, or raw Storage access.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$
begin
  if to_regprocedure('private.portal_evidence_access(uuid,boolean)') is null
    or not exists (
      select 1 from pg_proc p
      where p.oid = 'private.portal_evidence_access(uuid,boolean)'::regprocedure
        and pg_get_userbyid(p.proowner) = 'postgres'
        and p.prosecdef and p.provolatile = 's'
        and p.proconfig = array['search_path=""']::text[]
    ) then
    raise exception 'evidence_access_precondition_mismatch' using errcode = '55000';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'delivery_results'
      and column_name = 'source_work_item_result_id'
  ) then
    raise exception 'verified_delivery_source_link_required' using errcode = '55000';
  end if;
end $$;

create or replace function private.portal_evidence_access(
  target_evidence_id uuid,
  require_ready boolean default true
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portal_evidence_objects e
    where e.id = target_evidence_id
      and (not require_ready or e.object_state = 'READY')
      and e.object_state <> 'REVOKED'
      and (
        private.has_permission(
          coalesce(
            (select w.branch_id from public.work_items w where w.id = e.work_item_id),
            (select c.branch_id from public.customers c where c.id = e.customer_id)
          ),
          'evidence.manage'
        )
        or (e.context_type = 'WORK_RESULT' and private.is_current_work_assignee(e.work_item_id))
        or (
          e.context_type = 'WORK_RESULT'
          and exists (
            select 1
            from public.work_result_portal_evidence link
            join public.work_item_results wr on wr.id = link.work_result_id
            join public.work_items w on w.id = wr.work_item_id
            join public.delivery_results dr on dr.source_work_item_result_id = wr.id
            join public.deliveries d on d.id = dr.delivery_id
            where link.evidence_id = e.id
              and wr.work_item_id = e.work_item_id
              and w.delivery_id = d.id
              and w.branch_id = d.branch_id
              and private.has_permission(d.branch_id, 'delivery.read')
              and private.has_permission(d.branch_id, 'delivery.verify')
          )
        )
        or (
          e.context_type = 'PAYMENT_NOTICE'
          and private.portal_customer_role(e.customer_id) in ('OWNER','FINANCE_CONTACT')
        )
        or (
          e.context_type = 'PAYMENT_NOTICE'
          and private.has_permission((select c.branch_id from public.customers c where c.id = e.customer_id), 'finance.payment_notice.review')
        )
      )
  )
$$;
notify pgrst, 'reload schema';
commit;

