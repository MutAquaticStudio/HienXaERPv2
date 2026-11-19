-- Owner 16/11/2026 (D79 sửa): "Phần D79 sửa lại tý cho phần nhận việc hiện dù không đủ thông tin nhé". A delivery waiting
-- for a driver now shows in "Nhận việc" (and the lead's "Điều phối", and the D80 push) even when the delivery address, the
-- receiver's name or phone is missing; the worker card already shows "Địa điểm sẽ cập nhật" without an address. Every other
-- condition is unchanged (dispatch not OFF, within 14 days, not assigned, from stock only, nothing started).
begin;

create or replace function private.delivery_pool_open(target_delivery_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.deliveries d
    where d.id = target_delivery_id and d.execution_state = 'PLANNED'
      and (private.branch_settings(d.branch_id)).dispatch_mode <> 'OFF'
      and coalesce(d.scheduled_at, now()) < now() + interval '14 days'
      and not exists (select 1 from public.delivery_assignments a where a.delivery_id = d.id and a.superseded_at is null)
      and exists (select 1 from public.delivery_lines l where l.delivery_id = d.id and l.planned_base_quantity > 0)
      and not exists (select 1 from public.delivery_lines l where l.delivery_id = d.id and l.source_mode = 'SUPPLIER_DIRECT')
      and not exists (select 1 from public.work_items w where w.delivery_id = d.id
        and (w.started_at is not null or w.execution_state not in ('AVAILABLE', 'CLAIMED'))))
$$;
revoke all on function private.delivery_pool_open(uuid) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
