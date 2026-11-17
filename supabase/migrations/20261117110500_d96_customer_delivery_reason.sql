-- D96 (Owner 16/11/2026 "Ok giờ hãy fix các điểm chú ý", audit D4): the customer's "Giao thiếu / Chưa giao được" push
-- (private.customer_push_delivery, latest body 20261116200000) never shows the internal notes the system writes when a result
-- skips "Đã tới nơi" ("Nhân viên báo giao thay thợ" for an office report, "Thợ chưa bấm Đã tới nơi" for a worker who typed
-- nothing; src/modules/delivery/internal-reasons.ts lists the same texts). Only a reason someone typed reaches the customer;
-- otherwise "Cửa hàng sẽ liên hệ lại". The office page now writes its note only where the database needs a reason.
begin;

create or replace function private.customer_delivery_reason(reason text) returns text
language sql immutable set search_path = '' as $$
  select case when btrim(coalesce(reason, '')) in ('', 'Nhân viên báo giao thay thợ', 'Thợ chưa bấm Đã tới nơi') then null
    else btrim(reason) end
$$;
revoke all on function private.customer_delivery_reason(text) from public, anon, authenticated, service_role;

create or replace function private.customer_push_delivery() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  plate text;
  result public.delivery_results%rowtype;
  link text := '/customer/orders/' || new.sales_order_id;
begin
  begin
    -- Owner (1): nothing for a delivery of an order of the sales-ledger import.
    if private.ledger_import_sales_order(new.sales_order_id) then return null; end if;
    if new.execution_state = 'DISPATCHED' and old.execution_state in ('PLANNED', 'ASSIGNED') then
      select v.plate_number into plate from public.delivery_assignments a join public.vehicles v on v.id = a.vehicle_id
      where a.delivery_id = new.id and a.superseded_at is null;
      perform private.customer_push(new.customer_id, 'customer.delivery_dispatched',
        coalesce('Xe ' || plate, 'Xe') || ' đang chở hàng tới ' || new.site_name_snapshot, new.delivery_number, link, false, new.id::text);
    elsif new.execution_state = 'VERIFIED' and old.execution_state is distinct from 'VERIFIED' then
      select * into result from public.delivery_results r where r.delivery_id = new.id;
      if new.result_kind = 'FULL' then
        perform private.customer_push(new.customer_id, 'customer.delivery_done', 'Đã giao xong ' || new.delivery_number,
          concat_ws(' · ', new.site_name_snapshot, case when result.evidence_object_id is not null then 'Có ảnh xác nhận' end), link, false, new.id::text);
      elsif new.result_kind in ('PARTIAL', 'FAILED') then
        -- Owner (4): only the driver's reason, never the delivery note. D96 (D4): never an internal note either.
        perform private.customer_push(new.customer_id, 'customer.delivery_problem',
          case when new.result_kind = 'PARTIAL' then 'Giao thiếu ' else 'Chưa giao được ' end || new.delivery_number,
          concat_ws(' · ', new.site_name_snapshot, coalesce(private.customer_delivery_reason(result.missing_arrival_reason), 'Cửa hàng sẽ liên hệ lại')),
          link, false, new.id::text);
      end if;
    end if;
  exception when others then
    raise warning 'customer_push_failed: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function private.customer_push_delivery() from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
