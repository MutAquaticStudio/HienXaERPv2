"use server";

import Decimal from "decimal.js";
import { finalSellingPriceReason } from "./final-price";
import { isPositiveSalesQuantity } from "./quantity-input";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AppError, operationalPostingError, quantityInputError } from "@/lib/core/errors";
import { isExactBaseQuantity } from "@/lib/core/quantity";
import { requireCustomerAccess, requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { QUOTATIONS_DISABLED_MESSAGE, QUOTATIONS_ENABLED } from "@/lib/features";
import { resolvePrice, type PriceRule } from "@/modules/pricing/resolve-price";

const CommercialDecimal = Decimal.clone({ precision: 50 });

export type SalesActionState = { message: string; success?: boolean; outcomeUnknown?: boolean } | undefined;

const positiveDecimal = z.string().trim().refine((value) => {
  try { return isPositiveSalesQuantity(value); } catch { return false; }
}, "Số lượng không hợp lệ.");
const lineSchema = z.object({ materialId: z.uuid(), orderedUomId: z.uuid(), quantity: positiveDecimal,
  manualPriceVnd: z.string().trim().optional(), manualReason: z.string().trim().optional(),
  sourceLineId: z.union([z.uuid(), z.literal("")]).optional() });
const documentSchema = z.object({
  customerId: z.uuid(), siteId: z.uuid(),
  lines: z.array(lineSchema).min(1).max(50),
});
const createSchema = documentSchema.extend({ effectiveAt: z.string().trim().optional(), terms: z.string().trim().max(1000).optional(), operationId: z.uuid() });
const editSchema = z.object({ documentId: z.uuid(), expectedVersion: z.coerce.number<number>().int().positive() });
const previewSchema = documentSchema.extend({ kind: z.enum(["order", "quote"]),
  documentId: z.uuid().optional(), expectedVersion: z.number().int().positive().optional() });
const previewLineSchema = z.object({ materialId: z.uuid(), orderedUomId: z.uuid(), quantity: z.string(),
  unitPriceVnd: z.string(), priceSourceType: z.string(), lineTotalVnd: z.string(),
  pricingRuleId: z.uuid().nullable(), pricingRuleVersion: z.number().int().nullable(), overrideReason: z.string().nullable() });
export type PricePreviewLine = z.infer<typeof previewLineSchema>;
export type PricePreviewResult = { success: boolean; message: string; lines?: PricePreviewLine[]; totalVnd?: string };
const commandSchema = z.object({ entityId: z.uuid(), operationId: z.uuid() });

function commandError(message: string, confirmingOrder = false) {
  const postingError = operationalPostingError(message, confirmingOrder ? "sales-order-confirmation" : "posting");
  if (postingError) return postingError;
  const quantityError = quantityInputError(message);
  if (quantityError) return quantityError;
  if (message.includes("pricing_rule_priority_mismatch") || message.includes("pricing_source_snapshot_mismatch")) return "Bảng giá hoặc nguồn giá đã thay đổi. Tải lại và xem trước giá, hoặc dùng giá thủ công được phê duyệt kèm lý do.";
  if (message.includes("pricing_priority_ambiguous")) return "Có nhiều bảng giá cùng mức ưu tiên và phiên bản. Cần đối chiếu bảng giá hoặc dùng giá thủ công được phê duyệt.";
  if (message.includes("sales_order_not_confirmable")) return "Đơn bán không còn ở trạng thái có thể xác nhận. Hãy tải lại để kiểm tra.";
  if (message.includes("order_lines_required")) return "Vui lòng thêm ít nhất một dòng vật tư cho đơn bán.";
  if (confirmingOrder && message.includes("forbidden")) return "Bạn không có quyền xác nhận đơn bán tại chi nhánh này.";
  if (message.includes("sales_order_unresolved_execution")) return "Còn giao hàng, việc hoặc hàng đang vận chuyển chưa xử lý. Hãy hoàn tất trước khi đóng phần còn lại.";
  if (message.includes("sales_order_has_no_remaining")) return "Đơn không còn số lượng chưa giao để đóng.";
  if (message.includes("sales_order_not_closeable")) return "Đơn không còn ở trạng thái có thể đóng phần còn lại. Hãy tải lại.";
  if (message.includes("credit_limit_exceeded")) return "Hạn mức tín dụng không đủ để xác nhận đơn.";
  if (message.includes("credit_limit_not_approved")) return "Khách hàng chưa có hạn mức tín dụng được duyệt.";
  if (message.includes("overdue_receivable_blocks_credit")) return "Khách hàng có công nợ quá hạn; chưa thể xác nhận đơn.";
  if (message.includes("operation_payload_conflict")) return "Mã thao tác đã được dùng với dữ liệu khác. Hãy tải lại màn hình.";
  if (message.includes("draft_version_conflict")) return "Bản nháp đã được người khác sửa. Hãy tải lại trước khi tiếp tục.";
  if (message.includes("not_editable")) return "Chứng từ không còn là bản nháp có thể sửa. Hãy tải lại màn hình.";
  if (message.includes("not_acceptable")) return "Phiên bản báo giá này không còn có thể chấp nhận.";
  return "Thao tác không hoàn tất. Dữ liệu chưa được xác nhận.";
}

function toIso(value?: string) {
  if (!value) return null;
  const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value);
  const date = new Date(localDateTime ? `${value.length === 16 ? `${value}:00` : value}+07:00` : value);
  if (Number.isNaN(date.getTime())) throw new AppError({ code: "VALIDATION_FAILED", message: "Ngày giờ không hợp lệ.", status: 422 });
  return date.toISOString();
}

