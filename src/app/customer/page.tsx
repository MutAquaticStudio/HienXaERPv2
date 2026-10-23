import { formatPortalMoney as money } from "@/modules/portal/money";
import { portalOrderProgress, portalOrderStateLabel, salesStateLabel } from "@/modules/portal/presentation";
import { randomUUID } from "node:crypto";

import Link from "next/link";
import { Plus } from "lucide-react";
import { PAYMENT_NOTICES_ENABLED, QUOTATIONS_ENABLED } from "@/lib/features";

import { OrderProgress } from "@/components/portal/order-progress";
import styles from "@/components/portal/portal.module.css";
import { getCustomerPortalSnapshot, requestQuotationChangeAction } from "@/modules/portal/actions";


const notices: Record<string, string> = {
  registered: "Đã tạo tài khoản. Cửa hàng đã nhận thông tin của bạn — bạn có thể đặt hàng ngay.",
  "password-changed": "Đã đổi mật khẩu.",
  "order-not-allowed": "Tài khoản của bạn chỉ theo dõi giao nhận, không đặt hàng được. Liên hệ cửa hàng nếu cần đặt hàng.",
};

export default async function CustomerHomePage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const notice = notices[(await searchParams).notice ?? ""];
  const snapshot = await getCustomerPortalSnapshot();
  const canOrder = snapshot.membership_role !== "RECEIVER";
  const waiting = snapshot.orders.filter((order) => order.channel === "CUSTOMER_PORTAL" && order.state === "DRAFT").length;
  const canRespondToQuote = snapshot.quotation?.can_respond === true;
  // D29: the first order still on its way is followed step by step on the home page.
  const tracked = snapshot.orders.find((order) => portalOrderProgress(order)?.some((step) => step.state !== "done"));
  return (
    <div className={styles.page}>
      {notice && <p className={styles.status} role="status">{notice}</p>}
      <header className={styles.hero}>
        <p className={styles.heroEyebrow}>{snapshot.customer.code}</p>
        <h1>{snapshot.customer.display_name}</h1>
        <p>{QUOTATIONS_ENABLED ? "Báo giá cần xử lý, đơn hàng, giao nhận" : "Đơn hàng, giao nhận"} và công nợ theo đúng vai trò truy cập.</p>
      </header>
      {canOrder && <Link className={`${styles.button} ${styles.buttonCommerce} ${styles.buttonBlock}`} href="/customer/orders/new"><Plus aria-hidden size={20} strokeWidth={2.4} />Đặt hàng mới</Link>}
      {waiting > 0 && <p className={styles.status} role="status">{waiting} đơn đang chờ cửa hàng duyệt. <Link className={styles.link} href="/customer/orders">Xem đơn</Link></p>}

      {QUOTATIONS_ENABLED && snapshot.quotation ? (
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

      {tracked && <section className={styles.card} aria-labelledby="tracked-order">
        <div className={styles.cardHead}>
          <h2 id="tracked-order">{tracked.number ?? "Đơn hàng"}</h2>
          <span className={`${styles.badge} ${tracked.channel === "CUSTOMER_PORTAL" && tracked.state === "DRAFT" ? styles.badgeWarm : ""}`}>{portalOrderStateLabel(tracked)}</span>
        </div>
        {tracked.site_name && <p className={styles.hint}>{tracked.site_name}</p>}
        <OrderProgress order={tracked} />
        <Link className={styles.link} href={"/customer/orders/" + tracked.id}>Xem chi tiết đơn</Link>
      </section>}

      <div className={styles.gridTwo}>
        {snapshot.can_view_debt && snapshot.debt ? (
          <section className={`${styles.card} ${styles.debtCard}`}>
            <span className={styles.badge}>CÔNG NỢ</span>
            <p className={styles.amount}>{money(snapshot.debt.outstanding_amount_vnd)}</p>
            <p>Quá hạn {money(snapshot.debt.overdue_amount_vnd)}</p>
            <Link className={styles.link} href="/customer/debts">{PAYMENT_NOTICES_ENABLED ? "Xem và gửi thông báo thanh toán" : "Xem công nợ"}</Link>
          </section>
        ) : (
          <section className={styles.card}>
            <span className={styles.badge}>GIAO NHẬN</span>
            <p>Vai trò Người nhận chỉ thấy ngữ cảnh cần thiết để nhận hàng.</p>
            <Link className={styles.link} href="/customer/orders">Xem lịch giao</Link>
          </section>
        )}
        <section className={styles.card} aria-labelledby="recent-orders">
          <div className={styles.cardHead}><h2 id="recent-orders">Đơn gần đây</h2><span className={styles.hint}>{snapshot.orders.length} đơn</span></div>
          {snapshot.orders.length ? <ul className={styles.orderList}>{snapshot.orders.slice(0, 3).map((order) => <li key={order.id}>
            <Link href={"/customer/orders/" + order.id}><span><strong>{order.number ?? "Đơn hàng"}</strong>{order.site_name && <small className={styles.hint}>{order.site_name}</small>}</span>
              <span className={`${styles.badge} ${order.channel === "CUSTOMER_PORTAL" && order.state === "DRAFT" ? styles.badgeWarm : ""}`}>{portalOrderStateLabel(order)}</span></Link>
          </li>)}</ul> : <p className={styles.empty}>Chưa có đơn hàng.</p>}
          <Link className={styles.link} href="/customer/orders">Xem tiến trình giao nhận</Link>
        </section>
      </div>
    </div>
  );
}
