-- Support branch-scoped expense pages with and without approval-state filters.
create index if not exists expenses_branch_effective_id_idx
  on public.expenses (branch_id, effective_at desc, id desc);

create index if not exists expenses_branch_approval_effective_id_idx
  on public.expenses (branch_id, approval_state, effective_at desc, id desc);
