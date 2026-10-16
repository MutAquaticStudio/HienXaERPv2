import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { PurchaseOrderForm } from "@/components/purchasing/purchase-order-form";
import { requireInternalPermission } from "@/lib/access/context";
import { loadPurchaseFormOptions, loadSalesLineContext } from "@/modules/purchasing/form-options";

export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ salesLineId?: string; supplier?: string; warehouse?: string; material?: string }> }) {
  const access = await requireInternalPermission("purchasing.create");
  const query = await searchParams;
  const [options, salesLine] = await Promise.all([
    loadPurchaseFormOptions(access.branchId, query.supplier),
    query.salesLineId ? loadSalesLineContext(query.salesLineId, access.branchId) : Promise.resolve(null),
  ]);
  if (query.salesLineId && !salesLine) notFound();
  return <><header className="page-heading"><div><p className="eyebrow">Cung ứng</p><h1>{salesLine ? "Đặt NCC giao thẳng" : "Tạo đơn mua"}</h1><p className="lede">{salesLine ? "Chọn nhiều dòng còn thiếu nguồn của cùng đơn bán; mỗi dòng mua gắn đúng dòng bán." : "Tìm vật tư (F3), nhập số lượng, chọn nhà cung cấp rồi tạo đơn mua."}</p></div></header><PurchaseOrderForm options={options} operationId={randomUUID()} confirmOperationId={randomUUID()} canConfirm={access.permissions.has("purchasing.confirm")} salesLine={salesLine} canManageWarehouse={access.permissions.has("roles.manage")} canCreateSales={access.permissions.has("orders.create")} canManagePrice={access.permissions.has("purchasing.price.manage")} canReadPrice={access.permissions.has("purchasing.price.read")} canManageSalesPrice={access.permissions.has("pricing.manage")} initialSupplierId={query.supplier} initialWarehouseId={query.warehouse} initialMaterialId={query.material} /></>;
}
