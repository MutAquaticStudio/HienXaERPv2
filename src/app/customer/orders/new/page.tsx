import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import styles from "@/components/portal/portal.module.css";
import { PortalOrderForm } from "@/components/portal/portal-order-form";
import { getPortalCatalog } from "@/modules/portal/order-actions";

export default async function CustomerNewOrderPage() {
  const catalog = await getPortalCatalog((await cookies()).get("hx_customer_id")?.value);
  return (
    <div className={styles.page}>
      <header className={styles.sectionHead}>
        <div><h1>Đặt hàng</h1><p>{catalog.customer.display_name} · Giá theo bảng giá của bạn. Cửa hàng duyệt đơn rồi báo ngày giao.</p></div>
      </header>
      <PortalOrderForm catalog={catalog} operationId={randomUUID()} />
    </div>
  );
}
