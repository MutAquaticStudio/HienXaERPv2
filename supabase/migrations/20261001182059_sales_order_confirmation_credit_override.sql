-- SPEC-CRE-002/003: one explicit, immutable decision for one SO confirmation.
-- No standing exemption, limit mutation, AR posting or inventory posting.
create table public.sales_order_credit_overrides (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null unique references public.sales_orders(id),
  branch_id uuid not null references public.branches(id),
  customer_id uuid not null references public.customers(id),
  commitment_id uuid not null unique references public.credit_commitments(id),
  operation_id uuid not null unique references public.command_receipts(operation_id),
  actor_auth_user_id uuid not null references auth.users(id),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  approved_limit_vnd bigint check (approved_limit_vnd >= 0),
  exposure_before_vnd bigint not null check (exposure_before_vnd >= 0),
  order_amount_vnd bigint not null check (order_amount_vnd > 0),
  exposure_after_vnd bigint not null,
  overdue_vnd bigint not null check (overdue_vnd >= 0),
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  check (exposure_after_vnd = exposure_before_vnd + order_amount_vnd)
);
create index sales_order_credit_overrides_branch_customer_idx
  on public.sales_order_credit_overrides(branch_id, customer_id);
create index sales_order_credit_overrides_actor_idx
  on public.sales_order_credit_overrides(actor_auth_user_id);
create trigger sales_order_credit_overrides_immutable before update or delete
  on public.sales_order_credit_overrides for each row
  execute function private.reject_immutable_finance_mutation();
alter table public.sales_order_credit_overrides enable row level security;
revoke all on public.sales_order_credit_overrides from public, anon, authenticated;
grant select on public.sales_order_credit_overrides to authenticated;
create policy sales_order_credit_overrides_read on public.sales_order_credit_overrides
  for select to authenticated using (
    private.has_permission(branch_id, 'orders.read')
    and private.has_permission(branch_id, 'finance.ar.adjust')
  );

