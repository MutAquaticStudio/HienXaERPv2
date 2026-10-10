import { randomUUID } from "node:crypto";
import { CommercialDocumentForm } from "@/components/sales/commercial-document-form";
import { requireInternalPermission } from "@/lib/access/context";
import { loadSalesFormOptions } from "@/modules/sales/form-options";

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ customer?: string; site?: string }> }) {
  const access = await requireInternalPermission("quotation.create");
  const query = await searchParams;
  const options = await loadSalesFormOptions(access.branchId, query.customer, query.site, access.permissions.has("inventory.read"));
  return <><header className="page-heading"><div><p className="eyebrow">Bán hàng</p><h1>Tạo báo giá</h1><p className="lede">Xem giá từng dòng và tổng trước khi lưu; sau khi gửi, phiên bản và thông tin báo giá được khóa.</p></div></header><CommercialDocumentForm kind="quote" options={options} operationId={randomUUID()} canManagePrice={access.permissions.has("pricing.manage")} canManageCustomers={access.permissions.has("customers.manage")} initialCustomerId={query.customer} initialSiteId={query.site} /></>;
}
