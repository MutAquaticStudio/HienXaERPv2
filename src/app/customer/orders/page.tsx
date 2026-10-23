import { formatBusinessDateTime } from "@/lib/core/business-time";
import { portalOrderStateLabel } from "@/modules/portal/presentation";
import Link from "next/link";

import { OrderProgress } from "@/components/portal/order-progress";
import styles from "@/components/portal/portal.module.css";
import { getCustomerPortalSnapshot } from "@/modules/portal/actions";

export default async function CustomerOrdersPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const snapshot = await getCustomerPortalSnapshot();
  const query = await searchParams;
  return (
    <div className={styles.page}>
      {query.notice === "order-unavailable" && <p className={styles.status} role="status">Đơn hàng không thuộc phạm vi truy cập của bạn. Hãy chọn đơn trong danh sách khách hàng hiện tại.</p>}
      <header className={styles.sectionHead}>
        <div><h1>Đơn hàng và giao nhận</h1><p>Theo dõi tiến trình giao nhận và thông tin đơn hàng của bạn.</p></div>
        {snapshot.membership_role === "OWNER" && <Link className={styles.button} href="/customer/orders/new">Đặt hàng</Link>}
      </header>
      <div className={styles.grid}>
        {snapshot.orders.length ? snapshot.orders.map((order) => (
          <article className={styles.card} key={order.id}>
            <span className={`${styles.badge} ${order.channel === "CUSTOMER_PORTAL" && order.state === "DRAFT" ? styles.badgeWarm : ""}`}>{portalOrderStateLabel(order)}</span>
            <h2>{order.number ?? "Đơn hàng"}</h2>
            <div className={styles.meta}>
              {order.site_name && <span>{order.site_name}</span>}
              <span>{order.deliveries.length} lượt giao</span>
              <span>{order.requested_delivery_date ? formatBusinessDateTime(order.requested_delivery_date) : "Chưa chốt ngày giao"}</span>
            </div>
            <OrderProgress order={order} compact />
            <Link className={styles.buttonSecondary} href={"/customer/orders/" + order.id}>Xem tiến trình</Link>
          </article>
        )) : <p className={styles.empty}>Chưa có đơn hàng.</p>}
      </div>
    </div>
  );
}
