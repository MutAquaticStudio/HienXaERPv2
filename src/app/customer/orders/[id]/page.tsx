import Link from "next/link";
import { Check, ChevronLeft, Truck } from "lucide-react";
import { orderJourney } from "@/modules/portal/journey";
import { formatPortalMoney as money } from "@/modules/portal/money";
import { customerDocumentKindLabel, customerDocumentStateLabel } from "@/modules/portal/presentation";
import { financeSourceLabel, financeStateLabel } from "@/modules/finance/presentation";
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import styles from "@/components/portal/portal.module.css";
import { getCustomerPortalOrder } from "@/modules/portal/actions";
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
  const journey = orderJourney(order);
  const time = (value?: string) => value ? new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "";
  const onTheWay = order.deliveries.find((delivery) => delivery.state === "DISPATCHED" || delivery.state === "ARRIVED")
    ?? order.deliveries.find((delivery) => delivery.state === "PLANNED" || delivery.state === "ASSIGNED");
  // Concept "Khách · Theo dõi đơn": back + order, the delivery on its way, the journey with times, the goods, "Đặt lại".
  return (
    <div className={styles.page}>
      {notice && <p className={styles.status} role="status">{notice}</p>}
      <header className={styles.pageHead}>
        <Link className={styles.backButton} href="/customer/orders" aria-label="Quay lại"><ChevronLeft aria-hidden size={20} /></Link>
        <div><p>{[order.ordered_at ? `Đặt ${formatBusinessDate(order.ordered_at).slice(0, 5)}` : null, order.site_name].filter(Boolean).join(" · ")}</p><h1>{order.number ?? "Chi tiết đơn hàng"}</h1></div>
        <span className={styles.stateChip}>{portalOrderStateLabel(order)}</span>
      </header>
      {order.cancel_reason && <p className={styles.status}>Lý do hủy: {order.cancel_reason}</p>}
      {onTheWay && <section className={`${styles.card} ${styles.etaCard}`} aria-label="Lượt giao">
        <span className={styles.etaIcon}><Truck aria-hidden size={22} /></span>
        <div><strong>{customerDeliveryStateLabel(onTheWay.state ?? "PLANNED")}</strong>
          <small>{[onTheWay.number, onTheWay.scheduled_at ? `dự kiến ${time(onTheWay.scheduled_at)}` : null].filter(Boolean).join(" · ")}</small></div>
      </section>}
      {journey && <section className={styles.card} aria-labelledby="journey-title">
        <h2 id="journey-title">Hành trình đơn</h2>
        <ol className={styles.journey}>{journey.map((step) => <li key={step.key} data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
          <span aria-hidden="true">{step.state === "done" ? <Check size={12} strokeWidth={3.2} /> : null}</span>
          <span>{step.label}</span><small>{step.at ? `${step.approx ? "~" : ""}${time(step.at)}` : ""}</small>
        </li>)}</ol>
      </section>}
      {lines.length > 0 && <section className={styles.card}>
        <div className={styles.cardHead}><h2>Hàng hóa</h2>{order.can_view_finance && order.total_amount_vnd && <strong>{money(order.total_amount_vnd)}</strong>}</div>
        <ul className={styles.goodsList}>{lines.map((line) => <li key={line.id}>
          <span>{line.material_name}{line.unit_price_vnd && <small className={styles.hint}>{money(line.unit_price_vnd)} / {line.uom_symbol}</small>}</span>
          <strong>{formatQuantity(line.quantity)} {line.uom_symbol}</strong></li>)}</ul>
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
      {order.state !== "CANCELLED" && order.state !== "DRAFT" && <Link className={styles.reorderOutline} href={`/customer/orders/new?from=${order.id}`}>Đặt lại đơn này</Link>}
      <section className={styles.card}>
        <h2>Các lượt giao</h2>
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
