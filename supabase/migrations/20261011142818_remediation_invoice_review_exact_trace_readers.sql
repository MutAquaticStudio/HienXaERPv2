begin;
create or replace view public.invoice_intent_read with(security_invoker=true) as
 SELECT id,
    branch_id,
    source_obligation_id,
    source_type,
    source_id,
    source_amount_vnd::text AS source_amount_vnd,
    customer_name_snapshot,
    billing_verified_at,
    invoice_due_at,
    status,
    provider_state,
    legal_invoice_number,
    issued_at,
    created_at,
    version,
    policy_state,
    create_operation_id
   FROM invoice_intents;;
notify pgrst,'reload schema';
commit;