type OriginalCommercialLine = { id: string; material_id: string; ordered_uom_id: string; unit_price_vnd: number | string;
  conversion_numerator: number | string; conversion_denominator: number | string; rounding_mode: string;
  price_source_type: string; override_reason: string | null; pricing_rule_id: string | null; pricing_rule_version: number | null };

async function loadEditableCommercialLines(kind: "order" | "quote", documentId: string, expectedVersion: number,
  input: z.infer<typeof documentSchema>, branchId: string): Promise<Map<string, OriginalCommercialLine>> {
  const supabase = await createServerSupabase();
  let table: "sales_order_lines" | "quotation_lines";
  let parentColumn: "sales_order_id" | "revision_id";
  if (kind === "order") {
    const { data, error } = await supabase.from("sales_orders")
      .select("id, branch_id, customer_id, site_id, commercial_state, draft_version")
      .eq("id", documentId).eq("branch_id", branchId).maybeSingle();
    if (error || !data || data.commercial_state !== "DRAFT" || data.draft_version !== expectedVersion ||
      data.customer_id !== input.customerId || data.site_id !== input.siteId) {
      throw new AppError({ code: "CONFLICT", message: "Bản nháp đơn bán đã thay đổi. Hãy tải lại.", status: 409 });
    }
    table = "sales_order_lines";
    parentColumn = "sales_order_id";
  } else {
    const { data: revision, error: revisionError } = await supabase.from("quotation_revisions")
      .select("id, quotation_id, state, draft_version").eq("id", documentId).maybeSingle();
    if (revisionError || !revision) throw new AppError({ code: "CONFLICT", message: "Bản nháp báo giá không còn hiệu lực.", status: 409 });
    const { data: quote, error: quoteError } = await supabase.from("quotations")
      .select("id, branch_id, customer_id, site_id, current_revision_id")
      .eq("id", revision.quotation_id).eq("branch_id", branchId).maybeSingle();
    if (quoteError || !quote || quote.current_revision_id !== documentId || revision.state !== "DRAFT" ||
      revision.draft_version !== expectedVersion || quote.customer_id !== input.customerId || quote.site_id !== input.siteId) {
      throw new AppError({ code: "CONFLICT", message: "Bản nháp báo giá đã thay đổi. Hãy tải lại.", status: 409 });
    }
    table = "quotation_lines";
    parentColumn = "revision_id";
  }
  const { data: originals, error } = await supabase.from(table)
    .select("id, material_id, ordered_uom_id, unit_price_vnd::text, conversion_numerator::text, conversion_denominator::text, rounding_mode, price_source_type, override_reason, pricing_rule_id, pricing_rule_version")
    .eq(parentColumn, documentId);
  if (error) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Không thể đọc dòng bản nháp.", status: 503 });
  return new Map((originals ?? []).map((line) => [line.id, line as OriginalCommercialLine]));
}

