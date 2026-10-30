import { formatPortalMoney as money } from "@/modules/portal/money";
import { portalOrderProgress, portalOrderStateLabel, salesStateLabel } from "@/modules/portal/presentation";
import { randomUUID } from "node:crypto";

import Link from "next/link";
import { ChevronRight, CreditCard, Plus, Truck } from "lucide-react";
import { formatBusinessDate } from "@/lib/core/business-time";
import { QUOTATIONS_ENABLED } from "@/lib/features";

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
  // FB10: only the account owner orders; the accountant follows orders, debts and payments.
  const canOrder = snapshot.membership_role === "OWNER";
  const waiting = snapshot.orders.filter((order) => order.channel === "CUSTOMER_PORTAL" && order.state === "DRAFT").length;
  const canRespondToQuote = snapshot.quotation?.can_respond === true;
  // D29: the first order still on its way is followed step by step on the home page.
  const tracked = snapshot.orders.find((order) => portalOrderProgress(order)?.some((step) => step.state !== "done"));
  const progress = tracked ? portalOrderProgress(tracked) ?? [] : [];
  const progressPercent = progress.length ? Math.round((progress.filter((step) => step.state === "done").length / progress.length) * 100) : 0;
  // FB18: "Đặt lại nhanh" — the latest orders that went through, one tap to the order form with their goods.
  const reorderable = snapshot.orders.filter((order) => order.state !== "CANCELLED" && order.state !== "DRAFT").slice(0, 2);
  return (
    <div className={styles.page}>
      {notice && <p className={styles.status} role="status">{notice}</p>}
      <header className={styles.greeting}>
        <div><p>{snapshot.customer.code} · Hiền Xa</p><h1>{snapshot.customer.display_name}</h1></div>
      </header>

      {tracked ? <Link className={styles.trackCard} href={"/customer/orders/" + tracked.id} aria-label={`Đơn ${tracked.number ?? ""} ${portalOrderStateLabel(tracked)}`}>
        <span className={styles.currentTop}><span>{portalOrderStateLabel(tracked).toLocaleUpperCase("vi-VN")} · {tracked.number ?? "Đơn hàng"}</span><ChevronRight aria-hidden size={18} /></span>
        <span className={styles.trackMain}><span className={styles.trackIcon}><Truck aria-hidden size={24} /></span>
          <span><strong>{progress.find((step) => step.state === "current")?.label ?? "Đang xử lý"}</strong><small>{tracked.site_name ?? "Công trình"}</small></span></span>
        <span className={styles.trackBar}><span style={{ width: `${progressPercent}%` }} /></span>
      </Link> : canOrder && <Link className={`${styles.button} ${styles.buttonCommerce} ${styles.buttonBlock}`} href="/customer/orders/new"><Plus aria-hidden size={20} strokeWidth={2.4} />Đặt hàng mới</Link>}
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

      {canOrder && reorderable.length > 0 && <section aria-labelledby="reorder">
        <div className={styles.cardHead}><h2 id="reorder">Đặt lại nhanh</h2><Link className={styles.link} href="/customer/orders">Tất cả đơn</Link></div>
        <div className={styles.reorderGrid}>{reorderable.map((order) => <article key={order.id} className={styles.reorderCard}>
          <small>{order.ordered_at ? formatBusinessDate(order.ordered_at) : "Đơn trước"}{order.site_name ? ` · ${order.site_name}` : ""}</small>
          <strong>{order.number ?? "Đơn hàng"}</strong>
          <Link className={styles.reorderButton} href={`/customer/orders/new?from=${order.id}`}>Đặt lại</Link>
        </article>)}</div>
      </section>}

      {snapshot.can_view_debt && snapshot.debt && <Link className={`${styles.card} ${styles.debtRow}`} href="/customer/debts">
        <span className={styles.debtIcon}><CreditCard aria-hidden size={20} /></span>
        <span><small>Công nợ còn lại</small><strong>{money(snapshot.debt.outstanding_amount_vnd)}</strong></span>
        {Number(snapshot.debt.overdue_amount_vnd) > 0 && <span className={styles.overdueChip}>Quá hạn {money(snapshot.debt.overdue_amount_vnd)}</span>}
      </Link>}

      <section className={styles.card} aria-labelledby="recent-orders">
        <div className={styles.cardHead}><h2 id="recent-orders">Đơn gần đây</h2><span className={styles.hint}>{snapshot.orders.length} đơn</span></div>
        {snapshot.orders.length ? <ul className={styles.orderList}>{snapshot.orders.slice(0, 4).map((order) => <li key={order.id}>
          <Link href={"/customer/orders/" + order.id}><span><strong>{order.number ?? "Đơn hàng"}</strong>{order.site_name && <small className={styles.hint}>{order.site_name}</small>}</span>
            <span className={`${styles.badge} ${order.channel === "CUSTOMER_PORTAL" && order.state === "DRAFT" ? styles.badgeWarm : ""}`}>{portalOrderStateLabel(order)}</span></Link>
        </li>)}</ul> : <p className={styles.empty}>Chưa có đơn hàng.</p>}
        <Link className={styles.link} href="/customer/orders">Xem tiến trình giao nhận</Link>
      </section>
    </div>
  );
}
