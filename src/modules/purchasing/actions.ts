"use server";

import Decimal from "decimal.js";
import { isExactEntryQuantity, isExactBaseQuantity } from "@/lib/core/quantity";
import { finalPurchaseCostReason } from "./manual-cost";
import { finalSellingPriceReason } from "@/modules/sales/final-price";
import { normalizeWarehouseAddress, warehouseAddressRequired } from "./warehouse-address";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AppError, operationalPostingError, quantityInputError } from "@/lib/core/errors";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolvePrice, type PriceRule } from "@/modules/pricing/resolve-price";
import { loadPurchaseSuppliers } from "./form-options";
import { finishDirectPurchaseDraft } from "./finish-direct-draft";
import { derivedOperationId } from "@/modules/sales/auto-sourcing";

const PurchaseDecimal = Decimal.clone({ precision: 50 });

export type PurchaseActionState = { message: string; success?: boolean; supplierId?: string; partialPurchaseOrderId?: string } | undefined;

export async function searchPurchaseSuppliersAction(query: string) {
  const access = await requireInternalPermission("purchasing.create");
  const parsed = z.string().trim().max(120).safeParse(query);
  if (!parsed.success) return { suppliers: [], message: "Từ khóa tối đa 120 ký tự." };
  try {
    const suppliers = await loadPurchaseSuppliers(access.branchId, parsed.data);
    return { suppliers, message: suppliers.length ? `Hiển thị ${suppliers.length} NCC phù hợp (tối đa 50).` : "Không tìm thấy NCC phù hợp." };
  } catch {
    return { suppliers: [], message: "Không thể tìm nhà cung cấp. Hãy thử lại." };
  }
}
const positive = z.string().trim().refine((value) => { return isExactEntryQuantity(value); });
const documentLineSchema = z.object({ materialId: z.guid(), orderedUomId: z.guid(), quantity: positive,
  manualCostVnd: z.string().trim().optional(), manualCostReason: z.string().trim().max(500).optional(),
  manualSalesPriceVnd: z.string().trim().optional(), manualSalesReason: z.string().trim().max(500).optional(),
  sourceLineId: z.guid().optional(), salesLineId: z.guid().optional() });
const documentSchema = z.object({ mode: z.enum(["WAREHOUSE", "LINKED_DIRECT"]), supplierId: z.guid(),
  warehouseId: z.guid().optional(), customerId: z.guid().optional(), siteId: z.guid().optional(),
  salesOrderId: z.guid().optional(), documentId: z.guid().optional(), expectedVersion: z.number().int().positive().optional(),
  expectedAt: z.string().optional(), terms: z.string().trim().max(1000).optional(), operationId: z.guid(),
  lines: z.array(documentLineSchema).min(1).max(50) });
const costPreviewLineSchema = z.object({ materialId: z.guid(), orderedUomId: z.guid(), quantity: z.string(),
  unitCostVnd: z.string(), priceSourceType: z.string(), lineTotalVnd: z.string(),
  purchasePriceRuleId: z.guid().nullable(), purchasePriceRuleVersion: z.number().int().nullable(), overrideReason: z.string().nullable() });
export type CostPreviewLine = z.infer<typeof costPreviewLineSchema>;
const salesPreviewLineSchema = z.object({ materialId: z.guid(), orderedUomId: z.guid(), quantity: z.string(),
  unitPriceVnd: z.string(), priceSourceType: z.string(), lineTotalVnd: z.string(),
  pricingRuleId: z.guid().nullable(), pricingRuleVersion: z.number().nullable(), overrideReason: z.string().nullable() });
export type SalesPurchasePreview = { lines: z.infer<typeof salesPreviewLineSchema>[]; totalVnd: string };
export type CostPreviewResult = { success: boolean; message: string; lines?: CostPreviewLine[]; totalVnd?: string; sales?: SalesPurchasePreview };

function documentInput(formData: FormData) {
  const materialIds = formData.getAll("materialId");
  const uomIds = formData.getAll("orderedUomId");
  const quantities = formData.getAll("quantity");
  const costs = formData.getAll("manualCostVnd");
  const reasons = formData.getAll("manualCostReason");
  const sourceIds = formData.getAll("sourceLineId");
  const salesIds = formData.getAll("salesLineId");
  const salesPrices = formData.getAll("manualSalesPriceVnd");
  const salesReasons = formData.getAll("manualSalesReason");
  if (!materialIds.length || materialIds.length > 50 || materialIds.length !== uomIds.length || materialIds.length !== quantities.length ||
    (costs.length && costs.length !== materialIds.length) || (reasons.length && reasons.length !== materialIds.length) ||
    (sourceIds.length && sourceIds.length !== materialIds.length) || (salesIds.length && salesIds.length !== materialIds.length)) return null;
  const parsed = documentSchema.safeParse({ mode: formData.get("mode"), supplierId: formData.get("supplierId"),
    warehouseId: formData.get("warehouseId") || undefined, customerId: formData.get("customerId") || undefined,
    siteId: formData.get("siteId") || undefined, salesOrderId: formData.get("salesOrderId") || undefined,
    documentId: formData.get("documentId") || undefined,
    expectedVersion: formData.get("expectedVersion") ? Number(formData.get("expectedVersion")) : undefined,
    expectedAt: formData.get("expectedAt"), terms: formData.get("terms"), operationId: formData.get("operationId"),
    lines: materialIds.map((materialId, index) => ({ materialId, orderedUomId: uomIds[index], quantity: quantities[index],
      manualCostVnd: costs[index] ?? "", manualCostReason: reasons[index] ?? "",
      manualSalesPriceVnd: salesPrices[index] ?? "", manualSalesReason: salesReasons[index] ?? "",
      sourceLineId: sourceIds[index] || undefined, salesLineId: salesIds[index] || undefined })) });
  return parsed.success ? parsed.data : null;
}

