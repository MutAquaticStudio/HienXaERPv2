"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AppError } from "@/lib/core/errors";
import { requireCustomerAccess, requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolvePrice, type PriceRule } from "@/modules/pricing/resolve-price";

export type SalesActionState = { message: string; success?: boolean } | undefined;

const positiveDecimal = z.string().trim().refine((value) => {
  try { return new Decimal(value).isPositive(); } catch { return false; }
}, "Số lượng không hợp lệ.");
const createSchema = z.object({
  customerId: z.uuid(), siteId: z.uuid(), materialId: z.uuid(), orderedUomId: z.uuid(),
  quantity: positiveDecimal, effectiveAt: z.string().trim().optional(), terms: z.string().trim().max(1000).optional(), operationId: z.uuid(),
});
const commandSchema = z.object({ entityId: z.uuid(), operationId: z.uuid() });

function commandError(message: string) {
  if (message.includes("credit_limit_exceeded")) return "Hạn mức tín dụng không đủ để xác nhận đơn.";
  if (message.includes("credit_limit_not_approved")) return "Khách hàng chưa có hạn mức tín dụng được duyệt.";
  if (message.includes("overdue_receivable_blocks_credit")) return "Khách hàng có công nợ quá hạn; chưa thể xác nhận đơn.";
  if (message.includes("operation_payload_conflict")) return "Mã thao tác đã được dùng với dữ liệu khác. Hãy tải lại màn hình.";
  if (message.includes("not_acceptable")) return "Phiên bản báo giá này không còn có thể chấp nhận.";
  return "Thao tác không hoàn tất. Dữ liệu chưa được xác nhận.";
}

function toIso(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError({ code: "VALIDATION_FAILED", message: "Ngày giờ không hợp lệ.", status: 422 });
  return date.toISOString();
}

async function createCommercialLine(input: z.infer<typeof createSchema>, branchId: string) {
  const supabase = await createServerSupabase();
  const [customerResult, siteResult, materialResult] = await Promise.all([
    supabase.from("customers").select("id, tier_code").eq("id", input.customerId).eq("branch_id", branchId).eq("active", true).maybeSingle(),
    supabase.from("customer_sites").select("id").eq("id", input.siteId).eq("customer_id", input.customerId).eq("active", true).maybeSingle(),
    supabase.from("materials").select("id, group_id, base_uom_id").eq("id", input.materialId).eq("active", true).eq("sale_enabled", true).maybeSingle(),
  ]);
  if (customerResult.error || siteResult.error || materialResult.error || !customerResult.data || !siteResult.data || !materialResult.data) {
    throw new AppError({ code: "VALIDATION_FAILED", message: "Khách hàng, công trình hoặc vật tư không còn hợp lệ.", status: 422 });
  }
  let numerator = "1";
  let denominator = "1";
  if (input.orderedUomId !== materialResult.data.base_uom_id) {
    const now = new Date().toISOString();
    const { data: conversion, error } = await supabase.from("material_uom_conversions")
      .select("numerator, denominator, rounding_mode")
      .eq("material_id", input.materialId).eq("from_uom_id", input.orderedUomId)
      .eq("to_uom_id", materialResult.data.base_uom_id).eq("active", true).eq("settlement_allowed", true)
      .lte("effective_from", now).or(`effective_to.is.null,effective_to.gt.${now}`)
      .order("effective_from", { ascending: false }).limit(1).maybeSingle();
    if (error || !conversion) throw new AppError({ code: "VALIDATION_FAILED", message: "Không có quy đổi quyết toán hợp lệ cho đơn vị đã chọn.", status: 422 });
    numerator = conversion.numerator.toString();
    denominator = conversion.denominator.toString();
  }
  const { data: rows, error: priceError } = await supabase.from("pricing_rules")
    .select("id, branch_id, scope_type, customer_id, material_id, material_group_id, customer_tier_code, price_uom_id, unit_price_vnd, version, source_type, effective_from, effective_to, active")
    .eq("branch_id", branchId).eq("price_uom_id", input.orderedUomId).eq("active", true);
  if (priceError) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Không thể đọc chính sách giá.", status: 503 });
  const rules: PriceRule[] = (rows ?? []).map((row) => ({
    id: row.id, branchId: row.branch_id, scope: row.scope_type as PriceRule["scope"],
    customerId: row.customer_id ?? undefined, materialId: row.material_id ?? undefined,
    materialGroupId: row.material_group_id ?? undefined, customerTierCode: row.customer_tier_code ?? undefined,
    priceUomId: row.price_uom_id, unitPriceVnd: row.unit_price_vnd.toString(), version: row.version,
    sourceType: row.source_type as PriceRule["sourceType"], effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? undefined, active: row.active,
  }));
  const selected = resolvePrice({
    branchId, customerId: input.customerId, customerTierCode: customerResult.data.tier_code ?? undefined,
    materialId: input.materialId, materialGroupId: materialResult.data.group_id,
    priceUomId: input.orderedUomId, at: new Date(), rules,
  });
  return {
    material_id: input.materialId, ordered_uom_id: input.orderedUomId, quantity: input.quantity,
    conversion_numerator: numerator, conversion_denominator: denominator, rounding_mode: "HALF_UP",
    unit_price_vnd: selected.unitPriceVnd, pricing_rule_id: selected.id,
    pricing_rule_version: selected.version, price_source_type: selected.sourceType,
  };
}

