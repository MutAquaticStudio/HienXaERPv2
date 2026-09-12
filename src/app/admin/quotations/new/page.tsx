import { randomUUID } from "node:crypto";
import { CommercialDocumentForm } from "@/components/sales/commercial-document-form";
import { requireInternalPermission } from "@/lib/access/context";
import { loadSalesFormOptions } from "@/modules/sales/form-options";

export default async function NewQuotationPage() {
  const access = await requireInternalPermission("quotation.create");
  const options = await loadSalesFormOptions(access.branchId);
  return <><header className="page-heading"><div><p className="eyebrow">Bán hàng</p><h1>Tạo báo giá</h1><p className="lede">Bản nháp có thể sửa ở domain; sau khi gửi, revision và các snapshot bị khóa.</p></div></header><CommercialDocumentForm kind="quote" options={options} operationId={randomUUID()} /></>;
}
