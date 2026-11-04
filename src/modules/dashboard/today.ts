import "server-only";

import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import type { createServerSupabase } from "@/lib/supabase/server";
import { CASHBOOK_PERMISSIONS } from "@/lib/access/policy";

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;

/** One "Cần xử lý hôm nay" row: how many, what, a detail line and the one action that deals with it (D56). */
export type TodayItem = { key: string; count: number; title: string; detail: string; href: string; action: string; tone: "warning" | "info" | "danger" };

export type TodayFacts = {
  waitingDeliveries?: { count: number; earliestAt: string | null; late: number; declined: number } | null;
  bankReview?: { count: number; latestAmountVnd: string | null; latestAt: string | null } | null;
  cashRequests?: { count: number } | null;
  portalOrders?: { count: number; firstNumber: string | null; firstCustomer: string | null } | null;
  draftPurchases?: { count: number; supplier: string | null } | null;
  unreconciled?: { count: number } | null;
  openShifts?: { count: number; firstName: string | null; firstDay: string | null } | null;
  lowStock?: { count: number } | null;
};

const time = (value: string) => formatBusinessDateTime(value).slice(-5);

/** The rows to show, most urgent first; a fact the user may not see (null) or with nothing to do is left out. */
export function todayItems(facts: TodayFacts): TodayItem[] {
  const items: TodayItem[] = [];
  const delivery = facts.waitingDeliveries;
  if (delivery?.count) items.push({ key: "deliveries", count: delivery.count, title: "Phiếu giao chờ phân xe, tài xế",
    detail: [delivery.earliestAt ? `Sớm nhất ${time(delivery.earliestAt)}` : "Chưa hẹn giờ", delivery.late ? `${delivery.late} phiếu trễ hẹn` : null,
      delivery.declined ? `${delivery.declined} phiếu thợ từ chối` : null].filter(Boolean).join(" · "),
    href: "/admin/dispatch", action: "Phân giao", tone: delivery.late ? "warning" : "info" });
  const shifts = facts.openShifts;
  if (shifts?.count) items.push({ key: "shifts", count: shifts.count, title: shifts.count === 1 ? "Thợ chưa ra ca từ hôm trước" : "Ca làm chưa ra ca từ hôm trước",
    detail: [shifts.firstName, shifts.firstDay ? `vào ca ngày ${formatBusinessDate(shifts.firstDay)}` : null].filter(Boolean).join(" · "),
    href: "/admin/attendance", action: "Sửa chấm công", tone: "danger" });
  const bank = facts.bankReview;
  if (bank?.count) items.push({ key: "bank", count: bank.count, title: "Chuyển khoản chưa nhận ra khách",
    detail: [bank.latestAmountVnd ? `+${formatVnd(vnd(bank.latestAmountVnd))}` : null, bank.latestAt ? formatBusinessDate(bank.latestAt) : null].filter(Boolean).join(" · "),
    href: "/admin/cashbook#bank", action: "Ghi phiếu thu", tone: "info" });
  if (facts.cashRequests?.count) items.push({ key: "cash", count: facts.cashRequests.count, title: "Khách hẹn trả tiền mặt tại cửa hàng",
    detail: "Đếm tiền rồi bấm “Xác nhận đã thu”", href: "/admin/cashbook#cash-requests", action: "Thu tiền", tone: "info" });
  const portal = facts.portalOrders;
  if (portal?.count) items.push({ key: "portal", count: portal.count, title: "Đơn khách tự đặt chờ duyệt",
    detail: [portal.firstNumber, portal.firstCustomer].filter(Boolean).join(" · "), href: "/admin/orders?state=PORTAL_WAITING", action: "Duyệt đơn", tone: "info" });
  const purchases = facts.draftPurchases;
  if (purchases?.count) items.push({ key: "purchases", count: purchases.count, title: "Đơn mua nháp chờ duyệt",
    detail: purchases.supplier ?? "", href: "/admin/purchase-orders?state=DRAFT", action: "Xem đơn mua", tone: "info" });
  if (facts.unreconciled?.count) items.push({ key: "reconcile", count: facts.unreconciled.count, title: "Giao dịch chưa đối soát ngân hàng",
    detail: "Ở Sổ quỹ, cột Đối soát", href: "/admin/cashbook", action: "Đối soát", tone: "info" });
  if (facts.lowStock?.count) items.push({ key: "stock", count: facts.lowStock.count, title: "Vật tư dưới ngưỡng tồn",
    detail: "Tạo đơn mua nháp khi cần", href: "/admin/inventory?stock=low", action: "Xem tồn kho", tone: "warning" });
  return items;
}

const businessDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(date);
const first = <T>(rows: T[] | null | undefined) => (rows ?? [])[0];

/** Reads each fact the user may see (permission-gated; a failed read is left out rather than shown as 0). */
export async function loadTodayFacts(supabase: Supabase, branchId: string, permissions: ReadonlySet<string>, now = new Date()): Promise<TodayFacts> {
  const can = (permission: string) => permissions.has(permission);
  const today = businessDay(now);
  const settle = async <T>(enabled: boolean, read: () => PromiseLike<T | null>): Promise<T | null> => {
    if (!enabled) return null;
    try { return await read(); } catch { return null; }
  };
  const [waitingDeliveries, bankReview, cashRequests, portalOrders, draftPurchases, unreconciled, openShifts, lowStock] = await Promise.all([
    settle(can("delivery.read"), async () => {
      const { data, error } = await supabase.rpc("dispatch_day", { target_branch_id: branchId, target_day: today });
      if (error || !data) return null;
      const waiting = ((data as { waiting?: { start: string | null; declined: string | null }[] }).waiting ?? []);
      const starts = waiting.map((row) => row.start).filter((value): value is string => !!value).sort();
      return { count: waiting.length, earliestAt: starts[0] ?? null, late: starts.filter((value) => new Date(value) < now).length,
        declined: waiting.filter((row) => row.declined).length };
    }),
    settle(can("finance.payment.post"), async () => {
      const { data, error, count } = await supabase.from("bank_transactions").select("amount_vnd::text, transaction_at", { count: "exact" })
        .eq("branch_id", branchId).eq("state", "NEEDS_REVIEW").order("received_at", { ascending: false }).limit(1);
      if (error) return null;
      const row = first(data as { amount_vnd: string; transaction_at: string }[]);
      return { count: count ?? 0, latestAmountVnd: row?.amount_vnd ?? null, latestAt: row?.transaction_at ?? null };
    }),
    settle(can("finance.payment.post"), async () => {
      const { error, count } = await supabase.from("payment_requests").select("id", { count: "exact", head: true })
        .eq("branch_id", branchId).eq("method", "CASH").in("state", ["OPEN", "PARTIAL"]).gt("expires_at", now.toISOString());
      return error ? null : { count: count ?? 0 };
    }),
    settle(can("orders.confirm"), async () => {
      const { data, error, count } = await supabase.from("sales_orders").select("order_number, customer_name_snapshot", { count: "exact" })
        .eq("branch_id", branchId).eq("order_channel", "CUSTOMER_PORTAL").eq("commercial_state", "DRAFT").order("created_at").limit(1);
      if (error) return null;
      const row = first(data as { order_number: string; customer_name_snapshot: string }[]);
      return { count: count ?? 0, firstNumber: row?.order_number ?? null, firstCustomer: row?.customer_name_snapshot ?? null };
    }),
    settle(can("purchasing.confirm"), async () => {
      const { data, error, count } = await supabase.from("purchase_orders").select("supplier_name_snapshot", { count: "exact" })
        .eq("branch_id", branchId).eq("state", "DRAFT").order("created_at").limit(1);
      if (error) return null;
      return { count: count ?? 0, supplier: first(data as { supplier_name_snapshot: string }[])?.supplier_name_snapshot ?? null };
    }),
    settle(can("finance.reconcile") && CASHBOOK_PERMISSIONS.some(can), async () => {
      const { data, error } = await supabase.rpc("cashbook_summary", { target_branch_id: branchId }).select("unmatched_count").single();
      return error || !data ? null : { count: Number((data as { unmatched_count: number }).unmatched_count ?? 0) };
    }),
    settle(can("attendance.manage"), async () => {
      const { data, error, count } = await supabase.from("attendance_records").select("work_date, employees(display_name)", { count: "exact" })
        .eq("branch_id", branchId).not("clock_in_at", "is", null).is("clock_out_at", null).lt("work_date", today).order("work_date").limit(1);
      if (error) return null;
      const row = first(data as unknown as { work_date: string; employees: { display_name: string } | { display_name: string }[] | null }[]);
      const person = Array.isArray(row?.employees) ? row?.employees[0] : row?.employees;
      return { count: count ?? 0, firstName: person?.display_name ?? null, firstDay: row?.work_date ?? null };
    }),
    settle(can("inventory.read"), async () => {
      const { error, count } = await supabase.from("low_stock_alert_read").select("threshold_id", { count: "exact", head: true }).eq("branch_id", branchId);
      return error ? null : { count: count ?? 0 };
    }),
  ]);
  return { waitingDeliveries, bankReview, cashRequests, portalOrders, draftPurchases, unreconciled, openShifts, lowStock };
}
