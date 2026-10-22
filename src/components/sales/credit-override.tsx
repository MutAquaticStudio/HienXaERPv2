import { MetricNumber } from "@/components/ui/metric-number";
import { FormDialog } from "@/components/ui/form-dialog";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { randomUUID } from "node:crypto";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { confirmSalesOrderCreditOverride } from "@/modules/sales/credit-override-actions";
import { creditBlockText, type CreditBlock } from "@/modules/sales/credit-block";

type Snapshot = {
  state: string; customer_active: boolean; order_amount_vnd: string;
  approved_limit_vnd: string | null; exposure_vnd: string; overdue_vnd: string; snapshot_hash: string;
};
/** FB8: people named by sales_order_credit_people — never login ids. */
export type CreditPeople = {
  approved: { name?: string; code?: string; roles?: string; at?: string } | null;
  approvers: { name: string; roles: string | null }[];
};
function money(value: string | number | null) {
  return value === null ? "Chưa được duyệt" : `${BigInt(value).toLocaleString("vi-VN")} ₫`;
}

/** "Nguyễn Văn A (NV01) · Kế toán" — or a plain note when the approver is no longer an employee. */
export function approverText(approved: CreditPeople["approved"]): string {
  if (!approved?.name) return "Người duyệt không còn trong danh sách nhân viên";
  return `${approved.name}${approved.code ? ` (${approved.code})` : ""}${approved.roles ? ` · ${approved.roles}` : ""}`;
}

async function creditPeople(supabase: Awaited<ReturnType<typeof createServerSupabase>>, orderId: string): Promise<CreditPeople | null> {
  const { data, error } = await supabase.rpc("sales_order_credit_people", { target_order_id: orderId });
  return error || !data ? null : data as CreditPeople;
}

/**
 * FB8: an order over the customer's credit is explained in a popup. It opens by itself when "Xác nhận" was stopped by
 * credit (`blocked`); people who may approve see the figures and approve there, others see who can approve it.
 */
