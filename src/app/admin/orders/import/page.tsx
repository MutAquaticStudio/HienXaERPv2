import Link from "next/link";

import { requireInternalPermission } from "@/lib/access/context";
import { OrderImportForm } from "@/modules/sales/order-import-form";

/** FB15 (D37): create many sales orders at once from the Excel template. */
export default async function OrderImportPage() {
  await requireInternalPermission("orders.create");
  return <>
    <header className="page-heading">
      <div><p className="eyebrow"><Link href="/admin/orders">Đơn bán</Link></p><h1>Nhập đơn bán từ Excel</h1>
        <p className="lede">Tạo nhiều đơn bán cùng lúc từ file mẫu. Các đơn được tạo ở trạng thái nháp để kiểm tra rồi xác nhận như đơn thường.</p></div>
    </header>
    <OrderImportForm />
  </>;
}