async function createCommercialLines(input: z.infer<typeof documentSchema>, branchId: string, canManagePrice: boolean,
  originals?: Map<string, OriginalCommercialLine>) {
  const supabase = await createServerSupabase();
  const materialIds = [...new Set(input.lines.map((line) => line.materialId))];
  const uomIds = [...new Set(input.lines.map((line) => line.orderedUomId))];
  const [customerResult, siteResult, materialResult] = await Promise.all([
    supabase.from("customers").select("id, tier_code").eq("id", input.customerId).eq("branch_id", branchId).eq("active", true).maybeSingle(),
    supabase.from("customer_sites").select("id").eq("id", input.siteId).eq("customer_id", input.customerId).eq("active", true).maybeSingle(),
    supabase.from("materials").select("id, group_id, base_uom_id").in("id", materialIds).eq("active", true).eq("sale_enabled", true),
  ]);
  if (customerResult.error || siteResult.error || materialResult.error || !customerResult.data || !siteResult.data || materialResult.data?.length !== materialIds.length) {
    throw new AppError({ code: "VALIDATION_FAILED", message: "Khách hàng, công trình hoặc vật tư không còn hợp lệ.", status: 422 });
  }
  const customerTierCode = customerResult.data.tier_code ?? undefined;
  const materials = new Map(materialResult.data.map((material) => [material.id, material]));
  const now = new Date();
  const timestamp = now.toISOString();
  const [conversionResult, priceResult] = await Promise.all([
    supabase.from("material_uom_conversions").select("material_id, from_uom_id, to_uom_id, numerator::text, denominator::text, effective_from, effective_to")
      .in("material_id", materialIds).in("from_uom_id", uomIds).eq("active", true).eq("settlement_allowed", true)
      .lte("effective_from", timestamp).or(`effective_to.is.null,effective_to.gt.${timestamp}`).order("effective_from", { ascending: false }),
    supabase.from("pricing_rules")
      .select("id, branch_id, scope_type, customer_id, material_id, material_group_id, customer_tier_code, price_uom_id, unit_price_vnd::text, version, source_type, effective_from, effective_to, active")
      .eq("branch_id", branchId).in("price_uom_id", uomIds).eq("active", true)
      .lte("effective_from", timestamp).or(`effective_to.is.null,effective_to.gt.${timestamp}`),
  ]);
  if (conversionResult.error || priceResult.error) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Không thể đọc quy đổi hoặc chính sách giá.", status: 503 });
  const rules: PriceRule[] = (priceResult.data ?? []).map((row) => ({
    id: row.id, branchId: row.branch_id, scope: row.scope_type as PriceRule["scope"],
    customerId: row.customer_id ?? undefined, materialId: row.material_id ?? undefined,
    materialGroupId: row.material_group_id ?? undefined, customerTierCode: row.customer_tier_code ?? undefined,
    priceUomId: row.price_uom_id, unitPriceVnd: row.unit_price_vnd.toString(), version: row.version,
    sourceType: row.source_type as PriceRule["sourceType"], effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? undefined, active: row.active,
  }));
  const conversions = conversionResult.data ?? [];
  return input.lines.map((inputLine, index) => {
    const material = materials.get(inputLine.materialId)!;
    const original = originals?.get(inputLine.sourceLineId ?? "");
    const manualPriceVnd = inputLine.manualPriceVnd?.trim() ?? "";
    let manualReason = inputLine.manualReason?.trim() ?? "";
    if (!manualReason && original?.price_source_type === "MANUAL_APPROVED" && original.material_id === inputLine.materialId && original.ordered_uom_id === inputLine.orderedUomId && String(original.unit_price_vnd) === manualPriceVnd) manualReason = original.override_reason ?? "";
    const sameSource = original?.material_id === inputLine.materialId && original.ordered_uom_id === inputLine.orderedUomId;
    const preserve = !!original && sameSource && (original.price_source_type === "MANUAL_APPROVED"
      ? String(original.unit_price_vnd) === manualPriceVnd && (original.override_reason ?? "") === manualReason
      : !manualPriceVnd && !manualReason && !!original.pricing_rule_id && original.pricing_rule_version != null);
    if (preserve) {
      const numerator = String(original.conversion_numerator), denominator = String(original.conversion_denominator);
      if (!isExactBaseQuantity(inputLine.quantity, numerator, denominator)) throw new AppError({ code: "VALIDATION_FAILED", message: `Dòng ${index + 1}: lượng sau quy đổi vượt độ chính xác hoặc giới hạn hỗ trợ.`, status: 422 });
      return { material_id: inputLine.materialId, ordered_uom_id: inputLine.orderedUomId, quantity: inputLine.quantity,
        source_line_id: original.id, conversion_numerator: numerator, conversion_denominator: denominator,
        rounding_mode: original.rounding_mode, unit_price_vnd: String(original.unit_price_vnd),
        pricing_rule_id: original.pricing_rule_id ?? null, pricing_rule_version: original.pricing_rule_version ?? null,
        price_source_type: original.price_source_type, override_reason: original.override_reason };
    }
    const conversion = inputLine.orderedUomId === material.base_uom_id ? null : conversions.find((row) => row.material_id === inputLine.materialId && row.from_uom_id === inputLine.orderedUomId && row.to_uom_id === material.base_uom_id);
    if (inputLine.orderedUomId !== material.base_uom_id && !conversion) throw new AppError({ code: "VALIDATION_FAILED", message: `Dòng ${index + 1}: không có quy đổi quyết toán hợp lệ.`, status: 422 });
    const conversionNumerator = conversion?.numerator.toString() ?? "1";
    const conversionDenominator = conversion?.denominator.toString() ?? "1";
    const conversionRounding = "HALF_UP";
    if (!isExactBaseQuantity(inputLine.quantity, conversionNumerator, conversionDenominator)) throw new AppError({ code: "VALIDATION_FAILED", message: `Dòng ${index + 1}: lượng sau quy đổi vượt độ chính xác hoặc giới hạn hỗ trợ.`, status: 422 });
    const preserveApprovedPrice = !!original && original.price_source_type === "MANUAL_APPROVED" &&
      original.material_id === inputLine.materialId && original.ordered_uom_id === inputLine.orderedUomId &&
      String(original.unit_price_vnd) === manualPriceVnd && (original.override_reason ?? "") === manualReason &&
      new Decimal(original.conversion_numerator).eq(conversionNumerator) &&
      new Decimal(original.conversion_denominator).eq(conversionDenominator) && original.rounding_mode === conversionRounding;
    if (manualPriceVnd) {
      if (!canManagePrice && !preserveApprovedPrice) throw new AppError({ code: "FORBIDDEN", message: `Dòng ${index + 1}: không có quyền đổi giá đã duyệt.`, status: 403 });
      if (!manualReason) {
        let reference: PriceRule | null = null;
        try { reference = resolvePrice({ branchId, customerId: input.customerId, customerTierCode, materialId: inputLine.materialId, materialGroupId: material.group_id, priceUomId: inputLine.orderedUomId, at: now, rules }); }
        catch (error) { if (!(error instanceof AppError)) throw error; }
        manualReason = finalSellingPriceReason(manualPriceVnd, "", reference);
      }
      if (!/^[1-9]\d*$/.test(manualPriceVnd) || manualPriceVnd.length > 19 || BigInt(manualPriceVnd) > 9223372036854775807n || manualReason.length < 3 || manualReason.length > 500) {
        throw new AppError({ code: "VALIDATION_FAILED", message: `Dòng ${index + 1}: giá thủ công phải dương và có lý do từ 3 đến 500 ký tự.`, status: 422 });
      }
    } else if (manualReason) {
      throw new AppError({ code: "VALIDATION_FAILED", message: `Dòng ${index + 1}: cần nhập giá khi ghi lý do ngoại lệ.`, status: 422 });
    }
    let selected: PriceRule | null = null;
    if (!manualPriceVnd) {
      try {
        selected = resolvePrice({ branchId, customerId: input.customerId, customerTierCode,
          materialId: inputLine.materialId, materialGroupId: material.group_id,
          priceUomId: inputLine.orderedUomId, at: now, rules });
      } catch (error) {
        if (error instanceof AppError) throw new AppError({ code: error.code, message: `Dòng ${index + 1}: không có giá hợp lệ.${canManagePrice ? " Nhập giá bán cuối và ghi chú ngoại lệ, rồi xem trước lại." : " Liên hệ người quản lý giá."}`, status: error.status });
        throw error;
      }
    }
    return { material_id: inputLine.materialId, ordered_uom_id: inputLine.orderedUomId, quantity: inputLine.quantity,
      source_line_id: inputLine.sourceLineId || null,
      conversion_numerator: conversionNumerator, conversion_denominator: conversionDenominator, rounding_mode: conversionRounding,
      unit_price_vnd: manualPriceVnd || selected!.unitPriceVnd, pricing_rule_id: selected?.id ?? null,
      pricing_rule_version: selected?.version ?? null, price_source_type: manualPriceVnd ? "MANUAL_APPROVED" : selected!.sourceType,
      override_reason: manualPriceVnd ? manualReason : null };
  });
}

