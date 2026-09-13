import styles from "@/components/portal/portal.module.css";
import { PaymentNoticeForm } from "@/components/portal/payment-notice-form";
import { getCustomerPortalSnapshot } from "@/modules/portal/actions";

const money = (value: string | number = 0) => new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
}).format(Number(value));

export default async function CustomerDebtsPage() {
  const snapshot = await getCustomerPortalSnapshot();
  if (!snapshot.can_view_debt || !snapshot.debt) {
    return (
      <div className={styles.page}>
        <section className={styles.card}>
          <h1>Công nợ</h1>
          <p>Vai trò Người nhận chỉ được xem ngữ cảnh giao hàng, không được xem công nợ hoặc chứng từ thanh toán.</p>
        </section>
      </div>
    );
  }
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.heroEyebrow}>Công nợ hiện tại</p>
        <h1>{money(snapshot.debt.outstanding_amount_vnd)}</h1>
        <p>Quá hạn: {money(snapshot.debt.overdue_amount_vnd)}</p>
      </header>
      <div className={styles.split}>
        <section className={styles.card}>
          <h2>Khoản cần thanh toán</h2>
          {snapshot.debt.items.length ? snapshot.debt.items.map((item) => (
            <article className={styles.kv} key={item.id}>
              <span>{item.source_number ?? item.source_type ?? "Khoản phải thu"}<br /><small>Hạn {item.due_date ?? "chưa chốt"}</small></span>
              <strong>{money(item.outstanding_amount_vnd ?? 0)}</strong>
            </article>
          )) : <p className={styles.empty}>Không có dư nợ.</p>}
          <h2>Thông báo đã gửi</h2>
          {snapshot.payment_notices.map((notice) => (
            <article className={styles.card} key={notice.id}>
              <span className={styles.badge}>{notice.state}</span>
              <strong>{money(notice.amount_vnd)}</strong>
              <span className={styles.hint}>{notice.paid_on} · {notice.reference ?? "Không có mã giao dịch"}</span>
              <a className={styles.link} href={"/api/evidence/" + notice.evidence_id + "/signed"} rel="noreferrer" target="_blank">Mở chứng từ riêng tư</a>
              {notice.review_note ? <p>{notice.review_note}</p> : null}
            </article>
          ))}
        </section>
        <section className={styles.card}>
          <h2>Thông báo đã chuyển tiền</h2>
          <PaymentNoticeForm customerId={snapshot.customer.id} />
        </section>
      </div>
    </div>
  );
}
