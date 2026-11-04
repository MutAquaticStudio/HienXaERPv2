
import { requireInternalPermission } from "@/lib/access/context";
import { OrderImportForm } from "@/modules/sales/order-import-form";
import { Breadcrumb } from "@/components/ui/breadcrumb";

/** FB15 (D37): create many sales orders at once from the Excel template. */
export default async function OrderImportPage() {
  const access = await requireInternalPermission("orders.create");
  return <>
    <header className="page-heading">
      <div><Breadcrumb parent={{ href: "/admin/orders", label: "Đơn bán" }} /><h1>Nhập đơn bán từ Excel</h1>
        <p className="lede">Tạo nhiều đơn bán cùng lúc từ file mẫu. Các đơn được tạo ở trạng thái nháp để kiểm tra rồi xác nhận như đơn thường.</p></div>
    </header>
    <OrderImportForm canConfirm={access.permissions.has("orders.confirm")} canManageCustomers={access.permissions.has("customers.manage")} />
  </>;
}