function pricePreview(input: z.infer<typeof documentSchema>, lines: Awaited<ReturnType<typeof createCommercialLines>>) {
  const previewLines: PricePreviewLine[] = lines.map((line, index) => {
    const lineTotal = new CommercialDecimal(line.quantity).mul(line.unit_price_vnd).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    if (!lineTotal.isFinite() || lineTotal.gt("9223372036854775807")) throw new AppError({ code: "VALIDATION_FAILED", message: `Dòng ${index + 1}: thành tiền vượt giới hạn.`, status: 422 });
    return { materialId: input.lines[index].materialId, orderedUomId: input.lines[index].orderedUomId,
      quantity: input.lines[index].quantity, unitPriceVnd: line.unit_price_vnd,
      priceSourceType: line.price_source_type, lineTotalVnd: lineTotal.toFixed(0),
      pricingRuleId: line.pricing_rule_id, pricingRuleVersion: line.pricing_rule_version,
      overrideReason: line.override_reason };
  });
  const total = previewLines.reduce((sum, line) => sum + BigInt(line.lineTotalVnd), 0n);
  if (total > 9223372036854775807n) throw new AppError({ code: "VALIDATION_FAILED", message: "Tổng chứng từ vượt giới hạn.", status: 422 });
  return { lines: previewLines, totalVnd: total.toString() };
}

