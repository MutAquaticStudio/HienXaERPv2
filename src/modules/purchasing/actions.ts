"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AppError } from "@/lib/core/errors";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolvePrice, type PriceRule } from "@/modules/pricing/resolve-price";

export type PurchaseActionState = { message: string; success?: boolean; supplierId?: string } | undefined;
const positive = z.string().trim().refine((value) => { try { return new Decimal(value).isPositive(); } catch { return false; } });
const createSchema = z.object({
  mode: z.enum(["WAREHOUSE", "LINKED_DIRECT"]).optional(), supplierId: z.uuid(), warehouseId: z.string().optional(),
  customerId: z.string().optional(), siteId: z.string().optional(), materialId: z.string().optional(),
  orderedUomId: z.string().optional(), quantity: positive, expectedAt: z.string().optional(),
  terms: z.string().trim().max(1000).optional(), manualCostVnd: z.string().trim().optional(),
  manualCostReason: z.string().trim().optional(), salesLineId: z.string().optional(), operationId: z.uuid(),
});

function toIso(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError({ code: "VALIDATION_FAILED", message: "Ngày dự kiến không hợp lệ.", status: 422 });
  return date.toISOString();
}

function errorMessage(message: string) {
  if (message.includes("operation_payload_conflict")) return "Mã thao tác đã được dùng với dữ liệu khác. Hãy tải lại màn hình.";
  if (message.includes("supply_allocation_exceeds_need")) return "Số lượng phân nguồn vượt phần dòng bán còn thiếu.";
  if (message.includes("price_snapshot")) return "Giá mua đã thay đổi hoặc không còn hiệu lực.";
  if (message.includes("version_conflict")) return "Allocation đã được người khác cập nhật. Hãy tải lại.";
  return "Không thể lưu nghiệp vụ mua hàng. Không có thay đổi nào được xác nhận.";
}

async function conversionFor(materialId: string, orderedUomId: string, baseUomId: string) {
  if (orderedUomId === baseUomId) return { numerator: "1", denominator: "1", roundingMode: "HALF_UP" };
  const supabase = await createServerSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("material_uom_conversions").select("numerator, denominator, rounding_mode")
    .eq("material_id", materialId).eq("from_uom_id", orderedUomId).eq("to_uom_id", baseUomId)
    .eq("active", true).eq("settlement_allowed", true).lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`).order("effective_from", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) throw new AppError({ code: "VALIDATION_FAILED", message: "Không có quy đổi mua hàng hợp lệ.", status: 422 });
  return { numerator: data.numerator.toString(), denominator: data.denominator.toString(), roundingMode: data.rounding_mode as "HALF_UP" | "DOWN" };
}

async function buildPurchaseLine(input: z.infer<typeof createSchema>, access: Awaited<ReturnType<typeof requireInternalPermission>>, forced?: { materialId: string; orderedUomId: string; numerator: string; denominator: string; roundingMode: string }) {
  const materialId = forced?.materialId ?? z.uuid().parse(input.materialId);
  const orderedUomId = forced?.orderedUomId ?? z.uuid().parse(input.orderedUomId);
  const supabase = await createServerSupabase();
  const { data: material } = await supabase.from("materials").select("id, base_uom_id").eq("id", materialId).eq("active", true).eq("purchase_enabled", true).maybeSingle();
  if (!material) throw new AppError({ code: "VALIDATION_FAILED", message: "Vật tư không còn cho phép mua.", status: 422 });
  const conversion = forced ? { numerator: forced.numerator, denominator: forced.denominator, roundingMode: forced.roundingMode } : await conversionFor(materialId, orderedUomId, material.base_uom_id);
  if (input.manualCostVnd) {
    if (!access.permissions.has("purchasing.price.manage") || !/^\d+$/.test(input.manualCostVnd) || BigInt(input.manualCostVnd) <= 0n || (input.manualCostReason?.trim().length ?? 0) < 3) {
      throw new AppError({ code: "VALIDATION_FAILED", message: "Giá mua thủ công cần quyền và lý do.", status: 422 });
    }
    return { material_id: materialId, ordered_uom_id: orderedUomId, quantity: input.quantity, conversion_numerator: conversion.numerator, conversion_denominator: conversion.denominator, rounding_mode: conversion.roundingMode, unit_cost_vnd: input.manualCostVnd, purchase_price_rule_id: null, purchase_price_rule_version: null, price_source_type: "MANUAL_APPROVED", override_reason: input.manualCostReason };
  }
  const now = new Date().toISOString();
  const { data: rules, error } = await supabase.from("purchase_price_rules").select("id, unit_cost_vnd, version, source_type")
    .eq("branch_id", access.branchId).eq("supplier_id", input.supplierId).eq("material_id", materialId)
    .eq("purchase_uom_id", orderedUomId).eq("active", true).lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`).order("version", { ascending: false }).limit(1);
  const rule = rules?.[0];
  if (error || !rule) throw new AppError({ code: "VALIDATION_FAILED", message: "Không có giá mua hiệu lực; cần nhập giá thủ công có quyền.", status: 422 });
  return { material_id: materialId, ordered_uom_id: orderedUomId, quantity: input.quantity, conversion_numerator: conversion.numerator, conversion_denominator: conversion.denominator, rounding_mode: conversion.roundingMode, unit_cost_vnd: rule.unit_cost_vnd.toString(), purchase_price_rule_id: rule.id, purchase_price_rule_version: rule.version, price_source_type: rule.source_type };
}

