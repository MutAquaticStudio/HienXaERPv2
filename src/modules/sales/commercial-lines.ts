// The lines of a sales document (order or quote) as the database expects them: unit conversion to the base unit and the
// price from the price list (or an approved manual price). Shared by the order screen, the Excel import and the assistant.
import Decimal from "decimal.js";

import { AppError } from "@/lib/core/errors";
import { isExactBaseQuantity } from "@/lib/core/quantity";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolvePrice, type PriceRule } from "@/modules/pricing/resolve-price";
import { finalSellingPriceReason } from "./final-price";

export type CommercialLineInput = { materialId: string; orderedUomId: string; quantity: string; manualPriceVnd?: string; manualReason?: string; sourceLineId?: string };
export type CommercialInput = { customerId: string; siteId: string; lines: CommercialLineInput[] };
export type OriginalCommercialLine = { id: string; material_id: string; ordered_uom_id: string; unit_price_vnd: number | string;
  conversion_numerator: number | string; conversion_denominator: number | string; rounding_mode: string;
  price_source_type: string; override_reason: string | null; pricing_rule_id: string | null; pricing_rule_version: number | null };

export async function createCommercialLines(input: CommercialInput, branchId: string, canManagePrice: boolean,
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
      if (!/^[1-9]\d*$/.test(manualPriceVnd) || manualPriceVnd.length > 19 || BigInt(manualPriceVnd) > 9223372036854775807n) {
        throw new AppError({ code: "VALIDATION_FAILED", message: `Dòng ${index + 1}: giá thủ công phải là số VND nguyên dương.`, status: 422 });
      }
      // FB7: the note is optional; without one the history keeps the discount against the price list, or "Giá nhập tay".
      let reference: PriceRule | null = null;
      if (!manualReason) {
        try { reference = resolvePrice({ branchId, customerId: input.customerId, customerTierCode, materialId: inputLine.materialId, materialGroupId: material.group_id, priceUomId: inputLine.orderedUomId, at: now, rules }); }
        catch (error) { if (!(error instanceof AppError)) throw error; }
      }
      manualReason = finalSellingPriceReason(manualPriceVnd, manualReason, reference);
    } else if (manualReason) {
      throw new AppError({ code: "VALIDATION_FAILED", message: `Dòng ${index + 1}: có ghi chú giá nhưng chưa nhập giá thủ công.`, status: 422 });
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