export async function previewCommercialDocumentAction(input: unknown): Promise<PricePreviewResult> {
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Chọn khách, công trình và nhập các dòng hợp lệ trước khi xem giá." };
  const access = await requireInternalPermission(parsed.data.kind === "order" ? "orders.create" : "quotation.create");
  try {
    if (Boolean(parsed.data.documentId) !== Boolean(parsed.data.expectedVersion)) return { success: false, message: "Thông tin bản nháp chưa hợp lệ." };
    const originals = parsed.data.documentId && parsed.data.expectedVersion
      ? await loadEditableCommercialLines(parsed.data.kind, parsed.data.documentId, parsed.data.expectedVersion, parsed.data, access.branchId)
      : undefined;
    const lines = await createCommercialLines(parsed.data, access.branchId, access.permissions.has("pricing.manage"), originals);
    return { success: true, message: "Giá đã được xem trước. Kiểm tra từng dòng trước khi lưu.", ...pricePreview(parsed.data, lines) };
  } catch (error) {
    return { success: false, message: error instanceof AppError ? error.message : "Không thể xem trước giá. Thử lại sau." };
  }
}

async function saveDocument(kind: "order" | "quote", mode: "create" | "edit", formData: FormData): Promise<SalesActionState> {
  const materialIds = formData.getAll("materialId");
  const orderedUomIds = formData.getAll("orderedUomId");
  const quantities = formData.getAll("quantity");
  const manualPrices = formData.getAll("manualPriceVnd");
  const manualReasons = formData.getAll("manualReason");
  const sourceLineIds = formData.getAll("sourceLineId");
  if (!materialIds.length || materialIds.length > 50 || materialIds.length !== orderedUomIds.length || materialIds.length !== quantities.length) return { message: "Chứng từ cần từ 1 đến 50 dòng hàng hợp lệ." };
  if ((manualPrices.length && manualPrices.length !== materialIds.length) || (manualReasons.length && manualReasons.length !== materialIds.length) ||
    (sourceLineIds.length && sourceLineIds.length !== materialIds.length)) return { message: "Thông tin giá từng dòng không khớp." };
  const parsed = createSchema.safeParse({
    customerId: formData.get("customerId"), siteId: formData.get("siteId"),
    lines: materialIds.map((materialId, index) => ({ materialId, orderedUomId: orderedUomIds[index], quantity: quantities[index],
      manualPriceVnd: manualPrices[index] ?? "", manualReason: manualReasons[index] ?? "", sourceLineId: sourceLineIds[index] ?? "" })),
    effectiveAt: formData.get("effectiveAt"), terms: formData.get("terms"), operationId: formData.get("operationId"),
  });
  if (!parsed.success) return { message: parsed.error.issues.some((issue) => issue.path[0] === "terms")
    ? "Điều khoản / ghi chú tối đa 1.000 ký tự." : "Thông tin chứng từ chưa hợp lệ." };
  const edit = mode === "edit" ? editSchema.safeParse({ documentId: formData.get("documentId"), expectedVersion: formData.get("expectedVersion") }) : null;
  if (edit && !edit.success) return { message: "Thông tin bản nháp cần sửa không hợp lệ." };
  let expected: PricePreviewLine[];
  try {
    const snapshot = z.array(previewLineSchema).length(parsed.data.lines.length).parse(JSON.parse(String(formData.get("pricePreview") ?? "")));
    expected = snapshot;
  } catch { return { message: "Cần xem trước giá của mọi dòng trước khi lưu." }; }
  const access = await requireInternalPermission(kind === "order" ? "orders.create" : "quotation.create");
  const supabase = await createServerSupabase();
  let quoteId: string | null = null;
  if (edit?.success) {
    if (kind === "order") {
      const { data, error } = await supabase.from("sales_orders")
        .select("id, branch_id, customer_id, site_id, commercial_state, draft_version")
        .eq("id", edit.data.documentId).eq("branch_id", access.branchId).maybeSingle();
      if (error || !data || data.commercial_state !== "DRAFT" || data.customer_id !== parsed.data.customerId || data.site_id !== parsed.data.siteId) {
        return { message: "Đơn bán không còn là bản nháp hợp lệ. Hãy tải lại màn hình." };
      }
      if (data.draft_version !== edit.data.expectedVersion) return { message: commandError("draft_version_conflict") };
    } else {
      const { data: revision, error: revisionError } = await supabase.from("quotation_revisions")
        .select("id, quotation_id, state, draft_version").eq("id", edit.data.documentId).maybeSingle();
      if (revisionError || !revision) return { message: "Không tìm thấy bản nháp báo giá." };
      const { data: quote, error: quoteError } = await supabase.from("quotations")
        .select("id, branch_id, customer_id, site_id, current_revision_id")
        .eq("id", revision.quotation_id).eq("branch_id", access.branchId).maybeSingle();
      if (quoteError || !quote || quote.current_revision_id !== revision.id || revision.state !== "DRAFT" || quote.customer_id !== parsed.data.customerId || quote.site_id !== parsed.data.siteId) {
        return { message: "Báo giá không còn là bản nháp hợp lệ. Hãy tải lại màn hình." };
      }
      if (revision.draft_version !== edit.data.expectedVersion) return { message: commandError("draft_version_conflict") };
      quoteId = quote.id;
    }
  }
  let lines;
  let effectiveAt;
  try {
    const originals = edit?.success
      ? await loadEditableCommercialLines(kind, edit.data.documentId, edit.data.expectedVersion, parsed.data, access.branchId)
      : undefined;
    lines = await createCommercialLines(parsed.data, access.branchId, access.permissions.has("pricing.manage"), originals);
    const actual = pricePreview(parsed.data, lines).lines;
    if (!actual.every((line, index) => Object.keys(line).every((key) => line[key as keyof PricePreviewLine] === expected[index][key as keyof PricePreviewLine]))) {
      return { message: "Giá hoặc dòng hàng đã thay đổi. Vui lòng xem trước lại trước khi lưu." };
    }
    effectiveAt = toIso(parsed.data.effectiveAt);
  } catch (error) {
    return { message: error instanceof AppError ? error.message : "Không thể chuẩn bị các dòng hàng." };
  }
  const result = edit?.success
    ? kind === "order"
      ? await supabase.rpc("update_sales_order_draft", { target_order_id: edit.data.documentId, expected_version: edit.data.expectedVersion, requested_delivery_at: effectiveAt, commercial_terms: parsed.data.terms || null, order_lines: lines, operation_id: parsed.data.operationId })
      : await supabase.rpc("update_quote_draft", { target_revision_id: edit.data.documentId, expected_version: edit.data.expectedVersion, expires_at: effectiveAt, commercial_terms: parsed.data.terms || null, quote_lines: lines, operation_id: parsed.data.operationId })
    : kind === "order"
      ? await supabase.rpc("create_sales_order_draft", { target_branch_id: access.branchId, target_customer_id: parsed.data.customerId, target_site_id: parsed.data.siteId, requested_delivery_at: effectiveAt, commercial_terms: parsed.data.terms || null, order_lines: lines, operation_id: parsed.data.operationId })
      : await supabase.rpc("create_quote_draft", { target_branch_id: access.branchId, target_customer_id: parsed.data.customerId, target_site_id: parsed.data.siteId, expires_at: effectiveAt, commercial_terms: parsed.data.terms || null, quote_lines: lines, operation_id: parsed.data.operationId });
  if (result.error || !result.data) return { message: commandError(result.error?.message ?? "unknown") };
  revalidatePath(kind === "order" ? "/admin/orders" : "/admin/quotations");
  const destinationId = edit?.success && kind === "quote" ? quoteId : result.data;
  revalidatePath(`${kind === "order" ? "/admin/orders" : "/admin/quotations"}/${destinationId}`);
  redirect(`${kind === "order" ? "/admin/orders" : "/admin/quotations"}/${destinationId}?notice=${mode === "edit" ? "updated" : "created"}`);
}