async function buildSalesLine(customerId: string, purchaseLine: Record<string, unknown>, branchId: string) {
  const supabase = await createServerSupabase();
  const materialId = purchaseLine.material_id as string;
  const orderedUomId = purchaseLine.ordered_uom_id as string;
  const [customerResult, materialResult, ruleResult] = await Promise.all([
    supabase.from("customers").select("tier_code").eq("id", customerId).eq("branch_id", branchId).eq("active", true).maybeSingle(),
    supabase.from("materials").select("group_id, base_uom_id").eq("id", materialId).maybeSingle(),
    supabase.from("pricing_rules").select("id, branch_id, scope_type, customer_id, material_id, material_group_id, customer_tier_code, price_uom_id, unit_price_vnd, version, source_type, effective_from, effective_to, active").eq("branch_id", branchId).eq("price_uom_id", orderedUomId).eq("active", true),
  ]);
  if (!customerResult.data || !materialResult.data || ruleResult.error) throw new AppError({ code: "VALIDATION_FAILED", message: "Không thể resolve giá bán cho draft liên kết.", status: 422 });
  const rules: PriceRule[] = (ruleResult.data ?? []).map((row) => ({
    id: row.id, branchId: row.branch_id, scope: row.scope_type as PriceRule["scope"],
    customerId: row.customer_id ?? undefined, materialId: row.material_id ?? undefined, materialGroupId: row.material_group_id ?? undefined,
    customerTierCode: row.customer_tier_code ?? undefined, priceUomId: row.price_uom_id,
    unitPriceVnd: row.unit_price_vnd.toString(), version: row.version, sourceType: row.source_type as PriceRule["sourceType"],
    effectiveFrom: row.effective_from, effectiveTo: row.effective_to ?? undefined, active: row.active,
  }));
  const selected = resolvePrice({ branchId, customerId, customerTierCode: customerResult.data.tier_code ?? undefined, materialId, materialGroupId: materialResult.data.group_id, priceUomId: orderedUomId, at: new Date(), rules });
  return { material_id: materialId, ordered_uom_id: orderedUomId, quantity: purchaseLine.quantity, conversion_numerator: purchaseLine.conversion_numerator, conversion_denominator: purchaseLine.conversion_denominator, rounding_mode: purchaseLine.rounding_mode, unit_price_vnd: selected.unitPriceVnd, pricing_rule_id: selected.id, pricing_rule_version: selected.version, price_source_type: selected.sourceType };
}