function toIso(value?: string) {
  if (!value) return null;
  const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value);
  const date = new Date(localDateTime ? `${value.length === 16 ? `${value}:00` : value}+07:00` : value);
  if (Number.isNaN(date.getTime())) throw new AppError({ code: "VALIDATION_FAILED", message: "Ngày dự kiến không hợp lệ.", status: 422 });
  return date.toISOString();
}

function errorMessage(message: string, confirmingOrder = false) {
  const postingError = operationalPostingError(message, confirmingOrder ? "purchase-order-confirmation" : "posting");
  if (postingError) return postingError;
  const quantityError = quantityInputError(message);
  if (quantityError) return quantityError;
  if (message.includes("purchase_price_priority_mismatch")) return "Bảng giá mua đã thay đổi. Tải lại và xem trước giá mua, hoặc dùng giá được phê duyệt kèm lý do.";
  if (message.includes("purchase_price_priority_ambiguous")) return "Có nhiều bảng giá mua cùng phiên bản ưu tiên. Cần đối chiếu bảng giá trước khi lưu.";
  if (message.includes("purchase_order_not_confirmable")) return "Đơn mua không còn ở trạng thái có thể xác nhận. Hãy tải lại để kiểm tra.";
  if (message.includes("purchase_lines_required")) return "Vui lòng thêm ít nhất một dòng vật tư cho đơn mua.";
  if (message.includes("warehouse_address_required")) return warehouseAddressRequired;
  if (message.includes("purchase_order_destination_address_required")) return "Địa chỉ nhận hàng trên đơn mua nháp còn thiếu. Bổ sung địa chỉ kho rồi cập nhật địa chỉ từ kho trước khi xác nhận.";
  if (message.includes("stale_record_reload")) return "Địa chỉ kho đã được người khác sửa. Hãy tải lại thông tin kho.";
  if (message.includes("forbidden")) return "Bạn không có quyền thực hiện thao tác này tại chi nhánh hiện tại.";
  if (message.includes("operation_payload_conflict")) return "Mã thao tác đã được dùng với dữ liệu khác. Hãy tải lại màn hình.";
  if (message.includes("supplier_code_exists")) return "Mã nhà cung cấp đã tồn tại. Hãy chọn nhà cung cấp hiện có hoặc dùng mã khác.";
  if (message.includes("supply_allocation_exceeds_need")) return "Số lượng phân nguồn vượt phần dòng bán còn thiếu.";
  if (message.includes("price_snapshot")) return "Giá mua đã thay đổi hoặc không còn hiệu lực.";
  if (message.includes("draft_version_conflict")) return "Bản nháp đã được người khác sửa. Hãy tải lại.";
  if (message.includes("version_conflict")) return "Phân bổ nguồn hàng đã được người khác cập nhật. Hãy tải lại.";
  if (message.includes("manual_purchase_price_change_requires_permission")) return "Giá mua thủ công đã duyệt chỉ được giữ nguyên; cần quyền quản lý giá để thay đổi.";
  if (message.includes("purchase_order_not_editable")) return "Đơn mua không còn là bản nháp có thể sửa.";
  return "Không thể lưu nghiệp vụ mua hàng. Không có thay đổi nào được xác nhận.";
}

type OriginalPurchaseLine = { id: string; linked_sales_order_line_id: string | null; material_id: string;
  ordered_uom_id: string; conversion_numerator: string; conversion_denominator: string; rounding_mode: string;
  unit_cost_vnd: string | null; purchase_price_rule_id: string | null; purchase_price_rule_version: number | null;
  price_source_type: string | null; override_reason: string | null };

async function loadEditableDraft(documentId: string, branchId: string) {
  const supabase = await createServerSupabase();
  const [orderResult, lineResult] = await Promise.all([
    supabase.from("purchase_orders").select("id, branch_id, supplier_id, warehouse_id, destination_type, source_sales_order_id, state, draft_version")
      .eq("id", documentId).eq("branch_id", branchId).maybeSingle(),
    supabase.from("purchase_order_line_read").select("id, linked_sales_order_line_id, material_id, ordered_uom_id, conversion_numerator::text, conversion_denominator::text, rounding_mode, unit_cost_vnd::text, purchase_price_rule_id, purchase_price_rule_version, price_source_type, override_reason")
      .eq("purchase_order_id", documentId),
  ]);
  if (orderResult.error || lineResult.error || !orderResult.data || orderResult.data.state !== "DRAFT")
    throw new AppError({ code: "VALIDATION_FAILED", message: "Đơn mua không còn là bản nháp có thể sửa.", status: 422 });
  return { order: orderResult.data, originals: new Map((lineResult.data ?? []).map((line) => [line.id, line as OriginalPurchaseLine])) };
}

