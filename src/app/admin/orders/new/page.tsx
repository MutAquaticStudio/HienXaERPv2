import { randomUUID } from "node:crypto";
import { CommercialDocumentForm } from "@/components/sales/commercial-document-form";
import { requireInternalPermission } from "@/lib/access/context";
import { loadSalesFormOptions } from "@/modules/sales/form-options";

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ customer?: string; site?: string; material?: string }> }) {
  const access = await requireInternalPermission("orders.create");
  const query = await searchParams;
  const options = await loadSalesFormOptions(access.branchId, query.customer, query.site, access.permissions.has("inventory.read"));
  return <><header className="page-heading"><div><p className="eyebrow">Bán hàng</p><h1>Tạo đơn bán</h1><p className="lede">Thêm nhiều dòng vật tư, xem giá và tổng trước khi lưu; hệ thống kiểm lại giá và thông tin khi tạo bản nháp.</p></div></header><CommercialDocumentForm kind="order" options={options} operationId={randomUUID()} canManagePrice={access.permissions.has("pricing.manage")} canManageCustomers={access.permissions.has("customers.manage")} initialCustomerId={query.customer} initialSiteId={query.site} initialMaterialId={query.material} /></>;
}
