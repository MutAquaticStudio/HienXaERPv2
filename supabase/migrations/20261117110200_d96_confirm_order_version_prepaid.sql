-- D96 (Owner 16/11/2026 "Ok giờ hãy fix các điểm chú ý"), confirming a sales order:
-- * S3 (c): private.reserve_sales_order_credit (latest body 20261117110000) subtracts the customer's unused paid money
--   (private.customer_advance_available: the remaining of every customer advance not reversed, capped by what its receipt
--   still has) from the exposure. A customer without an approved limit is still refused (`credit_limit_not_approved`, rule
--   unchanged, Owner question pending) unless that money covers the whole exposure with this order — then the order is not on
--   credit. The commitment is still held for the full order amount (verification consumes it; D96 allocates the prepayment).
-- * S5: public.confirm_sales_order(target_order_id, expected_draft_version, operation_id) refuses an order whose draft was
--   changed since the screen was loaded (`sales_order_confirm_stale_version`, PT409). The command receipt and its payload hash
--   are unchanged, so a retried operation still replays. The old (target_order_id, operation_id) form stays only for database
--   callers (portal auto-approve D79/D88 confirm the version they just read): it passes the current draft version and is no
--   longer executable by API callers.
begin;

create or replace function private.customer_advance_available(target_customer_id uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(greatest(least(private.advance_remaining(a.id), private.payment_available(a.payment_id)), 0)), 0)::bigint
  from public.advances a
  where a.customer_id = target_customer_id and a.advance_side = 'CUSTOMER' and a.reversal_of_advance_id is null
$$;
revoke all on function private.customer_advance_available(uuid) from public, anon, authenticated, service_role;

create or replace function private.reserve_sales_order_credit(target_order_id uuid, actor_auth_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare order_row public.sales_orders%rowtype; total bigint; limit_value bigint; exposure bigint; covered bigint; existing public.credit_commitments%rowtype; commitment_id uuid;
begin
  select * into order_row from public.sales_orders where id = target_order_id;
  if not found then raise exception 'sales_order_not_found' using errcode = '23503'; end if;
  select coalesce(sum(line_total_vnd), 0)::bigint into total from public.sales_order_lines where sales_order_id = target_order_id;
  select * into existing from public.credit_commitments where sales_order_id = target_order_id;
  if found then if existing.amount_vnd <> total then raise exception 'credit_commitment_payload_conflict' using errcode = '23505'; end if; return existing.id; end if;
  select credit_limit_vnd into limit_value from public.customers where id = order_row.customer_id and branch_id = order_row.branch_id and active for update;
  if not found then raise exception 'credit_limit_not_approved' using errcode = '23514'; end if;
  -- D96 (S3): money the customer already paid and that is not yet used (unallocated advances, e.g. "Trả trước đơn …") is
  -- not credit (SPEC-CRE-001: exposure minus eligible prepayment). Without an approved limit, the order is confirmed only
  -- when that money covers everything the customer would owe; with a limit, it is subtracted from the exposure.
  covered := private.customer_advance_available(order_row.customer_id);
  select coalesce(exposure_vnd, 0) into exposure from public.customer_credit_exposure where customer_id = order_row.customer_id;
  exposure := coalesce(exposure, 0);
  if limit_value is null and exposure + total > covered then raise exception 'credit_limit_not_approved' using errcode = '23514'; end if;
  if exists (
    select 1 from public.receivable_obligations o
    where o.customer_id = order_row.customer_id and o.due_date < private.business_today()
      and private.current_receivable_outstanding(o.id) > 0
  ) then
    raise exception 'overdue_receivable_blocks_credit' using errcode = '23514';
  end if;
  if limit_value is not null and exposure + total - covered > limit_value then raise exception 'credit_limit_exceeded' using errcode = '23514'; end if;
  insert into public.credit_commitments(branch_id, customer_id, source_type, source_key, sales_order_id, amount_vnd, created_by)
  values (order_row.branch_id, order_row.customer_id, 'SALES_ORDER', target_order_id::text, target_order_id, total, actor_auth_user_id)
  returning id into commitment_id;
  return commitment_id;
end
$$;
revoke all on function private.reserve_sales_order_credit(uuid, uuid) from public, anon, authenticated;

create or replace function public.confirm_sales_order(target_order_id uuid, expected_draft_version integer, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare order_row public.sales_orders%rowtype; hash text; receipt public.command_receipts%rowtype; commitment_id uuid;
begin
  select * into order_row from public.sales_orders where id = target_order_id for update;
  if not private.has_permission(order_row.branch_id, 'orders.confirm') then raise exception 'forbidden' using errcode = '42501'; end if;
  hash := private.command_payload_hash(jsonb_build_object('order_id', target_order_id));
  select * into receipt from public.command_receipts where command_receipts.operation_id = confirm_sales_order.operation_id;
  if found then if receipt.command_name <> 'confirm_sales_order' or receipt.payload_hash <> hash then raise exception 'operation_payload_conflict' using errcode = '23505'; end if; return receipt.result_entity_id; end if;
  if order_row.commercial_state <> 'DRAFT' then raise exception 'sales_order_not_confirmable' using errcode = '23514'; end if;
  -- D96 (S5): confirm only the draft the person looked at.
  if expected_draft_version is null or order_row.draft_version is distinct from expected_draft_version then
    raise exception 'sales_order_confirm_stale_version' using errcode = 'PT409';
  end if;
  commitment_id := private.reserve_sales_order_credit(target_order_id, (select auth.uid()));
  update public.sales_orders set commercial_state = 'CONFIRMED', confirmed_at = now() where id = target_order_id;
  insert into public.command_receipts values (operation_id, (select auth.uid()), 'confirm_sales_order', hash, 'sales_order', target_order_id, now());
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields)
  values ((select auth.uid()), order_row.branch_id, 'sales_order.confirm', 'sales_order', target_order_id, operation_id, array['commercial_state','credit_commitment']);
  return target_order_id;
end
$$;
revoke all on function public.confirm_sales_order(uuid, integer, uuid) from public, anon;
grant execute on function public.confirm_sales_order(uuid, integer, uuid) to authenticated;

-- Database callers only (portal auto-approve): the version they act on is the current one.
create or replace function public.confirm_sales_order(target_order_id uuid, operation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  return public.confirm_sales_order(target_order_id,
    (select o.draft_version from public.sales_orders o where o.id = target_order_id), operation_id);
end
$$;
revoke all on function public.confirm_sales_order(uuid, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
