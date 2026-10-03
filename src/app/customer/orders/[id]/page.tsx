import styles from "@/components/portal/portal.module.css";
import { getCustomerPortalOrder } from "@/modules/portal/actions";
import { salesStateLabel } from "@/modules/sales/presentation";
import { deliveryStateLabel } from "@/modules/delivery/presentation";

const money = (value: string | number = 0) => new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
}).format(Number(value));

export default async function CustomerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getCustomerPortalOrder(id);
  const payments = order.payments ?? [];
  const documents = order.documents ?? [];
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.heroEyebrow}>Đơn hàng</p>
        <h1>{order.number ?? "Chi tiết đơn hàng"}</h1>
        <p>Thương mại: {salesStateLabel(order.state ?? "NOT_STARTED")} · Thực hiện: {salesStateLabel(order.fulfillment_state ?? "NOT_STARTED")}</p>
        {order.can_view_finance ? <p>Thanh toán: {salesStateLabel(order.payment_state ?? "NOT_DUE")} · Giá trị: {money(order.total_amount_vnd ?? 0)}</p> : <p>Thông tin công nợ và thanh toán chỉ dành cho Owner hoặc Finance Contact.</p>}
      </header>
      <section className={styles.card}>
        <h2>Tiến trình giao nhận</h2>
        <div className={styles.timeline}>
          {order.deliveries.length ? order.deliveries.map((delivery) => (
            <article className={styles.timelineItem} id={"delivery-" + delivery.id} key={delivery.id}>
              <strong>{delivery.number ?? "Lượt giao"} · {deliveryStateLabel(delivery.state ?? "PLANNED")}</strong>
              {delivery.result ? <span className={styles.badge}>{deliveryStateLabel(delivery.result)}</span> : null}
              <span className={styles.hint}>{delivery.address ?? delivery.site_name ?? "Địa điểm đang cập nhật"}</span>
              {delivery.scheduled_at ? <span className={styles.hint}>Dự kiến: {new Date(delivery.scheduled_at).toLocaleString("vi-VN")}</span> : null}
              {delivery.delivered_at ? <span className={styles.hint}>Xác minh: {new Date(delivery.delivered_at).toLocaleString("vi-VN")}</span> : null}
            </article>
          )) : <p className={styles.empty}>Chưa phát sinh lượt giao.</p>}
        </div>
      </section>
      {order.can_view_finance ? <div className={styles.split}>
        <section className={styles.card}>
          <h2>Công nợ của đơn</h2>
          <div className={styles.kv}><span>Giá trị nghĩa vụ</span><strong>{money(order.debt?.original_amount_vnd ?? 0)}</strong></div>
          <div className={styles.kv}><span>Còn phải thu</span><strong>{money(order.debt?.outstanding_amount_vnd ?? 0)}</strong></div>
          {order.debt?.items.length ? order.debt.items.map((item) => <article className={styles.kv} key={item.id}><span>{item.source_number ?? item.source_type ?? "Khoản phải thu"}<br /><small>Hạn {item.due_date ?? "chưa chốt"}</small></span><strong>{money(item.outstanding_amount_vnd ?? 0)}</strong></article>) : <p className={styles.empty}>Chưa có nghĩa vụ phải thu cho đơn này.</p>}
        </section>
        <section className={styles.card}>
          <h2>Thanh toán liên quan</h2>
          {payments.length ? payments.map((payment) => <article className={styles.kv} key={payment.id}><span>{payment.number}<br /><small>{new Date(payment.effective_at).toLocaleDateString("vi-VN")} · {payment.reconciliation_state} · Phân bổ cho đơn</small></span><strong>{money(payment.order_allocated_amount_vnd)}</strong></article>) : <p className={styles.empty}>Chưa có thanh toán được phân bổ cho đơn này.</p>}
        </section>
      </div> : null}
      <section className={styles.card}>
        <h2>Tài liệu liên quan</h2>
        {documents.length ? documents.map((document) => <article className={styles.kv} key={document.id}><span>{document.title}<br /><small>{document.kind} · {document.state ?? "Đang xử lý"}{document.issued_at ? " · " + new Date(document.issued_at).toLocaleDateString("vi-VN") : ""}</small></span>{document.href ? <a className={styles.link} href={document.href}>Mở tài liệu</a> : <span className={styles.hint}>Nguồn nghiệp vụ</span>}</article>) : <p className={styles.empty}>Chưa có tài liệu liên quan.</p>}
      </section>
    </div>
  );
}
