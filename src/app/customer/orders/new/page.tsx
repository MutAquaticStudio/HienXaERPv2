import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import styles from "@/components/portal/portal.module.css";
import { PortalOrderForm } from "@/components/portal/portal-order-form";
import { getPortalCatalog } from "@/modules/portal/order-actions";
import { getCustomerPortalOrder } from "@/modules/portal/actions";
import { reorderLines } from "@/modules/portal/reorder";

export default async function CustomerNewOrderPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const catalog = await getPortalCatalog((await cookies()).get("hx_customer_id")?.value);
  // FB18: "Đặt lại" opens this form with an earlier order's goods at today's prices.
  const from = (await searchParams).from;
  const initial = from && /^[0-9a-f-]{36}$/i.test(from) ? await getCustomerPortalOrder(from).then((order) => reorderLines(order, catalog)).catch(() => undefined) : undefined;
  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <Link className={styles.backButton} href="/customer" aria-label="Quay lại"><ChevronLeft aria-hidden size={20} /></Link>
        <div><p>{catalog.customer.display_name} · giá theo bảng giá của bạn</p><h1>Đặt hàng</h1></div>
      </header>
      <PortalOrderForm catalog={catalog} operationId={randomUUID()} initial={initial} />
    </div>
  );
}