export async function createSalesOrderAction(_: SalesActionState, formData: FormData) { return saveDocument("order", "create", formData); }
export async function createQuotationAction(_: SalesActionState, formData: FormData) { return QUOTATIONS_ENABLED ? saveDocument("quote", "create", formData) : { message: QUOTATIONS_DISABLED_MESSAGE }; }
export async function updateSalesOrderDraftAction(_: SalesActionState, formData: FormData) { return saveDocument("order", "edit", formData); }
export async function updateQuotationDraftAction(_: SalesActionState, formData: FormData) { return QUOTATIONS_ENABLED ? saveDocument("quote", "edit", formData) : { message: QUOTATIONS_DISABLED_MESSAGE }; }

async function internalCommand(permission: string, rpc: string, args: Record<string, unknown>, destination: string, notice: string) {
  await requireInternalPermission(permission);
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc(rpc, args);
  if (error) redirect(`${destination}?error=${encodeURIComponent(commandError(error.message, rpc === "confirm_sales_order"))}`);
  revalidatePath(destination);
  if (rpc === "cancel_sales_order") revalidatePath("/admin/orders");
  redirect(`${destination}?notice=${notice}`);
}

export async function confirmSalesOrderAction(formData: FormData) {
  const parsed = commandSchema.safeParse({ entityId: formData.get("entityId"), operationId: formData.get("operationId") });
  if (!parsed.success) redirect("/admin/orders?error=invalid-command");
  return internalCommand("orders.confirm", "confirm_sales_order", { target_order_id: parsed.data.entityId, operation_id: parsed.data.operationId }, `/admin/orders/${parsed.data.entityId}`, "confirmed");
}

