begin;
create function public.invoice_eligible_sources_exact(target_branch_id uuid,page_size integer default 25)
 returns table(obligation_id uuid,customer_id uuid,customer_name text,source_type text,source_id uuid,source_amount_vnd text,billing_verified_at timestamptz,invoice_due_at timestamptz,policy_state text)
 language sql stable security invoker set search_path='' as $fn$
 select e.obligation_id,e.customer_id,e.customer_name,e.source_type,e.source_id,e.source_amount_vnd::text,e.billing_verified_at,e.invoice_due_at,e.policy_state from public.invoice_eligible_sources(target_branch_id,page_size)e
$fn$;
create function public.purchase_invoice_eligible_sources_exact(target_branch_id uuid,page_size integer default 25)
 returns table(obligation_id uuid,supplier_name text,source_type text,source_id uuid,source_amount_vnd text,recorded_at timestamptz)
 language sql stable security invoker set search_path='' as $fn$
 select e.obligation_id,e.supplier_name,e.source_type,e.source_id,e.source_amount_vnd::text,e.recorded_at from public.purchase_invoice_eligible_sources(target_branch_id,page_size)e
$fn$;
revoke all on function public.invoice_eligible_sources_exact(uuid,integer),public.purchase_invoice_eligible_sources_exact(uuid,integer) from public,anon;
grant execute on function public.invoice_eligible_sources_exact(uuid,integer),public.purchase_invoice_eligible_sources_exact(uuid,integer) to authenticated;
create view public.invoice_draft_line_read with(security_invoker=true) as select id,invoice_intent_id,line_number,source_line_id,description_snapshot,quantity_snapshot::text,source_amount_vnd::text from public.invoice_draft_lines;
create view public.invoice_intent_read with(security_invoker=true) as select id,branch_id,source_obligation_id,source_type,source_id,source_amount_vnd::text,customer_name_snapshot,billing_verified_at,invoice_due_at,status,provider_state,legal_invoice_number,issued_at,created_at,version from public.invoice_intents;
create view public.purchase_invoice_registry_read with(security_invoker=true) as select id,branch_id,payable_obligation_id,supplier_name_snapshot,source_type,source_id,source_amount_vnd::text,supplier_document_number,supplier_document_date,document_state,evidence_object_id,created_at from public.purchase_invoice_registry;
grant select on public.invoice_draft_line_read,public.invoice_intent_read,public.purchase_invoice_registry_read to authenticated;
notify pgrst,'reload schema';
commit;
