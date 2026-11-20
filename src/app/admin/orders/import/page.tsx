
import { requireInternalPermission } from "@/lib/access/context";
import { OrderImportForm } from "@/modules/sales/order-import-form";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { currentSkin } from "@/lib/skin";
import { AxButtonLink } from "@/components/astryx/ax-kit";
import { AxFormPage } from "@/components/astryx/sales-kit";

/** FB15 (D37): create many sales orders at once from the Excel template. */
export default async function OrderImportPage() {
  const access = await requireInternalPermission("orders.create");
  const form = <OrderImportForm canConfirm={access.permissions.has("orders.confirm")} canManageCustomers={access.permissions.has("customers.manage")} />;
  if ((await currentSkin()) === "astryx") return <AxFormPage crumbs={["Bán hàng", "Đơn bán", "Nhập từ Excel"]} title="Nhập đơn bán từ Excel" lede="Tạo nhiều đơn bán cùng lúc từ file mẫu. Các đơn được tạo ở trạng thái nháp để kiểm tra rồi xác nhận như đơn thường." actions={<AxButtonLink href="/admin/orders">Về danh sách</AxButtonLink>}>{form}</AxFormPage>;
  return <>
    <header className="page-heading">
      <div><Breadcrumb parent={{ href: "/admin/orders", label: "Đơn bán" }} /><h1>Nhập đơn bán từ Excel</h1>
        <p className="lede">Tạo nhiều đơn bán cùng lúc từ file mẫu. Các đơn được tạo ở trạng thái nháp để kiểm tra rồi xác nhận như đơn thường.</p></div>
    </header>
    {form}
  </>;
}
