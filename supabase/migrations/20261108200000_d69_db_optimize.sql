-- D69: database tuning from the Supabase performance advisor and the real hot paths. Forward-only, no data change.
-- (1) Four AI policies evaluated auth.uid() once per row; (select auth.uid()) makes it one evaluation per query.
-- (2) Indexes on the foreign keys that lists and detail pages look up by (customer, supplier, material, warehouse, order, shift).
--     Only look-up keys: the audit columns (created_by, updated_by, …) are never filtered on and would only slow writes down.
begin;

alter policy ai_actions_own on public.ai_actions using (auth_user_id = (select auth.uid()));
alter policy ai_chat_messages_own on public.ai_chat_messages using (auth_user_id = (select auth.uid()));
alter policy ai_proposals_read on public.ai_proposals using (private.has_permission(branch_id, 'ai.manage') or created_by = (select auth.uid()));
alter policy ai_usage_log_read on public.ai_usage_log using (private.has_permission(branch_id, 'ai.manage') or user_id = (select auth.uid()));

create index if not exists sales_orders_customer_idx on public.sales_orders(customer_id);
create index if not exists sales_orders_site_idx on public.sales_orders(site_id);
create index if not exists sales_order_lines_material_idx on public.sales_order_lines(material_id);
create index if not exists deliveries_customer_idx on public.deliveries(customer_id);
create index if not exists delivery_lines_material_idx on public.delivery_lines(material_id);
create index if not exists inventory_movements_material_idx on public.inventory_movements(material_id);
create index if not exists inventory_movements_warehouse_idx on public.inventory_movements(warehouse_id);
create index if not exists inventory_reservations_material_idx on public.inventory_reservations(material_id);
create index if not exists inventory_reservations_order_line_idx on public.inventory_reservations(sales_order_line_id);
create index if not exists payments_customer_idx on public.payments(customer_id);
create index if not exists payments_supplier_idx on public.payments(supplier_id);
create index if not exists payments_account_idx on public.payments(account_id);
create index if not exists expenses_supplier_idx on public.expenses(supplier_id);
create index if not exists expenses_customer_idx on public.expenses(customer_id);
create index if not exists expenses_sales_order_idx on public.expenses(sales_order_id);
create index if not exists payable_obligations_supplier_idx on public.payable_obligations(supplier_id);
create index if not exists purchase_orders_supplier_idx on public.purchase_orders(supplier_id);
create index if not exists purchase_orders_warehouse_idx on public.purchase_orders(warehouse_id);
create index if not exists purchase_order_lines_material_idx on public.purchase_order_lines(material_id);
create index if not exists purchase_receipts_order_idx on public.purchase_receipts(purchase_order_id);
create index if not exists purchase_receipt_lines_order_line_idx on public.purchase_receipt_lines(purchase_order_line_id);
create index if not exists supplier_documents_supplier_idx on public.supplier_documents(supplier_id);
create index if not exists quotations_customer_idx on public.quotations(customer_id);
create index if not exists service_jobs_customer_idx on public.service_jobs(customer_id);
create index if not exists earning_events_order_idx on public.earning_events(sales_order_id);
create index if not exists earning_events_employee_idx on public.earning_events(employee_id);
create index if not exists attendance_records_shift_idx on public.attendance_records(shift_id);
create index if not exists shift_assignments_shift_idx on public.shift_assignments(shift_id);

notify pgrst, 'reload schema';
commit;