export async function createPurchaseOrderAction(_: PurchaseActionState, formData: FormData): Promise<PurchaseActionState> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: "Thông tin đơn mua chưa hợp lệ." };
  const access = await requireInternalPermission("purchasing.create");
  const supabase = await createServerSupabase();
  try {
    const expectedAt = toIso(parsed.data.expectedAt);
    if (parsed.data.salesLineId) {
      const salesLineId = z.uuid().parse(parsed.data.salesLineId);
      const { data: saleLine } = await supabase.from("sales_order_lines").select("id, sales_order_id, material_id, ordered_uom_id, conversion_numerator, conversion_denominator, rounding_mode").eq("id", salesLineId).maybeSingle();
      if (!saleLine) throw new AppError({ code: "VALIDATION_FAILED", message: "Dòng đơn bán không còn khả dụng.", status: 422 });
      const { data: order } = await supabase.from("sales_orders").select("branch_id").eq("id", saleLine.sales_order_id).eq("branch_id", access.branchId).maybeSingle();
      if (!order) throw new AppError({ code: "FORBIDDEN", message: "Dòng đơn bán ngoài chi nhánh.", status: 403 });
      const line = await buildPurchaseLine(parsed.data, access, { materialId: saleLine.material_id, orderedUomId: saleLine.ordered_uom_id, numerator: saleLine.conversion_numerator.toString(), denominator: saleLine.conversion_denominator.toString(), roundingMode: saleLine.rounding_mode });
      const { data, error } = await supabase.rpc("create_direct_purchase_from_sales_line", { source_sales_order_line_id: salesLineId, target_supplier_id: parsed.data.supplierId, requested_quantity: parsed.data.quantity, purchase_line: line, expected_at: expectedAt, operation_id: parsed.data.operationId });
      if (error || !data) return { message: errorMessage(error?.message ?? "unknown") };
      revalidatePath("/admin/orders");
      redirect(`/admin/purchase-orders/${data}?notice=created-direct`);
    }
    const line = await buildPurchaseLine(parsed.data, access);
    if (parsed.data.mode === "LINKED_DIRECT") {
      const customerId = z.uuid().parse(parsed.data.customerId);
      const siteId = z.uuid().parse(parsed.data.siteId);
      const salesLine = await buildSalesLine(customerId, line, access.branchId);
      const { data, error } = await supabase.rpc("create_linked_direct_drafts", { target_branch_id: access.branchId, target_supplier_id: parsed.data.supplierId, target_customer_id: customerId, target_site_id: siteId, purchase_line: line, sales_line: salesLine, expected_at: expectedAt, commercial_terms: parsed.data.terms || null, operation_id: parsed.data.operationId });
      if (error || !data) return { message: errorMessage(error?.message ?? "unknown") };
      revalidatePath("/admin/orders");
      redirect(`/admin/purchase-orders/${data}?notice=created-linked`);
    }
    const warehouseId = z.uuid().parse(parsed.data.warehouseId);
    const { data, error } = await supabase.rpc("create_purchase_order_draft", { target_branch_id: access.branchId, target_supplier_id: parsed.data.supplierId, target_warehouse_id: warehouseId, expected_at: expectedAt, commercial_terms: parsed.data.terms || null, purchase_lines: [line], operation_id: parsed.data.operationId });
    if (error || !data) return { message: errorMessage(error?.message ?? "unknown") };
    redirect(`/admin/purchase-orders/${data}?notice=created`);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AppError) return { message: error.message };
    return { message: "Thông tin liên kết chưa hợp lệ." };
  }
}

export async function confirmPurchaseOrderAction(formData: FormData) {
  const parsed = z.object({ entityId: z.uuid(), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/purchase-orders?error=invalid-command");
  await requireInternalPermission("purchasing.confirm");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("confirm_purchase_order", { target_purchase_order_id: parsed.data.entityId, operation_id: parsed.data.operationId });
  const destination = `/admin/purchase-orders/${parsed.data.entityId}`;
  if (error) redirect(`${destination}?error=${encodeURIComponent(errorMessage(error.message))}`);
  revalidatePath("/admin/purchase-orders");
  redirect(`${destination}?notice=confirmed`);
}

export async function cancelPurchaseOrderAction(formData: FormData) {
  const parsed = z.object({ entityId: z.uuid(), operationId: z.uuid(), reason: z.string().trim().min(3).max(500) }).safeParse(Object.fromEntries(formData));
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
  const parsed = z.object({ code: z.string().trim().regex(/^[A-Za-z0-9_-]{2,32}$/), name: z.string().trim().min(2).max(160), phone: z.string().trim().max(40).optional(), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: "Thông tin nhà cung cấp chưa hợp lệ." };
  const access = await requireInternalPermission("purchasing.create");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("create_supplier_quick", { target_branch_id: access.branchId, supplier_code: parsed.data.code, supplier_name: parsed.data.name, supplier_phone: parsed.data.phone || "", operation_id: parsed.data.operationId });
  if (error || !data) return { message: errorMessage(error?.message ?? "unknown") };
  revalidatePath("/admin/purchase-orders/new");
  return { success: true, supplierId: data, message: "Đã tạo nhà cung cấp. Danh sách chọn đã được cập nhật." };
}
