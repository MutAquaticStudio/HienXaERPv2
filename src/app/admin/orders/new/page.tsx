import { randomUUID } from "node:crypto";
import { CommercialDocumentForm } from "@/components/sales/commercial-document-form";
import { requireInternalPermission } from "@/lib/access/context";
import { loadSalesFormOptions } from "@/modules/sales/form-options";

export default async function NewOrderPage() {
  const access = await requireInternalPermission("orders.create");
  const options = await loadSalesFormOptions(access.branchId);
  return <><header className="page-heading"><div><p className="eyebrow">Bán hàng</p><h1>Tạo đơn bán</h1><p className="lede">Nhập một dòng hàng nhanh; giá, UOM và snapshot được kiểm lại tại transaction boundary.</p></div></header><CommercialDocumentForm kind="order" options={options} operationId={randomUUID()} /></>;
}
