import { formatBusinessDateTime } from "@/lib/core/business-time";
import { randomUUID } from "node:crypto";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { confirmSalesOrderCreditOverride } from "@/modules/sales/credit-override-actions";

type Snapshot = {
  state: string; customer_active: boolean; order_amount_vnd: string;
  approved_limit_vnd: string | null; exposure_vnd: string; overdue_vnd: string; snapshot_hash: string;
};
function money(value: string | number | null) {
  return value === null ? "Chưa được duyệt" : `${BigInt(value).toLocaleString("vi-VN")} ₫`;
}

export async function SalesOrderCreditOverride({ orderId }: { orderId: string }) {
  const context = await requireInternalPermission("orders.read");
  if (!context.permissions.has("orders.confirm") || !context.permissions.has("finance.ar.adjust")) return null;
  const supabase = await createServerSupabase();
  const { data: order, error: orderError } = await supabase.from("sales_orders")
    .select("commercial_state").eq("id", orderId).eq("branch_id", context.branchId).maybeSingle();
  if (orderError || !order) return null;
  if (order.commercial_state !== "DRAFT") {
    const { data, error } = await supabase.from("sales_order_credit_overrides")
      .select("reason, actor_auth_user_id, created_at, approved_limit_vnd, exposure_before_vnd, order_amount_vnd, exposure_after_vnd, overdue_vnd")
      .eq("sales_order_id", orderId).eq("branch_id", context.branchId).maybeSingle();
    if (error || !data) return null;
    return <section className="rounded-xl border border-amber-300 bg-amber-50 p-5" aria-label="Ngoại lệ tín dụng đã duyệt">
      <h2 className="font-semibold">Ngoại lệ tín dụng đã duyệt cho đơn này</h2>
      <p className="mt-2">Lý do: {data.reason}</p>
      <p>Hạn mức tại lúc duyệt: {money(data.approved_limit_vnd)}. Công nợ và giá trị đơn đã cam kết: {money(data.exposure_before_vnd)} → {money(data.exposure_after_vnd)}.</p>
      <p>Công nợ quá hạn tại lúc duyệt: {money(data.overdue_vnd)}.</p>
      <p className="mt-2 text-xs">Người duyệt: {data.actor_auth_user_id} · {formatBusinessDateTime(data.created_at)}</p>
      <p className="mt-2 text-sm">Thông tin đã duyệt được giữ nguyên; không áp dụng cho đơn hoặc lần xác nhận khác.</p>
    </section>;
  }
  const { data, error } = await supabase.rpc("preview_sales_order_credit_override", { target_order_id: orderId });
  if (error || !data) return <p role="alert" className="text-sm text-amber-800">Chưa tải được thông tin tín dụng. Không thể duyệt ngoại lệ lúc này.</p>;
  const snapshot = data as Snapshot;
  if (!snapshot.customer_active || snapshot.state !== "DRAFT") return null;
  const after = BigInt(snapshot.exposure_vnd) + BigInt(snapshot.order_amount_vnd);
  const needsOverride = snapshot.approved_limit_vnd === null || BigInt(snapshot.overdue_vnd) > 0n
    || after > BigInt(snapshot.approved_limit_vnd);
  if (!needsOverride) return null;
  return <section className="rounded-xl border border-amber-300 bg-amber-50 p-5" aria-label="Duyệt ngoại lệ tín dụng">
    <h2 className="font-semibold">Duyệt ngoại lệ tín dụng cho lần xác nhận này</h2>
    <dl className="my-3 grid gap-2 text-sm sm:grid-cols-2">
      <div><dt>Hạn mức được duyệt</dt><dd>{money(snapshot.approved_limit_vnd)}</dd></div>
      <div><dt>Công nợ quá hạn</dt><dd>{money(snapshot.overdue_vnd)}</dd></div>
      <div><dt>Công nợ và giá trị đơn đã cam kết</dt><dd>{money(snapshot.exposure_vnd)}</dd></div>
      <div><dt>Giá trị đơn</dt><dd>{money(snapshot.order_amount_vnd)}</dd></div>
      <div><dt>Tổng sau xác nhận</dt><dd>{money(after.toString())}</dd></div>
    </dl>
    <p className="mb-3 text-sm">Chỉ duyệt đơn này; không thay đổi hạn mức, không cho phép mặc định các đơn sau.</p>
    <form action={confirmSalesOrderCreditOverride} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="operationId" value={randomUUID()} />
      <input type="hidden" name="snapshotHash" value={snapshot.snapshot_hash} />
      <label className="block text-sm font-medium">Lý do ngoại lệ tín dụng
        <textarea name="reason" required minLength={3} maxLength={500} rows={3}
          className="mt-1 block w-full rounded-lg border bg-white p-2" />
      </label>
      <button type="submit" className="rounded-lg bg-amber-900 px-4 py-2 text-sm font-medium text-white">Duyệt ngoại lệ và xác nhận đơn</button>
    </form>
  </section>;
}
