import { formatPortalMoney as money } from "@/modules/portal/money";
import { salesStateLabel } from "@/modules/portal/presentation";
import { randomUUID } from "node:crypto";

import Link from "next/link";

import styles from "@/components/portal/portal.module.css";
import { getCustomerPortalSnapshot, requestQuotationChangeAction } from "@/modules/portal/actions";


export default async function CustomerHomePage() {
  const snapshot = await getCustomerPortalSnapshot();
  const canRespondToQuote = snapshot.quotation?.can_respond === true;
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.heroEyebrow}>{snapshot.customer.code}</p>
        <h1>{snapshot.customer.display_name}</h1>
        <p>Báo giá cần xử lý, đơn hàng, giao nhận và công nợ theo đúng vai trò truy cập.</p>
      </header>

      {snapshot.quotation ? (
        <section className={styles.card + " " + styles.cardAccent}>
          <span className={styles.badge}>BÁO GIÁ · {salesStateLabel(snapshot.quotation.state)}</span>
          <h2>{snapshot.quotation.number ?? "Báo giá hiện tại"}</h2>
          <p>Các phản hồi áp dụng cho phiên bản báo giá hiện tại.</p>
          <div className={styles.actions}>
            <Link className={styles.button} href={"/customer/quotations/" + snapshot.quotation.id}>{canRespondToQuote ? "Xem và chấp nhận" : "Xem báo giá"}</Link>
          </div>
          {canRespondToQuote && <form action={requestQuotationChangeAction} className={styles.form}>
            <input name="revision_id" type="hidden" value={snapshot.quotation.current_revision_id} />
            <input name="operation_id" type="hidden" value={randomUUID()} />
            <div className={styles.field}>
              <label htmlFor="quote-change-reason">Yêu cầu điều chỉnh báo giá</label>
              <textarea id="quote-change-reason" maxLength={1000} minLength={10} name="reason" required />
            </div>
            <button className={styles.buttonSecondary} type="submit">Gửi yêu cầu theo phiên bản này</button>
          </form>}
        </section>
      ) : null}

      <div className={styles.gridTwo}>
        <section className={styles.card}>
          <span className={styles.badge}>ĐƠN HÀNG</span>
          <p className={styles.amount}>{snapshot.orders.length}</p>
          <p>Đơn hàng trong phạm vi khách hàng này.</p>
          <Link className={styles.link} href="/customer/orders">Xem tiến trình giao nhận</Link>
        </section>
        {snapshot.can_view_debt && snapshot.debt ? (
          <section className={styles.card}>
            <span className={styles.badge}>CÔNG NỢ</span>
            <p className={styles.amount}>{money(snapshot.debt.outstanding_amount_vnd)}</p>
            <p>Quá hạn {money(snapshot.debt.overdue_amount_vnd)}</p>
            <Link className={styles.link} href="/customer/debts">Xem và gửi thông báo thanh toán</Link>
          </section>
        ) : (
          <section className={styles.card}>
            <span className={styles.badge}>GIAO NHẬN</span>
            <p>Vai trò Người nhận chỉ thấy ngữ cảnh cần thiết để nhận hàng.</p>
            <Link className={styles.link} href="/customer/orders">Xem lịch giao</Link>
          </section>
        )}
      </div>
    </div>
  );
}
