import { MetricNumber } from "@/components/ui/metric-number";
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
      .select("reason, actor_auth_user_id, created_at, approved_limit_vnd::text, exposure_before_vnd::text, order_amount_vnd::text, exposure_after_vnd::text, overdue_vnd::text")
      .eq("sales_order_id", orderId).eq("branch_id", context.branchId).maybeSingle();
    if (error || !data) return null;
    return <section className="card card-pad credit-override" aria-label="Ngoại lệ tín dụng đã duyệt">
      <h2 className="credit-heading">Ngoại lệ tín dụng đã duyệt cho đơn này</h2>
      <p className="muted">Lý do: {data.reason}</p>
      <p>Hạn mức tại lúc duyệt: {money(data.approved_limit_vnd)}. Công nợ và giá trị đơn đã cam kết: {money(data.exposure_before_vnd)} → {money(data.exposure_after_vnd)}.</p>
      <p>Công nợ quá hạn tại lúc duyệt: {money(data.overdue_vnd)}.</p>
      <p className="muted">Người duyệt: {data.actor_auth_user_id} · {formatBusinessDateTime(data.created_at)}</p>
      <p className="muted">Thông tin đã duyệt được giữ nguyên; không áp dụng cho đơn hoặc lần xác nhận khác.</p>
    </section>;
  }
  const { data, error } = await supabase.rpc("preview_sales_order_credit_override", { target_order_id: orderId });
  if (error || !data) return <p role="alert" className="quality-callout">Chưa tải được thông tin tín dụng. Không thể duyệt ngoại lệ lúc này.</p>;
  const snapshot = data as Snapshot;
  if (!snapshot.customer_active || snapshot.state !== "DRAFT") return null;
  const after = BigInt(snapshot.exposure_vnd) + BigInt(snapshot.order_amount_vnd);
  const needsOverride = snapshot.approved_limit_vnd === null || BigInt(snapshot.overdue_vnd) > 0n
    || after > BigInt(snapshot.approved_limit_vnd);
  if (!needsOverride) return null;
  return <section className="card card-pad credit-override" aria-label="Duyệt ngoại lệ tín dụng">
    <h2 className="credit-heading">Duyệt ngoại lệ tín dụng</h2>
    <dl className="credit-summary">
      <div><dt>Hạn mức được duyệt</dt><dd>{snapshot.approved_limit_vnd === null ? money(null) : <MetricNumber value={money(snapshot.approved_limit_vnd)} />}</dd></div>
      <div><dt>Công nợ quá hạn</dt><dd><MetricNumber value={money(snapshot.overdue_vnd)} /></dd></div>
      <div><dt>Công nợ và giá trị đơn đã cam kết</dt><dd><MetricNumber value={money(snapshot.exposure_vnd)} /></dd></div>
      <div><dt>Giá trị đơn</dt><dd><MetricNumber value={money(snapshot.order_amount_vnd)} /></dd></div>
      <div><dt>Tổng sau xác nhận</dt><dd><MetricNumber value={money(after.toString())} /></dd></div>
    </dl>
    <p className="muted">Chỉ áp dụng cho đơn này, không thay đổi hạn mức khách hàng.</p>
    <form action={confirmSalesOrderCreditOverride} className="command-panel">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="operationId" value={randomUUID()} />
      <input type="hidden" name="snapshotHash" value={snapshot.snapshot_hash} />
      <label className="field">Lý do ngoại lệ tín dụng
        <textarea name="reason" required minLength={3} maxLength={500} rows={3}
           />
      </label>
      <button type="submit" className="button button-primary">Duyệt ngoại lệ và xác nhận đơn</button>
    </form>
  </section>;
}
