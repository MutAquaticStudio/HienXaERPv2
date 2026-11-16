-- Owner 16/11/2026: "thêm quy tắc push cho thợ đã nhận phiếu nhé". A worker claiming a delivery in "Nhận việc" (D79) already
-- writes the office notification `delivery.claimed` ("<thợ> đã nhận <số phiếu>", for people with delivery.assign) but it only
-- showed in the app: no rule could react to it. Now a rule can, and every active branch gets the push rule
-- "Thợ nhận phiếu giao → báo điều phối" (phones of the people who dispatch), like the starter rules of 17/10. The office can
-- turn it off or add Telegram / email / webhook rules for the same event in Cài đặt › Quy tắc tự động.
begin;

alter table public.automation_rules drop constraint automation_rules_event_check;
alter table public.automation_rules add constraint automation_rules_event_check check (event in ('order.portal_submitted', 'order.portal_cancelled',
  'customer.self_registered', 'purchase.draft_ready', 'sales_order.needs_purchase', 'sales_order.short_source', 'sales_order.needs_delivery',
  'delivery.waiting_dispatch', 'delivery.dispatch_suggested', 'delivery.result_submitted', 'delivery.claimed', 'work.assigned', 'work.declined',
  'finance.overdue_digest', 'inventory.low_stock_digest', 'purchase.unsent_digest'));

insert into public.automation_rules(branch_id, name, event, problems_only, channel)
select b.id, 'Thợ nhận phiếu giao → báo điều phối', 'delivery.claimed', false, 'PUSH'
from public.branches b
where b.active
  and not exists (select 1 from public.automation_rules r where r.branch_id = b.id and r.event = 'delivery.claimed' and r.channel = 'PUSH');

notify pgrst, 'reload schema';
commit;
