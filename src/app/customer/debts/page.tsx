import { formatPortalMoney as money } from "@/modules/portal/money";
import { formatBusinessDate } from "@/lib/core/business-time";
import { financeSourceLabel, financeStateLabel } from "@/modules/finance/presentation";
import styles from "@/components/portal/portal.module.css";
import { PaymentNoticeForm } from "@/components/portal/payment-notice-form";
import { PAYMENT_NOTICES_ENABLED } from "@/lib/features";
import { getCustomerPortalSnapshot } from "@/modules/portal/actions";
import { authenticatedPortalClient } from "@/modules/portal/server";
import { CopyButton } from "@/components/portal/copy-button";

/** FB18: the bank account the owner marked "Hiện cho khách" in the cash book, or null. */
async function paymentAccount(customerId: string) {
  try {
    const context = await authenticatedPortalClient();
    if (!context) return null;
    const { data, error } = await context.supabase.rpc("portal_payment_account", { target_customer_id: customerId });
    if (error) return null;
    return ((data ?? []) as Array<{ bank_name: string; account_number: string; account_holder: string }>)[0] ?? null;
  } catch {
    // The transfer box is optional; the debt list still shows when it cannot be read.
    return null;
  }
}


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
  const bank = await paymentAccount(snapshot.customer.id);
  const transferNote = `${snapshot.customer.code} thanh toan`;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.heroEyebrow}>Công nợ hiện tại</p>
        <h1>{money(snapshot.debt.outstanding_amount_vnd)}</h1>
        <p>Quá hạn: {money(snapshot.debt.overdue_amount_vnd)}</p>
      </header>
      {bank && <section className={styles.bankCard} aria-labelledby="bank-title">
        <h2 id="bank-title">Chuyển khoản cho cửa hàng</h2>
        <div className={styles.bankRow}><span><small>{bank.bank_name}</small><strong>{bank.account_number}</strong><small>{bank.account_holder}</small></span><CopyButton value={bank.account_number} label="Sao chép số TK" /></div>
        <div className={styles.bankRow}><span><small>Nội dung chuyển khoản</small><strong>{transferNote}</strong></span><CopyButton value={transferNote} /></div>
      </section>}
      <div className={styles.split}>
        <section className={styles.card}>
          <h2>Khoản cần thanh toán</h2>
          {snapshot.debt.items.length ? snapshot.debt.items.map((item) => (
            <article className={styles.billRow} key={item.id}>
              <span>{item.source_number ?? financeSourceLabel(item.source_type)}<small data-overdue={item.due_date && item.due_date < today ? "true" : undefined}>{item.due_date && item.due_date < today ? "Quá hạn · " : ""}Hạn {item.due_date ? formatBusinessDate(item.due_date) : "chưa chốt"}</small></span>
              <strong>{money(item.outstanding_amount_vnd ?? 0)}</strong>
            </article>
          )) : <p className={styles.empty}>Không có dư nợ.</p>}
          {PAYMENT_NOTICES_ENABLED && <h2>Thông báo đã gửi</h2>}
          {PAYMENT_NOTICES_ENABLED && snapshot.payment_notices.map((notice) => (
            <article className={styles.card} key={notice.id}>
              <span className={styles.badge}>{financeStateLabel(notice.state)}</span>
              <strong>{money(notice.amount_vnd)}</strong>
              <span className={styles.hint}>{formatBusinessDate(notice.paid_on)} · {notice.reference ?? "Không có mã giao dịch"}</span>
              <a className={styles.link} href={"/api/evidence/" + notice.evidence_id + "/download"} rel="noreferrer" target="_blank">Mở chứng từ riêng tư</a>
              {notice.review_note ? <p>{notice.review_note}</p> : null}
            </article>
          ))}
        </section>
        {PAYMENT_NOTICES_ENABLED && <section className={styles.card}>
          <h2>Thông báo đã chuyển tiền</h2>
          <PaymentNoticeForm customerId={snapshot.customer.id} />
        </section>}
      </div>
    </div>
  );
}
