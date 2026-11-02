-- QA 02/11 (D44/D45 fix): a payment request whose debts were paid another way (another request, a manual receipt…) stayed
-- "Chờ thanh toán / Đã trả một phần" — a cash request kept showing in "Chờ thu tiền mặt" and could be confirmed again,
-- turning the extra cash into an advance. Now every allocation (or its reversal) on a debt refreshes the requests holding
-- that debt, and a request whose debts are all settled is PAID even if the money came through another document.
begin;

create or replace function private.refresh_payment_request(target_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  received bigint;
  left_owed bigint;
begin
  select coalesce(sum(p.amount_vnd), 0) into received
  from public.payments p
  where (p.id in (select t.payment_id from public.bank_transactions t where t.payment_request_id = target_request_id and t.payment_id is not null)
      or p.id in (select x.payment_id from public.payment_request_payments x where x.request_id = target_request_id))
    and not exists (select 1 from public.payments v where v.reversal_of_payment_id = p.id);
  select coalesce(sum(private.current_receivable_outstanding(l.receivable_obligation_id)), 0) into left_owed
  from public.payment_request_lines l where l.request_id = target_request_id;
  update public.payment_requests set received_amount_vnd = received,
    state = case when state = 'CANCELLED' then state when left_owed = 0 then 'PAID' when received = 0 then 'OPEN' else 'PARTIAL' end,
    paid_at = case when state <> 'CANCELLED' and left_owed = 0 then coalesce(paid_at, now()) else null end
  where id = target_request_id;
end $$;

-- Money put on (or taken back from) a debt: the requests holding that debt follow.
create or replace function private.payment_allocation_refreshes_requests() returns trigger
language plpgsql security definer set search_path = '' as $$
declare request_id uuid;
begin
  for request_id in
    select distinct l.request_id from public.payment_request_lines l join public.payment_requests r on r.id = l.request_id
    where l.receivable_obligation_id = new.receivable_obligation_id and r.state <> 'CANCELLED'
  loop
    perform private.refresh_payment_request(request_id);
  end loop;
  return null;
end $$;
create trigger payment_allocations_refresh_requests after insert on public.payment_allocations
  for each row when (new.receivable_obligation_id is not null) execute function private.payment_allocation_refreshes_requests();

revoke all on function private.payment_allocation_refreshes_requests() from public, anon, authenticated;

-- Requests already left behind (e.g. on QA) catch up once.
select private.refresh_payment_request(r.id) from public.payment_requests r where r.state in ('OPEN', 'PARTIAL');

commit;