async function buildWarehouseLines(input: z.infer<typeof documentSchema>, branchId: string, canManagePrice: boolean,
  originals?: Map<string, OriginalPurchaseLine>) {
  const supabase = await createServerSupabase();
  const materialIds = [...new Set(input.lines.map((line) => line.materialId))];
  const uomIds = [...new Set(input.lines.map((line) => line.orderedUomId))];
  const now = new Date().toISOString();
  const [supplierResult, materialResult, conversionResult, priceResult] = await Promise.all([
    supabase.from("suppliers").select("id").eq("id", input.supplierId).eq("branch_id", branchId).eq("active", true).maybeSingle(),
    supabase.from("materials").select("id, base_uom_id").in("id", materialIds).eq("active", true).eq("purchase_enabled", true),
    supabase.from("material_uom_conversions").select("material_id, from_uom_id, to_uom_id, numerator::text, denominator::text, rounding_mode, effective_from")
      .in("material_id", materialIds).in("from_uom_id", uomIds).eq("active", true).eq("settlement_allowed", true)
      .lte("effective_from", now).or(`effective_to.is.null,effective_to.gt.${now}`).order("effective_from", { ascending: false }),
    supabase.from("purchase_price_rules").select("id, material_id, purchase_uom_id, unit_cost_vnd::text, version, source_type")
      .eq("branch_id", branchId).eq("supplier_id", input.supplierId).in("material_id", materialIds).in("purchase_uom_id", uomIds)
      .eq("active", true).lte("effective_from", now).or(`effective_to.is.null,effective_to.gt.${now}`).order("version", { ascending: false }),
  ]);
  if (supplierResult.error || materialResult.error || conversionResult.error || priceResult.error ||
    (!originals && !supplierResult.data) || materialResult.data?.length !== materialIds.length) {
    throw new AppError({ code: "VALIDATION_FAILED", message: "Nhà cung cấp, vật tư hoặc bảng giá không còn hợp lệ.", status: 422 });
  }
  const materials = new Map(materialResult.data.map((row) => [row.id, row]));
  const lines = input.lines.map((entry, index) => {
    const material = materials.get(entry.materialId)!;
    const conversion = entry.orderedUomId === material.base_uom_id ? null : conversionResult.data?.find((row) =>
      row.material_id === entry.materialId && row.from_uom_id === entry.orderedUomId && row.to_uom_id === material.base_uom_id);
    if (entry.orderedUomId !== material.base_uom_id && !conversion) throw new AppError({ code: "VALIDATION_FAILED", message: `Dòng ${index + 1}: không có quy đổi mua hợp lệ.`, status: 422 });
    const manual = entry.manualCostVnd?.trim() ?? "";
    let reason = entry.manualCostReason?.trim() ?? "";
    const original = entry.sourceLineId ? originals?.get(entry.sourceLineId) : undefined;
    if (entry.sourceLineId && !original) throw new AppError({ code: "VALIDATION_FAILED", message: `Dòng ${index + 1}: dòng nguồn không thuộc bản nháp.`, status: 422 });
    if (original?.price_source_type === "MANUAL_APPROVED" && !canManagePrice) {
      if (original.material_id !== entry.materialId || original.ordered_uom_id !== entry.orderedUomId ||
        (manual && manual !== original.unit_cost_vnd) || reason || !original.unit_cost_vnd ||
        original.linked_sales_order_line_id !== (entry.salesLineId ?? null)) {
        throw new AppError({ code: "VALIDATION_FAILED", message: `Dòng ${index + 1}: không thể thay đổi giá mua thủ công đã duyệt.`, status: 422 });
      }
      return { source_line_id: entry.sourceLineId, linked_sales_order_line_id: entry.salesLineId ?? null,
        material_id: entry.materialId, ordered_uom_id: entry.orderedUomId, quantity: entry.quantity,
        conversion_numerator: original.conversion_numerator, conversion_denominator: original.conversion_denominator,
        rounding_mode: original.rounding_mode, unit_cost_vnd: original.unit_cost_vnd,
        purchase_price_rule_id: null, purchase_price_rule_version: null, price_source_type: "MANUAL_APPROVED", override_reason: null };
    }
    const reference = priceResult.data?.find((row) => row.material_id === entry.materialId && row.purchase_uom_id === entry.orderedUomId);
    if (manual) {
      if (!canManagePrice) throw new AppError({ code: "FORBIDDEN", message: `Dòng ${index + 1}: không có quyền quản lý giá mua.`, status: 403 });
      if (!reason && original?.price_source_type === "MANUAL_APPROVED" && original.material_id === entry.materialId && original.ordered_uom_id === entry.orderedUomId && original.unit_cost_vnd === manual) reason = original.override_reason ?? "";
      reason = finalPurchaseCostReason(manual, reason, reference ? { id: reference.id, version: reference.version, unitCostVnd: reference.unit_cost_vnd.toString() } : null);
    }
    if (!manual && reason) throw new AppError({ code: "VALIDATION_FAILED", message: `Dòng ${index + 1}: lý do giá thủ công thiếu đơn giá.`, status: 422 });
    const rule = manual ? null : priceResult.data?.find((row) => row.material_id === entry.materialId && row.purchase_uom_id === entry.orderedUomId);
    if (!manual && !rule) throw new AppError({ code: "VALIDATION_FAILED", message: `Dòng ${index + 1}: không có giá mua hiệu lực.`, status: 422 });
    return { source_line_id: entry.sourceLineId ?? null, linked_sales_order_line_id: entry.salesLineId ?? null,
      material_id: entry.materialId, ordered_uom_id: entry.orderedUomId, quantity: entry.quantity,
      conversion_numerator: conversion?.numerator.toString() ?? "1", conversion_denominator: conversion?.denominator.toString() ?? "1",
      rounding_mode: conversion?.rounding_mode ?? "HALF_UP", unit_cost_vnd: manual || rule!.unit_cost_vnd.toString(),
      purchase_price_rule_id: rule?.id ?? null, purchase_price_rule_version: rule?.version ?? null,
      price_source_type: manual ? "MANUAL_APPROVED" : rule!.source_type, override_reason: manual ? reason : null };
  });
  const previews: CostPreviewLine[] = lines.map((line, index) => {
    if (!isExactBaseQuantity(line.quantity, line.conversion_numerator, line.conversion_denominator)) throw new AppError({ code: "VALIDATION_FAILED", message: "Lượng sau quy đổi vượt độ chính xác hoặc giới hạn hỗ trợ.", status: 422 });
    const amount = new PurchaseDecimal(line.quantity).mul(line.unit_cost_vnd).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    if (!amount.isFinite() || amount.lte(0) || amount.gt("9223372036854775807")) throw new AppError({ code: "VALIDATION_FAILED", message: `Dòng ${index + 1}: thành tiền không hợp lệ.`, status: 422 });
    return { materialId: input.lines[index].materialId, orderedUomId: input.lines[index].orderedUomId, quantity: input.lines[index].quantity,
      unitCostVnd: line.unit_cost_vnd, priceSourceType: line.price_source_type, lineTotalVnd: amount.toFixed(0),
      purchasePriceRuleId: line.purchase_price_rule_id, purchasePriceRuleVersion: line.purchase_price_rule_version, overrideReason: line.override_reason };
  });
  const total = previews.reduce((sum, line) => sum + BigInt(line.lineTotalVnd), 0n);
  if (total > 9223372036854775807n) throw new AppError({ code: "VALIDATION_FAILED", message: "Tổng đơn mua vượt giới hạn.", status: 422 });
  return { lines, previews, totalVnd: total.toString() };
}

