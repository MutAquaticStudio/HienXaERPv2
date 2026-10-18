"use server";
import { isExactEntryQuantity } from "@/lib/core/quantity";
import { revalidatePath } from "next/cache";
import { isAuthoritativeRejection, type CommandOutcome } from "@/lib/core/command-outcome";
import { checkSavedCommandFieldsAction } from "@/lib/core/command-outcome-actions";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { inventoryCommandMessage as message } from "./errors";

const positive = z.string().trim().refine((value) => {
  return isExactEntryQuantity(value);
});

function operationLines(formData: FormData, quantityKey: "received_quantity" | "supplier_quantity") {
  const ids = formData.getAll("purchaseOrderLineId");
  const quantities = formData.getAll("quantity");
  if (!ids.length || ids.length > 50 || ids.length !== quantities.length) return null;
  const seen = new Set<string>();
  const lines: { purchase_order_line_id: string; received_quantity?: string; supplier_quantity?: string }[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const rawQuantity = quantities[index];
    if (typeof id !== "string" || typeof rawQuantity !== "string") return null;
    const parsedId = z.guid().safeParse(id);
    if (!parsedId.success || seen.has(parsedId.data)) return null;
    seen.add(parsedId.data);
    if (!rawQuantity.trim()) continue;
    const parsedQuantity = positive.safeParse(rawQuantity);
    if (!parsedQuantity.success) return null;
    lines.push({ purchase_order_line_id: parsedId.data, [quantityKey]: parsedQuantity.data });
  }
  return lines.length ? lines : null;
}

export async function receivePurchaseOrderWithOutcomeAction(formData: FormData): Promise<CommandOutcome> {
  const parsed = z.object({ purchaseOrderId: z.guid(), receivedAt: z.iso.datetime(), operationId: z.guid(), evidenceId: z.union([z.guid(), z.literal("")]).optional() }).safeParse(Object.fromEntries(formData));
  const lines = operationLines(formData, "received_quantity");
  if (!parsed.success || !lines) return { status: "FAILED", message: "Vui lòng kiểm tra dòng và số lượng nhận hàng." };
  await requireInternalPermission("inventory.receive");
  const changedIntent = await checkSavedCommandFieldsAction(formData, "receive_purchase_order");
  if (changedIntent) return changedIntent;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("receive_purchase_order", {
    target_purchase_order_id: parsed.data.purchaseOrderId,
    receipt_lines: lines,
    target_evidence_id: parsed.data.evidenceId || null,
    received_at: parsed.data.receivedAt,
    operation_id: parsed.data.operationId,
  });
  const destination = `/admin/purchase-orders/${parsed.data.purchaseOrderId}`;
  if (error || !data) return {
    status: isAuthoritativeRejection(error?.code) ? "FAILED" : "UNKNOWN",
    message: isAuthoritativeRejection(error?.code) ? message(error?.message) : "Chưa xác định được kết quả ghi nhận. Hãy tra cứu và thử lại cùng thao tác, không tạo lần nhận mới.",
  };
  revalidatePath("/admin/inventory");
  revalidatePath(destination);
  return { status: "SUCCESS", resultId: String(data), message: "Đã ghi nhận hàng nhập và công nợ đúng nguồn." };
}

export async function receivePurchaseOrderAction(formData: FormData) {
  const result = await receivePurchaseOrderWithOutcomeAction(formData);
  const id = z.guid().safeParse(formData.get("purchaseOrderId"));
  const target = id.success ? `/admin/purchase-orders/${id.data}` : "/admin/purchase-orders";
  if (result.status !== "SUCCESS") redirect(`${target}?error=${encodeURIComponent(result.message)}`);
  redirect(`${target}?notice=received`);
}

export async function verifySupplierFulfillmentWithOutcomeAction(formData: FormData): Promise<CommandOutcome> {
  const parsed = z.object({ purchaseOrderId: z.guid(), supplierReference: z.string().trim().max(120).optional(), operationId: z.guid(), evidenceId: z.union([z.guid(), z.literal("")]).optional() }).safeParse(Object.fromEntries(formData));
  const lines = operationLines(formData, "supplier_quantity");
  if (!parsed.success || !lines) return { status: "FAILED", message: "Vui lòng kiểm tra dòng và số lượng nhà cung cấp giao." };
  await requireInternalPermission("inventory.receive");
  const changedIntent = await checkSavedCommandFieldsAction(formData, "verify_supplier_fulfillment");
  if (changedIntent) return changedIntent;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("verify_supplier_fulfillment", {
    target_purchase_order_id: parsed.data.purchaseOrderId,
    fulfillment_lines: lines,
    target_evidence_id: parsed.data.evidenceId || null,
    supplier_reference: parsed.data.supplierReference || null,
    operation_id: parsed.data.operationId,
  });
  const destination = `/admin/purchase-orders/${parsed.data.purchaseOrderId}`;
  if (error || !data) return {
    status: isAuthoritativeRejection(error?.code) ? "FAILED" : "UNKNOWN",
    message: isAuthoritativeRejection(error?.code) ? message(error?.message) : "Chưa xác định được kết quả ghi nhận. Hãy tra cứu và thử lại cùng thao tác, không tạo lần nhận mới.",
  };
  revalidatePath(destination);
  return { status: "SUCCESS", resultId: String(data), message: "Đã xác minh lượng nhà cung cấp giao và công nợ đúng nguồn." };
}

export async function verifySupplierFulfillmentAction(formData: FormData) {
  const result = await verifySupplierFulfillmentWithOutcomeAction(formData);
  const id = z.guid().safeParse(formData.get("purchaseOrderId"));
  const target = id.success ? `/admin/purchase-orders/${id.data}` : "/admin/purchase-orders";
  if (result.status !== "SUCCESS") redirect(`${target}?error=${encodeURIComponent(result.message)}`);
  redirect(`${target}?notice=supplier-verified`);
}

export async function openStockCountAction(formData: FormData) {
  const parsed = z.object({ warehouseId: z.guid(), cutoffAt: z.iso.datetime(), operationId: z.guid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/stock-counts?error=invalid-count");
  const access = await requireInternalPermission("inventory.count");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("open_stock_count", { target_branch_id: access.branchId, target_warehouse_id: parsed.data.warehouseId, cutoff_at: parsed.data.cutoffAt, operation_id: parsed.data.operationId });
  if (error || !data) redirect(`/admin/stock-counts?error=${encodeURIComponent(message(error?.message))}`);
  redirect(`/admin/stock-counts/${data}?notice=opened`);
}
