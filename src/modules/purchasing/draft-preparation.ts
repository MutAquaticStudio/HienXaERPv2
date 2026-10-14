import "server-only";

import Decimal from "decimal.js";
import { z } from "zod";
import { AppError } from "@/lib/core/errors";
import { isExactEntryQuantity, isExactBaseQuantity } from "@/lib/core/quantity";
import { createServerSupabase } from "@/lib/supabase/server";
import { finalPurchaseCostReason } from "./manual-cost";

export const PurchaseDecimal = Decimal.clone({ precision: 50 });

const positive = z.string().trim().refine((value) => { return isExactEntryQuantity(value); });
export const documentLineSchema = z.object({ materialId: z.uuid(), orderedUomId: z.uuid(), quantity: positive,
  manualCostVnd: z.string().trim().optional(), manualCostReason: z.string().trim().max(500).optional(),
  manualSalesPriceVnd: z.string().trim().optional(), manualSalesReason: z.string().trim().max(500).optional(),
  sourceLineId: z.uuid().optional(), salesLineId: z.uuid().optional() });
export const documentSchema = z.object({ mode: z.enum(["WAREHOUSE", "LINKED_DIRECT"]), supplierId: z.uuid(),
  warehouseId: z.uuid().optional(), customerId: z.uuid().optional(), siteId: z.uuid().optional(),
  salesOrderId: z.uuid().optional(), documentId: z.uuid().optional(), expectedVersion: z.number().int().positive().optional(),
  expectedAt: z.string().optional(), terms: z.string().trim().max(1000).optional(), operationId: z.uuid(),
  lines: z.array(documentLineSchema).min(1).max(50) });
export const costPreviewLineSchema = z.object({ materialId: z.uuid(), orderedUomId: z.uuid(), quantity: z.string(),
  unitCostVnd: z.string(), priceSourceType: z.string(), lineTotalVnd: z.string(),
  purchasePriceRuleId: z.uuid().nullable(), purchasePriceRuleVersion: z.number().int().nullable(), overrideReason: z.string().nullable() });
export type CostPreviewLine = z.infer<typeof costPreviewLineSchema>;
export type OriginalPurchaseLine = { id: string; linked_sales_order_line_id: string | null; material_id: string;
  ordered_uom_id: string; conversion_numerator: string; conversion_denominator: string; rounding_mode: string;
  unit_cost_vnd: string | null; purchase_price_rule_id: string | null; purchase_price_rule_version: number | null;
  price_source_type: string | null; override_reason: string | null };

export async function buildWarehouseLines(input: z.infer<typeof documentSchema>, branchId: string, canManagePrice: boolean,
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