async function createDocument(kind: "order" | "quote", formData: FormData): Promise<SalesActionState> {
  const parsed = createSchema.safeParse({
    customerId: formData.get("customerId"), siteId: formData.get("siteId"), materialId: formData.get("materialId"),
    orderedUomId: formData.get("orderedUomId"), quantity: formData.get("quantity"),
    effectiveAt: formData.get("effectiveAt"), terms: formData.get("terms"), operationId: formData.get("operationId"),
  });
  if (!parsed.success) return { message: "Thông tin chứng từ chưa hợp lệ." };
  const access = await requireInternalPermission(kind === "order" ? "orders.create" : "quotation.create");
  let line;
  let effectiveAt;
  try {
    line = await createCommercialLine(parsed.data, access.branchId);
    effectiveAt = toIso(parsed.data.effectiveAt);
  } catch (error) {
    return { message: error instanceof AppError ? error.message : "Không thể chuẩn bị dòng hàng." };
  }
  const supabase = await createServerSupabase();
  const result = kind === "order"
    ? await supabase.rpc("create_sales_order_draft", { target_branch_id: access.branchId, target_customer_id: parsed.data.customerId, target_site_id: parsed.data.siteId, requested_delivery_at: effectiveAt, commercial_terms: parsed.data.terms || null, order_lines: [line], operation_id: parsed.data.operationId })
    : await supabase.rpc("create_quote_draft", { target_branch_id: access.branchId, target_customer_id: parsed.data.customerId, target_site_id: parsed.data.siteId, expires_at: effectiveAt, commercial_terms: parsed.data.terms || null, quote_lines: [line], operation_id: parsed.data.operationId });
  if (result.error || !result.data) return { message: commandError(result.error?.message ?? "unknown") };
  revalidatePath(kind === "order" ? "/admin/orders" : "/admin/quotations");
  redirect(`${kind === "order" ? "/admin/orders" : "/admin/quotations"}/${result.data}?notice=created`);
}

export async function createSalesOrderAction(_: SalesActionState, formData: FormData) { return createDocument("order", formData); }
export async function createQuotationAction(_: SalesActionState, formData: FormData) { return createDocument("quote", formData); }

async function internalCommand(permission: string, rpc: string, args: Record<string, unknown>, destination: string, notice: string) {
  await requireInternalPermission(permission);
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc(rpc, args);
  if (error) redirect(`${destination}?error=${encodeURIComponent(commandError(error.message))}`);
  revalidatePath(destination);
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

export async function sendQuotationAction(formData: FormData) {
  const parsed = commandSchema.extend({ quoteId: z.uuid() }).safeParse({ entityId: formData.get("entityId"), operationId: formData.get("operationId"), quoteId: formData.get("quoteId") });
  if (!parsed.success) redirect("/admin/quotations?error=invalid-command");
  return internalCommand("quotation.send", "send_quote_revision", { target_revision_id: parsed.data.entityId, operation_id: parsed.data.operationId }, `/admin/quotations/${parsed.data.quoteId}`, "sent");
}

export async function acceptQuotationAction(formData: FormData) {
  const parsed = commandSchema.extend({ quoteId: z.uuid(), channel: z.enum(["PHONE", "ZALO", "EMAIL", "OTHER"]), confirmedBy: z.string().trim().min(2).max(160) }).safeParse({ entityId: formData.get("entityId"), operationId: formData.get("operationId"), quoteId: formData.get("quoteId"), channel: formData.get("channel"), confirmedBy: formData.get("confirmedBy") });
  if (!parsed.success) redirect("/admin/quotations?error=invalid-command");
  return internalCommand("quotation.accept", "accept_quote_revision", { target_revision_id: parsed.data.entityId, acceptance_channel: parsed.data.channel, confirmed_by_name: parsed.data.confirmedBy, evidence_object_path: null, operation_id: parsed.data.operationId }, `/admin/quotations/${parsed.data.quoteId}`, "accepted");
}

export async function acceptCustomerQuotationAction(formData: FormData) {
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
  const parsed = commandSchema.extend({ quoteId: z.uuid() }).safeParse({ entityId: formData.get("entityId"), operationId: formData.get("operationId"), quoteId: formData.get("quoteId") });
  if (!parsed.success) redirect("/admin/quotations?error=invalid-command");
  return internalCommand("quotation.create", "create_quote_revision", { source_revision_id: parsed.data.entityId, operation_id: parsed.data.operationId }, `/admin/quotations/${parsed.data.quoteId}`, "revised");
}

export async function createOrderFromQuotationAction(formData: FormData) {
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
