-- Credit exposure is unpaid AR plus unconsumed commitments, not original AR.
create or replace view public.customer_credit_exposure
with (security_invoker = true)
as
select
  c.id as customer_id,
  c.branch_id,
  c.credit_limit_vnd,
  coalesce(ar.receivable_vnd, 0)::bigint as receivable_vnd,
  coalesce(cc.committed_vnd, 0)::bigint as committed_vnd,
  (coalesce(ar.receivable_vnd, 0) + coalesce(cc.committed_vnd, 0))::bigint as exposure_vnd,
  case when c.credit_limit_vnd is null then null
       else (c.credit_limit_vnd::numeric - coalesce(ar.receivable_vnd, 0) - coalesce(cc.committed_vnd, 0))::bigint
  end as available_vnd
from public.customers c
left join lateral (
  select sum(greatest(
    o.original_amount_vnd::numeric + coalesce(adj.amount_vnd, 0) - coalesce(alloc.amount_vnd, 0),
    0
  )) as receivable_vnd
  from public.receivable_obligations o
  left join lateral (
    select sum(a.amount_delta_vnd) as amount_vnd
    from public.receivable_adjustments a
    where a.obligation_id = o.id
  ) adj on true
  left join lateral (
    select sum(a.amount_delta_vnd) as amount_vnd
    from public.payment_allocations a
    where a.receivable_obligation_id = o.id
  ) alloc on true
  where o.customer_id = c.id
) ar on true
left join lateral (
  select sum(amount_vnd - consumed_vnd - released_vnd) as committed_vnd
  from public.credit_commitments
  where customer_id = c.id
) cc on true;

-- Both reservation paths must use the same net AR balance as the exposure view.
create or replace function private.reserve_fixture_credit(
  target_customer_id uuid,
  target_branch_id uuid,
  requested_amount_vnd bigint,
  fixture_source_key text,
  actor_auth_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_limit bigint;
  current_exposure bigint;
  existing public.credit_commitments%rowtype;
  commitment_id uuid;
begin
  if requested_amount_vnd <= 0 then
    raise exception 'credit_amount_must_be_positive' using errcode = '22023';
  end if;

  select * into existing from public.credit_commitments
  where source_type = 'LOCAL_FIXTURE' and source_key = fixture_source_key;
  if found then
    if existing.customer_id <> target_customer_id or existing.branch_id <> target_branch_id or existing.amount_vnd <> requested_amount_vnd then
      raise exception 'credit_source_payload_conflict' using errcode = '23505';
    end if;
    return existing.id;
  end if;

  select credit_limit_vnd into customer_limit
  from public.customers
  where id = target_customer_id and branch_id = target_branch_id and active
  for update;

  if not found then raise exception 'customer_not_found_in_branch' using errcode = '23503'; end if;
  if customer_limit is null then raise exception 'credit_limit_not_approved' using errcode = '23514'; end if;

  if exists (
    select 1 from public.receivable_obligations o
    where o.customer_id = target_customer_id and o.due_date < current_date
      and private.current_receivable_outstanding(o.id) > 0
  ) then
    raise exception 'overdue_receivable_blocks_credit' using errcode = '23514';
  end if;

  select coalesce(exposure_vnd, 0) into current_exposure
  from public.customer_credit_exposure where customer_id = target_customer_id;
  if current_exposure + requested_amount_vnd > customer_limit then
    raise exception 'credit_limit_exceeded' using errcode = '23514';
  end if;

  insert into public.credit_commitments(branch_id, customer_id, source_type, source_key, amount_vnd, created_by)
  values (target_branch_id, target_customer_id, 'LOCAL_FIXTURE', fixture_source_key, requested_amount_vnd, actor_auth_user_id)
  returning id into commitment_id;
  return commitment_id;
end
$$;
revoke all on function private.reserve_fixture_credit(uuid, uuid, bigint, text, uuid) from public, anon, authenticated;

create or replace function private.reserve_sales_order_credit(target_order_id uuid, actor_auth_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare order_row public.sales_orders%rowtype; total bigint; limit_value bigint; exposure bigint; existing public.credit_commitments%rowtype; commitment_id uuid;
begin
  select * into order_row from public.sales_orders where id = target_order_id;
  if not found then raise exception 'sales_order_not_found' using errcode = '23503'; end if;
  select coalesce(sum(line_total_vnd), 0)::bigint into total from public.sales_order_lines where sales_order_id = target_order_id;
  select * into existing from public.credit_commitments where sales_order_id = target_order_id;
  if found then if existing.amount_vnd <> total then raise exception 'credit_commitment_payload_conflict' using errcode = '23505'; end if; return existing.id; end if;
  select credit_limit_vnd into limit_value from public.customers where id = order_row.customer_id and branch_id = order_row.branch_id and active for update;
  if not found or limit_value is null then raise exception 'credit_limit_not_approved' using errcode = '23514'; end if;
  if exists (
    select 1 from public.receivable_obligations o
    where o.customer_id = order_row.customer_id and o.due_date < current_date
      and private.current_receivable_outstanding(o.id) > 0
  ) then
    raise exception 'overdue_receivable_blocks_credit' using errcode = '23514';
  end if;
  select coalesce(exposure_vnd, 0) into exposure from public.customer_credit_exposure where customer_id = order_row.customer_id;
  if exposure + total > limit_value then raise exception 'credit_limit_exceeded' using errcode = '23514'; end if;
  insert into public.credit_commitments(branch_id, customer_id, source_type, source_key, sales_order_id, amount_vnd, created_by)
  values (order_row.branch_id, order_row.customer_id, 'SALES_ORDER', target_order_id::text, target_order_id, total, actor_auth_user_id)
  returning id into commitment_id;
  return commitment_id;
end
$$;
revoke all on function private.reserve_sales_order_credit(uuid, uuid) from public, anon, authenticated;