export async function SalesOrderCreditOverride({ orderId, blocked = null }: { orderId: string; blocked?: CreditBlock | null }) {
  const context = await requireInternalPermission("orders.read");
  const canApprove = context.permissions.has("orders.confirm") && context.permissions.has("finance.ar.adjust");
  const supabase = await createServerSupabase();
  const { data: order, error: orderError } = await supabase.from("sales_orders")
    .select("commercial_state").eq("id", orderId).eq("branch_id", context.branchId).maybeSingle();
  if (orderError || !order) return null;
  if (order.commercial_state !== "DRAFT") {
    if (!canApprove) return null;
    const [{ data, error }, people] = await Promise.all([
      supabase.from("sales_order_credit_overrides")
        .select("reason, created_at, approved_limit_vnd::text, exposure_before_vnd::text, order_amount_vnd::text, exposure_after_vnd::text, overdue_vnd::text")
        .eq("sales_order_id", orderId).eq("branch_id", context.branchId).maybeSingle(),
      creditPeople(supabase, orderId),
    ]);
    if (error || !data) return null;
    return <section className="card card-pad credit-override" aria-label="Đã duyệt vượt hạn mức">
      <h2 className="credit-heading">Đơn này đã được duyệt vượt hạn mức tín dụng</h2>
      <p>Hạn mức lúc duyệt: {money(data.approved_limit_vnd)}. Công nợ và giá trị đơn đã cam kết: {money(data.exposure_before_vnd)} → {money(data.exposure_after_vnd)}.</p>
      <p>Công nợ quá hạn lúc duyệt: {money(data.overdue_vnd)}.</p>
      <p className="muted">Người duyệt: {approverText(people?.approved ?? null)} · {formatBusinessDateTime(data.created_at)}</p>
      <p className="muted">Ghi chú: {data.reason}</p>
    </section>;
  }

  if (!canApprove) {
    if (!blocked) return null;
    const people = await creditPeople(supabase, orderId);
    const approvers = people?.approvers ?? [];
    return <section className="card card-pad credit-override" aria-label="Đơn vượt hạn mức tín dụng">
      <h2 className="credit-heading">Đơn chưa xác nhận được vì tín dụng</h2>
      <p className="muted">{creditBlockText(blocked)} Bản nháp vẫn được giữ.</p>
      <FormDialog label="Xem người duyệt" title="Cần duyệt vượt hạn mức" defaultOpen buttonClassName="button button-secondary"
        description={creditBlockText(blocked)}>
        <div className="command-panel">
          <p>Bản nháp đã được lưu. Nhờ một trong những người sau duyệt vượt hạn mức cho đơn này:</p>
          {approvers.length ? <ul className="credit-approvers">{approvers.map((person) => <li key={person.name + (person.roles ?? "")}>
            <strong>{person.name}</strong>{person.roles && <span className="muted"> · {person.roles}</span>}</li>)}</ul>
            : <p className="muted">Chưa có ai trong chi nhánh có đủ quyền duyệt (xác nhận đơn và điều chỉnh công nợ). Nhờ chủ doanh nghiệp cấp quyền.</p>}
          <p className="muted">Hoặc khách trả bớt công nợ rồi bấm xác nhận lại.</p>
        </div>
      </FormDialog>
    </section>;
  }

  const { data, error } = await supabase.rpc("preview_sales_order_credit_override", { target_order_id: orderId });
  if (error || !data) return <p role="alert" className="quality-callout">Chưa tải được thông tin tín dụng. Không thể duyệt vượt hạn mức lúc này.</p>;
  const snapshot = data as Snapshot;
  if (!snapshot.customer_active || snapshot.state !== "DRAFT") return null;
  const after = BigInt(snapshot.exposure_vnd) + BigInt(snapshot.order_amount_vnd);
  const needsOverride = snapshot.approved_limit_vnd === null || BigInt(snapshot.overdue_vnd) > 0n
    || after > BigInt(snapshot.approved_limit_vnd);
  if (!needsOverride) return null;
  const reason: CreditBlock = blocked ?? (snapshot.approved_limit_vnd === null ? "no-limit" : BigInt(snapshot.overdue_vnd) > 0n ? "overdue" : "limit");
  return <section className="card card-pad credit-override" aria-label="Đơn vượt hạn mức tín dụng">
    <h2 className="credit-heading">Đơn vượt hạn mức tín dụng</h2>
    <p className="muted">{creditBlockText(reason)} Bạn có quyền duyệt vượt hạn mức cho riêng đơn này.</p>
    <FormDialog label="Duyệt vượt hạn mức" title="Duyệt vượt hạn mức tín dụng" defaultOpen={!!blocked} buttonClassName="button button-primary"
      description={creditBlockText(reason)}>
      <div className="credit-override credit-dialog">
        <dl className="credit-summary">
          <div><dt>Hạn mức được duyệt</dt><dd>{snapshot.approved_limit_vnd === null ? money(null) : <MetricNumber value={money(snapshot.approved_limit_vnd)} />}</dd></div>
          <div><dt>Công nợ quá hạn</dt><dd><MetricNumber value={money(snapshot.overdue_vnd)} /></dd></div>
          <div><dt>Công nợ và giá trị đơn đã cam kết</dt><dd><MetricNumber value={money(snapshot.exposure_vnd)} /></dd></div>
          <div><dt>Giá trị đơn</dt><dd><MetricNumber value={money(snapshot.order_amount_vnd)} /></dd></div>
          <div><dt>Tổng sau xác nhận</dt><dd><MetricNumber value={money(after.toString())} /></dd></div>
        </dl>
        <p className="muted">Chỉ áp dụng cho đơn này, không thay đổi hạn mức khách hàng. Tên bạn được ghi là người duyệt.</p>
        <form action={confirmSalesOrderCreditOverride} className="command-panel">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="operationId" value={randomUUID()} />
          <input type="hidden" name="snapshotHash" value={snapshot.snapshot_hash} />
          <label className="field">Ghi chú (không bắt buộc)
            <textarea name="reason" maxLength={500} rows={3} />
          </label>
          <button type="submit" className="button button-primary">Duyệt vượt hạn mức và xác nhận đơn</button>
        </form>
      </div>
    </FormDialog>
  </section>;
}
