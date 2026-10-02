-- Preserve query results, RLS, financial calculations and append-only ledgers.
-- Match quotation_read branch filtering and its deterministic newest-first page.
create index if not exists quotations_branch_created_id_idx
  on public.quotations (branch_id, created_at desc, id desc);

-- customer_credit_exposure restricts these child relations by customer_id.
-- Branch-leading and document-source unique indexes cannot cover that prefix.
create index if not exists receivable_obligations_customer_id_idx
  on public.receivable_obligations (customer_id);

create index if not exists credit_commitments_customer_id_idx
  on public.credit_commitments (customer_id);