export async function previewWarehousePurchaseAction(input: unknown): Promise<CostPreviewResult> {
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Chọn nhà cung cấp và nhập đủ các dòng mua trước khi xem giá." };
  const access = await requireInternalPermission("purchasing.create");
  const canReadCost = access.permissions.has("purchasing.price.read");
  const createsSales = parsed.data.mode === "LINKED_DIRECT" && !parsed.data.salesOrderId && !parsed.data.documentId;
  if (createsSales && !access.permissions.has("orders.create")) return { success: false, message: "Không có quyền tạo đơn bán liên kết." };
  if (!canReadCost && !createsSales) return { success: false, message: "Không có quyền xem giá mua." };
  try {
    const draft = parsed.data.documentId ? await loadEditableDraft(parsed.data.documentId, access.branchId) : null;
    if (draft && draft.order.draft_version !== parsed.data.expectedVersion) return { success: false, message: errorMessage("draft_version_conflict") };
    const result = await buildWarehouseLines(parsed.data, access.branchId, access.permissions.has("purchasing.price.manage"), draft?.originals);
    const sales = createsSales ? salesPreview(await buildSalesLines(parsed.data.customerId ?? "", result.lines, access.branchId, parsed.data.lines, access.permissions.has("pricing.manage"))) : undefined;
    return { success: true, message: "Giá đã được xem trước. Kiểm tra từng dòng trước khi lưu.",
      ...(canReadCost ? { lines: result.previews, totalVnd: result.totalVnd } : {}), sales };
  } catch (error) { return { success: false, message: error instanceof AppError ? error.message : "Không thể xem trước giá mua." }; }
}

