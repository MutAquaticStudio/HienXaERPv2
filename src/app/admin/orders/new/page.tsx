import { randomUUID } from "node:crypto";
import { CommercialDocumentForm } from "@/components/sales/commercial-document-form";
import { requireInternalPermission } from "@/lib/access/context";
import { loadPrepaymentOptions, loadSalesFormOptions } from "@/modules/sales/form-options";
import { canChooseSeller, loadSellers } from "@/modules/sales/seller";
import { createServerSupabase } from "@/lib/supabase/server";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { currentSkin } from "@/lib/skin";
import { AxButtonLink } from "@/components/astryx/ax-kit";
import { AxFormPage } from "@/components/astryx/sales-kit";

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ customer?: string; site?: string; material?: string }> }) {
  const access = await requireInternalPermission("orders.create");
  const query = await searchParams;
  const [options, prepayment, sellers] = await Promise.all([
    loadSalesFormOptions(access.branchId, query.customer, query.site, access.permissions.has("inventory.read")),
    // FB5: "Khách trả trước" is offered to whoever may record receipts.
    access.permissions.has("finance.payment.post") ? loadPrepaymentOptions(access.branchId) : Promise.resolve(null),
    // FB16 (D38): only the owner names the seller.
    canChooseSeller(access.permissions) ? createServerSupabase().then((supabase) => loadSellers(supabase, access.branchId)) : Promise.resolve(null),
  ]);
  const form = <CommercialDocumentForm kind="order" options={options} operationId={randomUUID()} confirmOperationId={randomUUID()} canConfirm={access.permissions.has("orders.confirm")} canManagePrice={access.permissions.has("pricing.manage")} canManageCustomers={access.permissions.has("customers.manage")} initialCustomerId={query.customer} initialSiteId={query.site} initialMaterialId={query.material} prepayment={prepayment} sellers={sellers?.filter((seller) => seller.assignable)} />;
  if ((await currentSkin()) === "astryx") return <AxFormPage crumbs={["Bán hàng", "Đơn bán", "Tạo mới"]} title="Tạo đơn bán" lede="Tìm vật tư (F3), nhập số lượng, chọn khách và công trình rồi tạo đơn."
    actions={<AxButtonLink href="/admin/orders">Về danh sách</AxButtonLink>}>{form}</AxFormPage>;
  return <div className="page-stack"><header className="page-heading"><div><Breadcrumb parent={{ href: "/admin/orders", label: "Đơn bán" }} /><h1>Tạo đơn bán</h1><p className="lede">Tìm vật tư (F3), nhập số lượng, chọn khách và công trình rồi tạo đơn.</p></div></header>{form}</div>;
}
