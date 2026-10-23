import { formatPortalMoney as money } from "@/modules/portal/money";
import { customerDocumentKindLabel, customerDocumentStateLabel } from "@/modules/portal/presentation";
import { financeSourceLabel, financeStateLabel } from "@/modules/finance/presentation";
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import { OrderProgress } from "@/components/portal/order-progress";
import styles from "@/components/portal/portal.module.css";
import { getCustomerPortalOrder } from "@/modules/portal/actions";
import { salesStateLabel } from "@/modules/sales/presentation";
import { deliveryStateLabel } from "@/modules/delivery/presentation";
import { QUOTATIONS_ENABLED } from "@/lib/features";
import { randomUUID } from "node:crypto";
import { formatQuantity } from "@/lib/core/quantity";
import { customerDeliveryStateLabel, portalOrderStateLabel } from "@/modules/portal/presentation";
import { cancelPortalOrderAction } from "@/modules/portal/order-actions";


const notices: Record<string, string> = {
  submitted: "Đã gửi đơn. Cửa hàng sẽ duyệt và báo ngày giao.",
  cancelled: "Đã hủy đơn.",
  "cancel-failed": "Không hủy được đơn — có thể cửa hàng vừa duyệt. Tải lại trang để xem trạng thái mới.",
  "cancel-reason": "Không hủy được đơn. Tải lại trang rồi thử lại (ghi chú tối đa 300 ký tự).",
};

