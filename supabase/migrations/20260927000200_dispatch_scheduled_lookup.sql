create index if not exists deliveries_dispatch_state_scheduled_idx
  on public.deliveries (branch_id, execution_state, scheduled_at, id)
  where execution_state <> 'CANCELLED';

create index if not exists deliveries_dispatch_exception_scheduled_idx
  on public.deliveries (branch_id, result_kind, scheduled_at, id)
  where execution_state <> 'CANCELLED' and result_kind in ('PARTIAL', 'FAILED');
