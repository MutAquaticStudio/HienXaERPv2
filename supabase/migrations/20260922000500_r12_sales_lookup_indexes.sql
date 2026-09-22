-- Support bounded customer and per-customer site options.
create index if not exists customers_branch_name_id_idx
  on public.customers (branch_id, display_name, id);

create index if not exists customer_sites_customer_name_id_idx
  on public.customer_sites (customer_id, name, id);
