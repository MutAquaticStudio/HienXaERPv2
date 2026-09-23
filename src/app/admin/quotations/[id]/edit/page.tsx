import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommercialDocumentForm, type ExistingCommercialDraft } from "@/components/sales/commercial-document-form";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadSalesFormOptions } from "@/modules/sales/form-options";

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireInternalPermission("quotation.create");
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: quote, error: quoteError } = await supabase.from("quotations")
    .select("id, branch_id, quotation_number, customer_id, site_id, current_revision_id")
    .eq("id", id).eq("branch_id", access.branchId).maybeSingle();
  if (quoteError || !quote?.current_revision_id) notFound();
  const [revisionResult, lineResult] = await Promise.all([
    supabase.from("quotation_revisions").select("id, state, draft_version, expires_at, commercial_terms")
      .eq("id", quote.current_revision_id).eq("quotation_id", quote.id).maybeSingle(),
    supabase.from("quotation_lines").select("id, material_id, ordered_uom_id, quantity, unit_price_vnd, price_source_type, override_reason")
      .eq("revision_id", quote.current_revision_id).order("line_number"),
  ]);
  const revision = revisionResult.data;
  if (revisionResult.error || lineResult.error || !revision || revision.state !== "DRAFT" || !lineResult.data?.length) notFound();
  const options = await loadSalesFormOptions(access.branchId, quote.customer_id, quote.site_id);
  const existing: ExistingCommercialDraft = {
    id: revision.id, version: revision.draft_version, customerId: quote.customer_id, siteId: quote.site_id,
    effectiveAt: revision.expires_at, terms: revision.commercial_terms,
    lines: lineResult.data.map((line) => ({ sourceLineId: line.id, materialId: line.material_id, uomId: line.ordered_uom_id,
      quantity: String(line.quantity), manualPriceVnd: line.price_source_type === "MANUAL_APPROVED" ? String(line.unit_price_vnd) : "",
      manualReason: line.price_source_type === "MANUAL_APPROVED" ? line.override_reason ?? "" : "" })),
  };
  return <><header className="page-heading"><div><p className="eyebrow">Báo giá · Bản nháp</p><h1>Sửa {quote.quotation_number}</h1><p className="lede">Sửa cùng revision trước khi gửi; sau khi gửi, lịch sử được khóa.</p></div><Link className="button button-secondary" href={`/admin/quotations/${id}`}>Về báo giá</Link></header>
    <CommercialDocumentForm kind="quote" options={options} operationId={randomUUID()} canManagePrice={access.permissions.has("pricing.manage")} canManageCustomers={false} existing={existing} /></>;
}