export async function cancelSalesOrderAction(formData: FormData) {
  const parsed = commandSchema.extend({ reason: z.string().trim().min(3).max(500) }).safeParse({ entityId: formData.get("entityId"), operationId: formData.get("operationId"), reason: formData.get("reason") });
  if (!parsed.success) redirect("/admin/orders?error=invalid-command");
  return internalCommand("orders.cancel", "cancel_sales_order", { target_order_id: parsed.data.entityId, cancel_reason: parsed.data.reason, operation_id: parsed.data.operationId }, `/admin/orders/${parsed.data.entityId}`, "cancelled");
}

export async function closeSalesOrderRemainingAction(formData: FormData) {
  const parsed = commandSchema.extend({ reason: z.string().trim().min(3).max(500) }).safeParse({ entityId: formData.get("entityId"), operationId: formData.get("operationId"), reason: formData.get("reason") });
  if (!parsed.success) redirect("/admin/orders?error=invalid-command");
  return internalCommand("orders.cancel", "close_sales_order_remaining", { target_order_id: parsed.data.entityId, close_reason: parsed.data.reason, operation_id: parsed.data.operationId }, `/admin/orders/${parsed.data.entityId}`, "remaining-closed");
}

export async function sendQuotationAction(formData: FormData) {
  if (!QUOTATIONS_ENABLED) redirect(`/admin/orders?error=${encodeURIComponent(QUOTATIONS_DISABLED_MESSAGE)}`);
  const parsed = commandSchema.extend({ quoteId: z.uuid() }).safeParse({ entityId: formData.get("entityId"), operationId: formData.get("operationId"), quoteId: formData.get("quoteId") });
  if (!parsed.success) redirect("/admin/quotations?error=invalid-command");
  return internalCommand("quotation.send", "send_quote_revision", { target_revision_id: parsed.data.entityId, operation_id: parsed.data.operationId }, `/admin/quotations/${parsed.data.quoteId}`, "sent");
}