async function saveWarehouseDocument(mode: "create" | "edit", formData: FormData): Promise<PurchaseActionState> {
  const input = documentInput(formData);
  if (!input) return { message: "Đơn mua cần từ 1 đến 50 dòng hợp lệ." };
  const access = await requireInternalPermission("purchasing.create");
  // "Tạo đơn mua" = save the warehouse draft, then confirm it, each with its own retry-safe operation ID.
  let confirmOperationId: string | null = null;
  if (mode === "create" && input.mode === "WAREHOUSE" && formData.get("intent") === "confirm") {
    if (!access.permissions.has("purchasing.confirm")) return { message: "Bạn không có quyền xác nhận đơn mua. Hãy chọn Lưu nháp." };
    const confirmId = z.guid().safeParse(formData.get("confirmOperationId"));
    if (!confirmId.success || confirmId.data === input.operationId) return { message: "Thông tin xác nhận đơn mua chưa hợp lệ. Hãy tải lại màn hình." };
    confirmOperationId = confirmId.data;
  }
  const supabase = await createServerSupabase();
  try {
    if (mode === "edit" && (!input.documentId || !input.expectedVersion)) return { message: "Bản nháp đơn mua không hợp lệ." };
    const draft = mode === "edit" ? await loadEditableDraft(input.documentId!, access.branchId) : null;
    if (draft) {
      const expectedMode = draft.order.destination_type === "WAREHOUSE" ? "WAREHOUSE" : "LINKED_DIRECT";
      if (draft.order.supplier_id !== input.supplierId || expectedMode !== input.mode ||
        (input.mode === "WAREHOUSE" && draft.order.warehouse_id !== input.warehouseId) ||
        (input.mode === "LINKED_DIRECT" && draft.order.source_sales_order_id !== input.salesOrderId))
        return { message: "Điểm đến hoặc nguồn của đơn mua đã thay đổi. Hãy tải lại." };
      if (draft.order.draft_version !== input.expectedVersion) return { message: errorMessage("draft_version_conflict") };
    } else if (input.mode === "WAREHOUSE" ? !input.warehouseId || input.lines.some((line) => line.salesLineId) :
      !input.salesOrderId && (!input.customerId || !input.siteId || !access.permissions.has("orders.create"))) {
      return { message: "Điểm đến hoặc quyền tạo đơn mua chưa hợp lệ." };
    }
    if (input.mode === "LINKED_DIRECT" && input.salesOrderId && input.lines.some((line) => !line.salesLineId))
      return { message: "Mỗi dòng mua giao thẳng cần gắn dòng đơn bán cụ thể." };
    const result = await buildWarehouseLines(input, access.branchId, access.permissions.has("purchasing.price.manage"), draft?.originals);
    if (access.permissions.has("purchasing.price.read")) {
      let expected: CostPreviewLine[];
      try { expected = z.array(costPreviewLineSchema).length(result.previews.length).parse(JSON.parse(String(formData.get("costPreview") ?? ""))); }
      catch { return { message: "Cần xem trước giá của mọi dòng trước khi lưu." }; }
      if (!result.previews.every((line, index) => Object.keys(line).every((key) => line[key as keyof CostPreviewLine] === expected[index][key as keyof CostPreviewLine]))) {
        return { message: "Giá mua hoặc dòng hàng đã thay đổi. Vui lòng xem trước lại." };
      }
    }
    const expectedAt = toIso(input.expectedAt);
    let rpcResult;
    if (draft) {
      rpcResult = await supabase.rpc("update_purchase_order_draft", { target_purchase_order_id: input.documentId!,
        expected_version: input.expectedVersion!, expected_at: expectedAt, commercial_terms: input.terms || null,
        purchase_lines: result.lines, operation_id: input.operationId });
    } else if (input.mode === "WAREHOUSE") {
      rpcResult = await supabase.rpc("create_purchase_order_draft", { target_branch_id: access.branchId, target_supplier_id: input.supplierId,
        target_warehouse_id: input.warehouseId!, expected_at: expectedAt, commercial_terms: input.terms || null,
        purchase_lines: result.lines, operation_id: input.operationId });
    } else if (input.salesOrderId) {
      rpcResult = await supabase.rpc("create_direct_purchase_from_sales_order", { target_sales_order_id: input.salesOrderId,
        target_supplier_id: input.supplierId, purchase_lines: result.lines, expected_at: expectedAt, operation_id: input.operationId });
      if (!rpcResult.error && rpcResult.data) {
        try {
          await finishDirectPurchaseDraft(supabase, { purchaseOrderId: rpcResult.data, branchId: access.branchId,
            expectedAt, terms: input.terms || null, operationId: input.operationId, lines: result.lines });
        } catch {
          revalidatePath("/admin/purchase-orders");
          revalidatePath(`/admin/purchase-orders/${rpcResult.data}`);
          return { partialPurchaseOrderId: rpcResult.data,
            message: "Đơn mua nháp đã được tạo nhưng chưa xác nhận được điều khoản. Không tạo lại; mở đơn này để kiểm tra và hoàn tất bản nháp." };
        }
      }
    } else {
      const salesLines = await buildSalesLines(input.customerId!, result.lines, access.branchId, input.lines, access.permissions.has("pricing.manage"));
      const actualSales = salesPreview(salesLines);
      let expectedSales: z.infer<typeof salesPreviewLineSchema>[];
      try { expectedSales = z.array(salesPreviewLineSchema).length(actualSales.lines.length).parse(JSON.parse(String(formData.get("salesPreview") ?? ""))); }
      catch { return { message: "Cần xem trước giá bán của mọi dòng trước khi tạo đơn bán liên kết." }; }
      if (!actualSales.lines.every((line, index) => Object.keys(line).every((key) => line[key as keyof typeof line] === expectedSales[index][key as keyof typeof line]))) {
        return { message: "Giá bán hoặc dòng hàng đã thay đổi. Vui lòng xem trước lại." };
      }
      rpcResult = await supabase.rpc("create_linked_direct_drafts", { target_branch_id: access.branchId,
        target_supplier_id: input.supplierId, target_customer_id: input.customerId!, target_site_id: input.siteId!,
        purchase_line: result.lines, sales_line: salesLines, expected_at: expectedAt,
        commercial_terms: input.terms || null, operation_id: input.operationId });
    }
    if (rpcResult.error || !rpcResult.data) return { message: errorMessage(rpcResult.error?.message ?? "unknown") };
    revalidatePath("/admin/purchase-orders");
    revalidatePath(`/admin/purchase-orders/${rpcResult.data}`);
    if (confirmOperationId) {
      const confirmed = await supabase.rpc("confirm_purchase_order", { target_purchase_order_id: rpcResult.data, operation_id: confirmOperationId });
      if (confirmed.error) redirect(`/admin/purchase-orders/${rpcResult.data}?error=${encodeURIComponent(`Đã lưu đơn mua nháp nhưng chưa xác nhận được: ${errorMessage(confirmed.error.message, true)}`)}`);
      const delivered = await supplierDeliveryAfterConfirm(supabase, access.permissions, rpcResult.data, derivedOperationId(confirmOperationId, "supplier-delivery"));
      redirect(`/admin/purchase-orders/${rpcResult.data}?notice=${delivered ? "supplier-delivery-created" : "confirmed"}`);
    }
    redirect(`/admin/purchase-orders/${rpcResult.data}?notice=${mode === "edit" ? "updated" : "created"}`);
  } catch (error) {
    unstable_rethrow(error);
    return { message: error instanceof AppError ? error.message : "Không thể chuẩn bị đơn mua." };
  }
}

