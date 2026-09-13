import styles from "@/components/portal/portal.module.css";
import { getCustomerPortalOrder } from "@/modules/portal/actions";

export default async function CustomerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getCustomerPortalOrder(id);
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.heroEyebrow}>Đơn hàng</p>
        <h1>{order.number ?? "Chi tiết đơn hàng"}</h1>
        <p>Trạng thái: {order.state ?? "Đang xử lý"}</p>
      </header>
      <section className={styles.card}>
        <h2>Tiến trình giao nhận</h2>
        <div className={styles.timeline}>
          {order.deliveries.length ? order.deliveries.map((delivery) => (
            <article className={styles.timelineItem} key={delivery.id}>
              <strong>{delivery.number ?? "Lượt giao"} · {delivery.state ?? "Đang xử lý"}</strong>
              <span className={styles.hint}>{delivery.address ?? delivery.site_name ?? "Địa điểm đang cập nhật"}</span>
              {delivery.scheduled_at ? <span className={styles.hint}>Dự kiến: {new Date(delivery.scheduled_at).toLocaleString("vi-VN")}</span> : null}
              {delivery.delivered_at ? <span className={styles.hint}>Hoàn tất: {new Date(delivery.delivered_at).toLocaleString("vi-VN")}</span> : null}
            </article>
          )) : <p className={styles.empty}>Chưa phát sinh lượt giao.</p>}
        </div>
      </section>
    </div>
  );
}