export async function acceptQuotationAction(formData: FormData) {
  if (!QUOTATIONS_ENABLED) redirect(`/admin/orders?error=${encodeURIComponent(QUOTATIONS_DISABLED_MESSAGE)}`);
  const parsed = commandSchema.extend({ quoteId: z.uuid(), channel: z.enum(["PHONE", "ZALO", "EMAIL", "OTHER"]), confirmedBy: z.string().trim().min(2).max(160) }).safeParse({ entityId: formData.get("entityId"), operationId: formData.get("operationId"), quoteId: formData.get("quoteId"), channel: formData.get("channel"), confirmedBy: formData.get("confirmedBy") });
  if (!parsed.success) redirect("/admin/quotations?error=invalid-command");
  return internalCommand("quotation.accept", "accept_quote_revision", { target_revision_id: parsed.data.entityId, acceptance_channel: parsed.data.channel, confirmed_by_name: parsed.data.confirmedBy, evidence_object_path: null, operation_id: parsed.data.operationId }, `/admin/quotations/${parsed.data.quoteId}`, "accepted");
}

export async function acceptCustomerQuotationAction(formData: FormData) {
  if (!QUOTATIONS_ENABLED) redirect(`/customer?error=${encodeURIComponent(QUOTATIONS_DISABLED_MESSAGE)}`);
  const parsed = commandSchema.extend({ quoteId: z.uuid() }).safeParse({ entityId: formData.get("entityId"), operationId: formData.get("operationId"), quoteId: formData.get("quoteId") });
  if (!parsed.success) redirect("/customer/quotations?error=invalid-command");
  const membership = await requireCustomerAccess(["OWNER", "FINANCE_CONTACT"]);
  const supabase = await createServerSupabase();
  const { data: quote } = await supabase.from("quotations").select("id, customer_id, current_revision_id").eq("id", parsed.data.quoteId).eq("customer_id", membership.customerId).maybeSingle();
  if (!quote || quote.current_revision_id !== parsed.data.entityId) redirect(`/customer/quotations/${parsed.data.quoteId}?error=Phiên+bản+không+còn+hiệu+lực`);
  const { error } = await supabase.rpc("accept_quote_revision", { target_revision_id: parsed.data.entityId, acceptance_channel: "PORTAL", confirmed_by_name: membership.customerName, evidence_object_path: null, operation_id: parsed.data.operationId });
  if (error) redirect(`/customer/quotations/${parsed.data.quoteId}?error=${encodeURIComponent(commandError(error.message))}`);
  revalidatePath(`/customer/quotations/${parsed.data.quoteId}`);
  redirect(`/customer/quotations/${parsed.data.quoteId}?notice=accepted`);
}

export async function createQuotationRevisionAction(formData: FormData) {
  if (!QUOTATIONS_ENABLED) redirect(`/admin/orders?error=${encodeURIComponent(QUOTATIONS_DISABLED_MESSAGE)}`);
  const parsed = commandSchema.extend({ quoteId: z.uuid() }).safeParse({ entityId: formData.get("entityId"), operationId: formData.get("operationId"), quoteId: formData.get("quoteId") });
  if (!parsed.success) redirect("/admin/quotations?error=invalid-command");
  return internalCommand("quotation.create", "create_quote_revision", { source_revision_id: parsed.data.entityId, operation_id: parsed.data.operationId }, `/admin/quotations/${parsed.data.quoteId}`, "revised");
}

export async function createOrderFromQuotationAction(formData: FormData) {
  if (!QUOTATIONS_ENABLED) redirect(`/admin/orders?error=${encodeURIComponent(QUOTATIONS_DISABLED_MESSAGE)}`);
  const parsed = commandSchema.extend({ quoteId: z.uuid(), deliveryAt: z.string().trim().optional() }).safeParse({ entityId: formData.get("entityId"), operationId: formData.get("operationId"), quoteId: formData.get("quoteId"), deliveryAt: formData.get("deliveryAt") });
  if (!parsed.success) redirect("/admin/quotations?error=invalid-command");
  let deliveryAt;
  try { deliveryAt = toIso(parsed.data.deliveryAt); } catch { redirect(`/admin/quotations/${parsed.data.quoteId}?error=Ngày+giao+không+hợp+lệ`); }
  await requireInternalPermission("orders.create");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("create_sales_order_from_quote", { source_revision_id: parsed.data.entityId, requested_delivery_at: deliveryAt, operation_id: parsed.data.operationId });
  if (error || !data) redirect(`/admin/quotations/${parsed.data.quoteId}?error=${encodeURIComponent(commandError(error?.message ?? "unknown"))}`);
  revalidatePath("/admin/orders");
  redirect(`/admin/orders/${data}?notice=from-quote`);
}