export async function updatePurchaseOrderDraftAction(_: PurchaseActionState, formData: FormData) { return saveWarehouseDocument("edit", formData); }

async function buildSalesLines(customerId: string, purchaseLines: { material_id: string; ordered_uom_id: string;
  quantity: string; conversion_numerator: string; conversion_denominator: string; rounding_mode: string }[], branchId: string,
  inputs: z.infer<typeof documentLineSchema>[], canManagePrice: boolean) {
  const supabase = await createServerSupabase();
  const materialIds = [...new Set(purchaseLines.map((line) => line.material_id))];
  const uomIds = [...new Set(purchaseLines.map((line) => line.ordered_uom_id))];
  const [customerResult, materialResult, ruleResult] = await Promise.all([
    supabase.from("customers").select("tier_code").eq("id", customerId).eq("branch_id", branchId).eq("active", true).maybeSingle(),
    supabase.from("materials").select("id, group_id, base_uom_id").in("id", materialIds),
    supabase.from("pricing_rules").select("id, branch_id, scope_type, customer_id, material_id, material_group_id, customer_tier_code, price_uom_id, unit_price_vnd::text, version, source_type, effective_from, effective_to, active")
      .eq("branch_id", branchId).in("price_uom_id", uomIds).eq("active", true),
  ]);
  if (customerResult.error || !customerResult.data || materialResult.error || !materialResult.data || materialResult.data.length !== materialIds.length || ruleResult.error)
    throw new AppError({ code: "VALIDATION_FAILED", message: "Không thể xác định giá bán cho bản nháp liên kết.", status: 422 });
  const rules: PriceRule[] = (ruleResult.data ?? []).map((row) => ({
    id: row.id, branchId: row.branch_id, scope: row.scope_type as PriceRule["scope"],
    customerId: row.customer_id ?? undefined, materialId: row.material_id ?? undefined, materialGroupId: row.material_group_id ?? undefined,
    customerTierCode: row.customer_tier_code ?? undefined, priceUomId: row.price_uom_id,
    unitPriceVnd: row.unit_price_vnd.toString(), version: row.version, sourceType: row.source_type as PriceRule["sourceType"],
    effectiveFrom: row.effective_from, effectiveTo: row.effective_to ?? undefined, active: row.active,
  }));
  const materials = new Map(materialResult.data.map((row) => [row.id, row]));
  const customerTierCode = customerResult.data.tier_code ?? undefined;
  const at = new Date();
  return purchaseLines.map((line, index) => {
    const manual = inputs[index].manualSalesPriceVnd?.trim() ?? "";
    let reason = inputs[index].manualSalesReason?.trim() ?? "";
    if (manual) {
      if (!canManagePrice) throw new AppError({ code: "FORBIDDEN", message: `Dòng ${index + 1}: không có quyền quản lý giá bán.`, status: 403 });
      let reference: PriceRule | null = null;
      try { reference = resolvePrice({ branchId, customerId, customerTierCode, materialId: line.material_id, materialGroupId: materials.get(line.material_id)!.group_id, priceUomId: line.ordered_uom_id, at, rules }); } catch (error) { if (!(error instanceof AppError)) throw error; }
      reason = finalSellingPriceReason(manual, reason, reference);
    }
    if (!manual && reason) throw new AppError({ code: "VALIDATION_FAILED", message: `Dòng ${index + 1}: cần nhập giá bán khi ghi lý do.`, status: 422 });
    const selected = manual ? null : resolvePrice({ branchId, customerId, customerTierCode,
      materialId: line.material_id, materialGroupId: materials.get(line.material_id)!.group_id,
      priceUomId: line.ordered_uom_id, at, rules });
    return { material_id: line.material_id, ordered_uom_id: line.ordered_uom_id, quantity: line.quantity,
      conversion_numerator: line.conversion_numerator, conversion_denominator: line.conversion_denominator,
      rounding_mode: line.rounding_mode, unit_price_vnd: manual || selected!.unitPriceVnd, pricing_rule_id: selected?.id ?? null,
      pricing_rule_version: selected?.version ?? null, price_source_type: manual ? "MANUAL_APPROVED" : selected!.sourceType,
      override_reason: manual ? reason : null };
  });
}

