-- Support both unfiltered and state-filtered branch delivery pages.
create index if not exists deliveries_branch_created_id_idx
  on public.deliveries (branch_id, created_at desc, id desc);

create index if not exists deliveries_branch_state_created_id_idx
  on public.deliveries (branch_id, execution_state, created_at desc, id desc);
