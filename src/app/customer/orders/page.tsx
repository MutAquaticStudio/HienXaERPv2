import { salesStateLabel } from "@/modules/portal/presentation";
import Link from "next/link";

import styles from "@/components/portal/portal.module.css";
import { getCustomerPortalSnapshot } from "@/modules/portal/actions";

export default async function CustomerOrdersPage() {
  const snapshot = await getCustomerPortalSnapshot();
  return (
    <div className={styles.page}>
      <header className={styles.sectionHead}>
        <div><h1>Đơn hàng và giao nhận</h1><p>Timeline chỉ chứa thông tin an toàn dành cho khách hàng.</p></div>
      </header>
      <div className={styles.grid}>
        {snapshot.orders.length ? snapshot.orders.map((order) => (
          <article className={styles.card} key={order.id}>
            <span className={styles.badge}>{salesStateLabel(order.state)}</span>
            <h2>{order.number ?? "Đơn hàng"}</h2>
            <div className={styles.meta}>
              <span>{order.deliveries.length} lượt giao</span>
              <span>{order.requested_delivery_date ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(order.requested_delivery_date)) : "Chưa chốt ngày giao"}</span>
            </div>
            <Link className={styles.buttonSecondary} href={"/customer/orders/" + order.id}>Xem timeline</Link>
          </article>
        )) : <p className={styles.empty}>Chưa có đơn hàng.</p>}
      </div>
    </div>
  );
}
