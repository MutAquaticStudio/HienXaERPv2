-- FB3 D17 (Owner 17/10/2026): "Gửi NCC qua Zalo". The purchase order is shared from the phone (PDF + text to the supplier's Zalo)
-- or copied on a computer; the app then records that it was sent, so the purchase orders list shows "Đã gửi NCC 10:30 · Zalo"
-- or "Chưa gửi". Sending itself happens outside the app (Zalo is opened by the person); only the record is stored here.
begin;

create table public.purchase_order_dispatches (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  channel text not null check (channel in ('ZALO', 'EMAIL', 'OTHER')),
  operation_id uuid not null unique,
  sent_by uuid not null references auth.users(id) on delete restrict,
  sent_at timestamptz not null default now()
);
create index purchase_order_dispatches_order_idx on public.purchase_order_dispatches(purchase_order_id, sent_at desc);
alter table public.purchase_order_dispatches enable row level security;
revoke all on public.purchase_order_dispatches from anon, authenticated;
grant select on public.purchase_order_dispatches to authenticated;
create policy purchase_order_dispatches_select on public.purchase_order_dispatches for select to authenticated
  using ((select private.has_permission(branch_id, 'purchasing.read')));

create or replace function public.record_purchase_order_sent(target_purchase_order_id uuid, channel text, operation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  purchase public.purchase_orders%rowtype;
  existing uuid;
  created uuid;
begin
  select * into purchase from public.purchase_orders p where p.id = target_purchase_order_id;
  if purchase.id is null or auth.uid() is null or record_purchase_order_sent.operation_id is null
    or not (private.has_permission(purchase.branch_id, 'purchasing.create') or private.has_permission(purchase.branch_id, 'purchasing.confirm')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if record_purchase_order_sent.channel not in ('ZALO', 'EMAIL', 'OTHER') then raise exception 'invalid_input' using errcode = '22023'; end if;
  select d.id into existing from public.purchase_order_dispatches d where d.operation_id = record_purchase_order_sent.operation_id;
  if existing is not null then
    if not exists (select 1 from public.purchase_order_dispatches d where d.id = existing and d.purchase_order_id = purchase.id
      and d.channel = record_purchase_order_sent.channel and d.sent_by = auth.uid()) then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return existing;
  end if;
  if purchase.state <> 'CONFIRMED' then raise exception 'purchase_order_not_sendable' using errcode = '23514'; end if;
  insert into public.purchase_order_dispatches(branch_id, purchase_order_id, channel, operation_id, sent_by)
  values (purchase.branch_id, purchase.id, record_purchase_order_sent.channel, record_purchase_order_sent.operation_id, (select auth.uid()))
  returning id into created;
  insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
  values ((select auth.uid()), purchase.branch_id, 'purchase_order.sent', 'purchase_order', purchase.id, record_purchase_order_sent.operation_id,
    array['dispatch'], 'Gửi NCC qua ' || case record_purchase_order_sent.channel when 'ZALO' then 'Zalo' when 'EMAIL' then 'email' else 'kênh khác' end);
  return created;
end
$function$;
revoke all on function public.record_purchase_order_sent(uuid, text, uuid) from public, anon;
grant execute on function public.record_purchase_order_sent(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
