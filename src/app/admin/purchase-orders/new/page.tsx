import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { PurchaseOrderForm } from "@/components/purchasing/purchase-order-form";
import { QuickSupplierForm } from "@/components/purchasing/quick-supplier-form";
import { requireInternalPermission } from "@/lib/access/context";
import { loadPurchaseFormOptions, loadSalesLineContext } from "@/modules/purchasing/form-options";

export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ salesLineId?: string }> }) {
  const access = await requireInternalPermission("purchasing.create");
  const query = await searchParams;
  const [options, salesLine] = await Promise.all([
    loadPurchaseFormOptions(access.branchId),
    query.salesLineId ? loadSalesLineContext(query.salesLineId, access.branchId) : Promise.resolve(null),
  ]);
  if (query.salesLineId && !salesLine) notFound();
  return <><header className="page-heading"><div><p className="eyebrow">Cung ứng</p><h1>{salesLine ? "Đặt NCC giao thẳng" : "Tạo đơn mua"}</h1><p className="lede">{salesLine ? "Context khách hàng, công trình, vật tư và phần còn thiếu được mang từ đơn bán." : "Chọn mua về kho hoặc tạo đồng thời hai draft liên kết cho đường giao thẳng."}</p></div></header><div className="purchase-create-stack"><QuickSupplierForm operationId={randomUUID()} /><PurchaseOrderForm options={options} operationId={randomUUID()} salesLine={salesLine} canCreateSales={access.permissions.has("orders.create")} canManagePrice={access.permissions.has("purchasing.price.manage")} /></div></>;
}