function salesPreview(lines: Awaited<ReturnType<typeof buildSalesLines>>): SalesPurchasePreview {
  const previews = lines.map((line) => {
    if (!isExactBaseQuantity(line.quantity, line.conversion_numerator, line.conversion_denominator)) throw new AppError({ code: "VALIDATION_FAILED", message: "Lượng sau quy đổi vượt độ chính xác hoặc giới hạn hỗ trợ.", status: 422 });
    const amount = new PurchaseDecimal(line.quantity).mul(line.unit_price_vnd).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    if (!amount.isFinite() || amount.lte(0) || amount.gt("9223372036854775807")) throw new AppError({ code: "VALIDATION_FAILED", message: "Thành tiền bán không hợp lệ.", status: 422 });
    return { materialId: line.material_id, orderedUomId: line.ordered_uom_id, quantity: line.quantity,
      unitPriceVnd: line.unit_price_vnd, priceSourceType: line.price_source_type, lineTotalVnd: amount.toFixed(0),
      pricingRuleId: line.pricing_rule_id, pricingRuleVersion: line.pricing_rule_version, overrideReason: line.override_reason };
  });
  const total = previews.reduce((sum, line) => sum + BigInt(line.lineTotalVnd), 0n);
  if (total > 9223372036854775807n) throw new AppError({ code: "VALIDATION_FAILED", message: "Tổng đơn bán vượt giới hạn.", status: 422 });
  return { lines: previews, totalVnd: total.toString() };
}

export async function createPurchaseOrderAction(_: PurchaseActionState, formData: FormData): Promise<PurchaseActionState> {
  return saveWarehouseDocument("create", formData);
}

/**
 * D19/D20: a confirmed supplier-direct purchase order gets its delivery (contact = the supplier) right away when the person
 * may make and assign deliveries; otherwise the purchase order page keeps "Lập phiếu NCC giao thẳng".
 */
async function supplierDeliveryAfterConfirm(supabase: Awaited<ReturnType<typeof createServerSupabase>>, permissions: ReadonlySet<string>,
  purchaseOrderId: string, operationId: string): Promise<boolean> {
  if (!permissions.has("delivery.create") || !permissions.has("delivery.assign")) return false;
  try {
    const { data: purchase } = await supabase.from("purchase_orders").select("destination_type").eq("id", purchaseOrderId).maybeSingle();
    if (purchase?.destination_type !== "CUSTOMER_SITE") return false;
    const { error } = await supabase.rpc("create_supplier_direct_delivery", { target_purchase_order_id: purchaseOrderId, operation_id: operationId });
    return !error;
  } catch {
    return false;
  }
}