create function private.sales_order_credit_snapshot(target_order_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare o public.sales_orders%rowtype; amount bigint; exposure public.customer_credit_exposure%rowtype;
  overdue bigint; customer_active boolean;
begin
  select * into o from public.sales_orders where id = target_order_id;
  if not found then raise exception 'sales_order_not_found' using errcode = '23503'; end if;
  select coalesce(sum(line_total_vnd), 0)::bigint into amount
    from public.sales_order_lines where sales_order_id = o.id;
  select * into exposure from public.customer_credit_exposure where customer_id = o.customer_id;
  select active into customer_active from public.customers
    where id = o.customer_id and branch_id = o.branch_id;
  select coalesce(sum(greatest(private.current_receivable_outstanding(r.id), 0)), 0)::bigint
    into overdue from public.receivable_obligations r
    where r.customer_id = o.customer_id and r.due_date < current_date;
  return jsonb_build_object('order_id', o.id, 'branch_id', o.branch_id, 'customer_id', o.customer_id,
    'state', o.commercial_state, 'draft_version', o.draft_version,
    'customer_active', coalesce(customer_active, false), 'order_amount_vnd', amount::text,
    'approved_limit_vnd', exposure.credit_limit_vnd::text,
    'exposure_vnd', coalesce(exposure.exposure_vnd, 0)::text, 'overdue_vnd', overdue::text);
end
$$;
revoke all on function private.sales_order_credit_snapshot(uuid) from public, anon, authenticated;

create function public.preview_sales_order_credit_override(target_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.sales_orders%rowtype; snapshot jsonb;
begin
  select * into o from public.sales_orders where id = target_order_id;
  if not found or not private.has_permission(o.branch_id, 'orders.confirm')
    or not private.has_permission(o.branch_id, 'finance.ar.adjust') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  snapshot := private.sales_order_credit_snapshot(target_order_id);
  return snapshot || jsonb_build_object('snapshot_hash', private.command_payload_hash(snapshot));
end
$$;

create function public.confirm_sales_order_with_credit_override(
  target_order_id uuid, override_reason text, expected_snapshot_hash text, operation_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.sales_orders%rowtype; snapshot jsonb; hash text; actor uuid := (select auth.uid());
  receipt public.command_receipts%rowtype; commitment uuid; amount bigint; exposure bigint;
  approved_limit bigint; overdue bigint; normalized_reason text := btrim(override_reason);
begin
  select * into o from public.sales_orders where id = target_order_id for update;
  if actor is null or not found or not private.has_permission(o.branch_id, 'orders.confirm')
    or not private.has_permission(o.branch_id, 'finance.ar.adjust') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if operation_id is null or normalized_reason is null
    or char_length(normalized_reason) not between 3 and 500
    or expected_snapshot_hash is null or expected_snapshot_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'credit_override_input_invalid' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('order_id', target_order_id,
    'reason', normalized_reason, 'snapshot_hash', expected_snapshot_hash, 'actor', actor));
  select * into receipt from public.command_receipts r
    where r.operation_id = confirm_sales_order_with_credit_override.operation_id;
  if found then
    if receipt.command_name <> 'confirm_sales_order_with_credit_override'
      or receipt.payload_hash <> hash or receipt.actor_auth_user_id <> actor then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return receipt.result_entity_id;
  end if;
  if o.commercial_state <> 'DRAFT' then
    raise exception 'sales_order_not_confirmable' using errcode = '23514';
  end if;
  -- Same customer lock as ordinary confirmation. Recompute AFTER acquiring it.
  perform 1 from public.customers where id = o.customer_id and branch_id = o.branch_id and active for update;
  if not found then raise exception 'customer_not_active' using errcode = '23514'; end if;
  snapshot := private.sales_order_credit_snapshot(target_order_id);
  if private.command_payload_hash(snapshot) <> expected_snapshot_hash then
    raise exception 'credit_snapshot_changed' using errcode = '40001';
  end if;
  amount := (snapshot->>'order_amount_vnd')::bigint;
  exposure := (snapshot->>'exposure_vnd')::bigint;
  approved_limit := (snapshot->>'approved_limit_vnd')::bigint;
  overdue := (snapshot->>'overdue_vnd')::bigint;
  if amount <= 0 then raise exception 'sales_order_amount_invalid' using errcode = '23514'; end if;
  if approved_limit is not null and overdue <= 0 and exposure + amount <= approved_limit then
    raise exception 'credit_override_not_required' using errcode = '23514';
  end if;
  insert into public.credit_commitments(branch_id, customer_id, source_type, source_key,
    sales_order_id, amount_vnd, created_by)
  values (o.branch_id, o.customer_id, 'SALES_ORDER', o.id::text, o.id, amount, actor)
    returning id into commitment;
  update public.sales_orders set commercial_state = 'CONFIRMED', confirmed_at = now() where id = o.id;
  insert into public.command_receipts values (operation_id, actor,
    'confirm_sales_order_with_credit_override', hash, 'sales_order', o.id, now());
  insert into public.sales_order_credit_overrides(sales_order_id, branch_id, customer_id,
    commitment_id, operation_id, actor_auth_user_id, reason, approved_limit_vnd,
    exposure_before_vnd, order_amount_vnd, exposure_after_vnd, overdue_vnd, snapshot_hash)
  values (o.id, o.branch_id, o.customer_id, commitment, operation_id, actor, normalized_reason,
    approved_limit, exposure, amount, exposure + amount, overdue, expected_snapshot_hash);
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id,
    trace_id, changed_fields, reason)
  values (actor, o.branch_id, 'sales_order.confirm_credit_override', 'sales_order', o.id,
    operation_id, array['commercial_state','credit_commitment','credit_override_snapshot'], normalized_reason);
  return o.id;
end
$$;
revoke all on function public.preview_sales_order_credit_override(uuid) from public, anon, authenticated;
revoke all on function public.confirm_sales_order_with_credit_override(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.preview_sales_order_credit_override(uuid) to authenticated;
grant execute on function public.confirm_sales_order_with_credit_override(uuid, text, text, uuid) to authenticated;