export default async function CustomerOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { id } = await params;
  const notice = notices[(await searchParams).notice ?? ""];
  const order = await getCustomerPortalOrder(id);
  const lines = order.lines ?? [];
  const payments = order.payments ?? [];
  const documents = (order.documents ?? []).filter((document) => QUOTATIONS_ENABLED || document.kind !== "QUOTATION");
  return (
    <div className={styles.page}>
      {notice && <p className={styles.status} role="status">{notice}</p>}
      <header className={styles.hero}>
        <p className={styles.heroEyebrow}>{order.channel === "CUSTOMER_PORTAL" ? "Đơn bạn đặt" : "Đơn hàng"} · {portalOrderStateLabel(order)}</p>
        <h1>{order.number ?? "Chi tiết đơn hàng"}</h1>
        <p>Thương mại: {salesStateLabel(order.state ?? "NOT_STARTED")} · Thực hiện: {salesStateLabel(order.fulfillment_state ?? "NOT_STARTED")}</p>
        {order.cancel_reason && <p>Lý do hủy: {order.cancel_reason}</p>}
        {order.can_view_finance ? <p>Thanh toán: {salesStateLabel(order.payment_state ?? "NOT_DUE")} · Giá trị: {money(order.total_amount_vnd ?? 0)}</p> : <p>Thông tin công nợ và thanh toán chỉ dành cho chủ tài khoản hoặc người phụ trách thanh toán.</p>}
      </header>
      {order.state !== "CANCELLED" && <section className={styles.card} aria-label="Tiến trình đơn"><OrderProgress order={order} /></section>}
      {lines.length > 0 && <section className={styles.card}>
        <h2>Hàng đặt</h2>
        <ul className={styles.orderLines}>{lines.map((line) => <li key={line.id}>
          <span>{line.material_name}<br /><small className={styles.hint}>{formatQuantity(line.quantity)} {line.uom_symbol}{line.unit_price_vnd ? ` × ${money(line.unit_price_vnd)}` : ""}</small></span>
          {line.line_total_vnd && <strong>{money(line.line_total_vnd)}</strong>}</li>)}</ul>
        <div className={styles.kv}><span>Giao tới</span><strong>{order.site_name}{order.delivery_address ? ` — ${order.delivery_address}` : ""}</strong></div>
        {order.requested_delivery_date && <div className={styles.kv}><span>Muốn nhận</span><strong>{formatBusinessDateTime(order.requested_delivery_date)}</strong></div>}
        {order.portal_note && <div className={styles.kv}><span>Ghi chú</span><strong>{order.portal_note}</strong></div>}
        {order.can_cancel && <details>
          <summary className={styles.link}>Hủy đơn</summary>
          <form action={cancelPortalOrderAction} className={styles.form}>
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="operationId" value={randomUUID()} />
            <div className={styles.field}><label htmlFor="cancel-reason">Ghi chú (không bắt buộc)</label><textarea id="cancel-reason" name="reason" maxLength={300} /></div>
            <button className={styles.buttonDanger} type="submit">Hủy đơn này</button>
          </form>
        </details>}
      </section>}
      <section className={styles.card}>
        <h2>Tiến trình giao nhận</h2>
        <div className={styles.timeline}>
          {order.deliveries.length ? order.deliveries.map((delivery) => (
            <article className={styles.timelineItem} id={"delivery-" + delivery.id} key={delivery.id}>
              <strong>{delivery.number ?? "Lượt giao"} · {customerDeliveryStateLabel(delivery.state ?? "PLANNED")}</strong>
              {delivery.result ? <span className={styles.badge}>{deliveryStateLabel(delivery.result)}</span> : null}
              <span className={styles.hint}>{delivery.address ?? delivery.site_name ?? "Địa điểm đang cập nhật"}</span>
              {delivery.scheduled_at ? <span className={styles.hint}>Dự kiến: {formatBusinessDateTime(delivery.scheduled_at)}</span> : null}
              {delivery.delivered_at ? <span className={styles.hint}>Đã giao lúc {formatBusinessDateTime(delivery.delivered_at)}</span> : null}
            </article>
          )) : <p className={styles.empty}>Chưa phát sinh lượt giao.</p>}
        </div>
      </section>
      {order.can_view_finance ? <div className={styles.split}>
        <section className={styles.card}>
          <h2>Công nợ của đơn</h2>
          <div className={styles.kv}><span>Giá trị nghĩa vụ</span><strong>{money(order.debt?.original_amount_vnd ?? 0)}</strong></div>
          <div className={styles.kv}><span>Còn phải thu</span><strong>{money(order.debt?.outstanding_amount_vnd ?? 0)}</strong></div>
          {order.debt?.items.length ? order.debt.items.map((item) => <article className={styles.kv} key={item.id}><span>{item.source_number ?? financeSourceLabel(item.source_type)}<br /><small>Hạn {item.due_date ? formatBusinessDate(item.due_date) : "chưa chốt"}</small></span><strong>{money(item.outstanding_amount_vnd ?? 0)}</strong></article>) : <p className={styles.empty}>Chưa có nghĩa vụ phải thu cho đơn này.</p>}
        </section>
        <section className={styles.card}>
          <h2>Thanh toán liên quan</h2>
          {payments.length ? payments.map((payment) => <article className={styles.kv} key={payment.id}><span>{payment.number}<br /><small>{formatBusinessDate(payment.effective_at)} · {financeStateLabel(payment.reconciliation_state)} · Phân bổ cho đơn</small></span><strong>{money(payment.order_allocated_amount_vnd)}</strong></article>) : <p className={styles.empty}>Chưa có thanh toán được phân bổ cho đơn này.</p>}
        </section>
      </div> : null}
      <section className={styles.card}>
        <h2>Tài liệu liên quan</h2>
        {documents.length ? documents.map((document) => <article className={styles.kv} key={document.id}><span>{document.title}<br /><small>{customerDocumentKindLabel(document.kind)} · {customerDocumentStateLabel(document.kind, document.state)}{document.issued_at ? " · " + formatBusinessDate(document.issued_at) : ""}</small></span>{document.href ? <a className={styles.link} href={document.href}>Mở tài liệu</a> : <span className={styles.hint}>Nguồn nghiệp vụ</span>}</article>) : <p className={styles.empty}>Chưa có tài liệu liên quan.</p>}
      </section>
    </div>
  );
}
