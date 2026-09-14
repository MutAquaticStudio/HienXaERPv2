-- purchase_order_read is a security-invoker view and aggregates this table.
-- RLS still limits visible rows through purchase_order_lines_select.
revoke all on table public.purchase_order_lines from anon;
grant select on table public.purchase_order_lines to authenticated;