export async function confirmPurchaseOrderAction(formData: FormData) {
  const parsed = z.object({ entityId: z.guid(), operationId: z.guid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/purchase-orders?error=invalid-command");
  const access = await requireInternalPermission("purchasing.confirm");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("confirm_purchase_order", { target_purchase_order_id: parsed.data.entityId, operation_id: parsed.data.operationId });
  const destination = `/admin/purchase-orders/${parsed.data.entityId}`;
  if (error) redirect(`${destination}?error=${encodeURIComponent(errorMessage(error.message, true))}`);
  const delivered = await supplierDeliveryAfterConfirm(supabase, access.permissions, parsed.data.entityId, derivedOperationId(parsed.data.operationId, "supplier-delivery"));
  revalidatePath("/admin/purchase-orders");
  redirect(`${destination}?notice=${delivered ? "supplier-delivery-created" : "confirmed"}`);
}

/** "Lập phiếu NCC giao thẳng" on a confirmed direct purchase order whose delivery was not made at confirmation. */
export async function createSupplierDirectDeliveryAction(formData: FormData) {
  const parsed = z.object({ entityId: z.guid(), operationId: z.guid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/purchase-orders?error=invalid-command");
  await requireInternalPermission("delivery.create");
  const supabase = await createServerSupabase();
  const destination = `/admin/purchase-orders/${parsed.data.entityId}`;
  const { data, error } = await supabase.rpc("create_supplier_direct_delivery", { target_purchase_order_id: parsed.data.entityId, operation_id: parsed.data.operationId });
  if (error || !data) {
    const message = error?.message.includes("nothing_to_deliver") ? "Đơn mua này đã có phiếu giao cho toàn bộ lượng."
      : error?.message.includes("purchase_order_not_direct") ? "Chỉ đơn mua NCC giao thẳng đã duyệt mới lập phiếu giao từ đây."
      : error?.code === "42501" ? "Cần quyền lập phiếu giao và phân giao để lập phiếu NCC giao thẳng."
      : "Không thể lập phiếu NCC giao thẳng. Không có thay đổi nào được ghi.";
    redirect(`${destination}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(destination);
  redirect(`/admin/deliveries/${data}?notice=supplier-delivery-created`);
}

export async function cancelPurchaseOrderAction(formData: FormData) {
  const parsed = z.object({ entityId: z.guid(), operationId: z.guid(), reason: z.string().trim().min(3).max(500) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/purchase-orders?error=invalid-command");
  await requireInternalPermission("purchasing.cancel");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("cancel_purchase_order", { target_purchase_order_id: parsed.data.entityId, cancel_reason: parsed.data.reason, operation_id: parsed.data.operationId });
  const destination = `/admin/purchase-orders/${parsed.data.entityId}`;
  if (error) redirect(`${destination}?error=${encodeURIComponent(errorMessage(error.message))}`);
  revalidatePath("/admin/purchase-orders");
  redirect(`${destination}?notice=cancelled`);
}

export async function createSupplierQuickAction(_: PurchaseActionState, formData: FormData): Promise<PurchaseActionState> {
  const parsed = z.object({ code: z.string().trim().regex(/^[A-Za-z0-9_-]{2,32}$/), name: z.string().trim().min(2).max(160), phone: z.string().trim().max(40).optional(), operationId: z.guid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: "Thông tin nhà cung cấp chưa hợp lệ." };
  const access = await requireInternalPermission("purchasing.create");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("create_supplier_quick", { target_branch_id: access.branchId, supplier_code: parsed.data.code, supplier_name: parsed.data.name, supplier_phone: parsed.data.phone || "", operation_id: parsed.data.operationId });
  if (error || !data) return { message: errorMessage(error?.message ?? "unknown") };
  revalidatePath("/admin/purchase-orders/new");
  return { success: true, supplierId: data, message: "Đã tạo nhà cung cấp. Danh sách chọn đã được cập nhật." };
}


export async function updatePurchaseWarehouseAddressAction(input: {
  warehouseId: string; address: string; expectedAddress: string | null; reason: string; operationId: string;
}): Promise<{ success: boolean; message: string; address?: string }> {
  const parsed = z.object({ warehouseId: z.guid(), address: z.string().max(2000), expectedAddress: z.string().nullable(), reason: z.string().trim().min(3).max(500), operationId: z.guid() }).safeParse(input);
  if (!parsed.success) return { success: false, message: "Nhập địa chỉ và lý do cập nhật hợp lệ." };
  const address = normalizeWarehouseAddress(parsed.data.address);
  if (!address) return { success: false, message: warehouseAddressRequired };
  try {
    const access = await requireInternalPermission("purchasing.create");
    if (!access.permissions.has("roles.manage")) return { success: false, message: "Bạn không có quyền sửa kho. Vui lòng liên hệ người phụ trách bổ sung địa chỉ." };
    const supabase = await createServerSupabase();
    const { data: warehouse, error: readError } = await supabase.from("warehouses").select("id").eq("id", parsed.data.warehouseId).eq("branch_id", access.branchId).eq("active", true).maybeSingle();
    if (readError || !warehouse) return { success: false, message: "Kho không còn khả dụng trong chi nhánh hiện tại." };
    const { error } = await supabase.rpc("save_catalog_record", { kind: "warehouses", target_id: parsed.data.warehouseId, target_branch_id: access.branchId,
      values_json: { address_text: address }, expected_json: { address_text: parsed.data.expectedAddress }, change_reason: parsed.data.reason, operation_id: parsed.data.operationId });
    if (error) return { success: false, message: errorMessage(error.message) };
    revalidatePath("/admin/purchase-orders");
    return { success: true, message: "Đã bổ sung địa chỉ kho. Nội dung đơn mua được giữ nguyên.", address };
  } catch (error) { unstable_rethrow(error); return { success: false, message: error instanceof AppError ? error.message : "Không thể cập nhật địa chỉ kho. Nội dung đơn mua được giữ nguyên." }; }
}

export async function updatePurchaseDraftDestinationAction(input: {
  documentId: string; expectedVersion: number; warehouseId: string; reason: string; operationId: string;
}): Promise<{ success: boolean; message: string; version?: number; warehouseId?: string; address?: string }> {
  const parsed = z.object({ documentId: z.guid(), expectedVersion: z.number().int().positive(), warehouseId: z.guid(), reason: z.string().trim().min(3).max(500), operationId: z.guid() }).safeParse(input);
  if (!parsed.success) return { success: false, message: "Thông tin kho nhận hoặc lý do chưa hợp lệ." };
  try {
    const access = await requireInternalPermission("purchasing.create");
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc("update_purchase_order_warehouse", { target_purchase_order_id: parsed.data.documentId, expected_version: parsed.data.expectedVersion,
      target_warehouse_id: parsed.data.warehouseId, change_reason: parsed.data.reason, operation_id: parsed.data.operationId });
    if (error) return { success: false, message: errorMessage(error.message) };
    const { data, error: readError } = await supabase.from("purchase_orders").select("draft_version, warehouse_id, destination_address_snapshot")
      .eq("id", parsed.data.documentId).eq("branch_id", access.branchId).eq("state", "DRAFT").maybeSingle();
    if (readError || !data || data.draft_version !== parsed.data.expectedVersion + 1 || data.warehouse_id !== parsed.data.warehouseId) {
      return { success: false, message: "Đơn mua đã được cập nhật. Hãy tải lại trước khi sửa tiếp để tránh ghi đè thay đổi mới." };
    }
    revalidatePath("/admin/purchase-orders");
    return { success: true, message: "Đã cập nhật địa chỉ nhận của đơn mua nháp. Chưa xác nhận đơn.", version: data.draft_version, warehouseId: data.warehouse_id, address: data.destination_address_snapshot };
  } catch (error) { unstable_rethrow(error); return { success: false, message: error instanceof AppError ? error.message : "Chưa xác định được kết quả cập nhật. Hãy thử lại cùng thao tác." }; }
}
