"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

const positive = z.string().trim().refine((value) => {
  try { return new Decimal(value).isPositive(); } catch { return false; }
});

function message(value?: string) {
  if (value?.includes("operation_payload_conflict")) return "Mã thao tác đã được dùng với dữ liệu khác. Hãy tải lại.";
  if (value?.includes("exceeds")) return "Số lượng vượt phần còn lại của chứng từ nguồn.";
  if (value?.includes("version")) return "Dữ liệu đã được người khác cập nhật. Hãy tải lại.";
  if (value?.includes("cost")) return "Thiếu căn cứ giá vốn hợp lệ.";
  return "Không thể ghi nhận nghiệp vụ kho. Không có thay đổi nào được chốt.";
}

export async function receivePurchaseOrderAction(formData: FormData) {
  const parsed = z.object({ purchaseOrderId: z.uuid(), purchaseOrderLineId: z.uuid(), quantity: positive, receivedAt: z.iso.datetime(), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/purchase-orders?error=invalid-receipt");
  await requireInternalPermission("inventory.receive");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("receive_purchase_order", {
    target_purchase_order_id: parsed.data.purchaseOrderId,
    receipt_lines: [{ purchase_order_line_id: parsed.data.purchaseOrderLineId, received_quantity: parsed.data.quantity }],
    target_evidence_id: null,
    received_at: parsed.data.receivedAt,
    operation_id: parsed.data.operationId,
  });
  const destination = `/admin/purchase-orders/${parsed.data.purchaseOrderId}`;
  if (error || !data) redirect(`${destination}?error=${encodeURIComponent(message(error?.message))}`);
  revalidatePath("/admin/inventory");
  revalidatePath(destination);
  redirect(`${destination}?notice=received`);
}

export async function verifySupplierFulfillmentAction(formData: FormData) {
  const parsed = z.object({ purchaseOrderId: z.uuid(), purchaseOrderLineId: z.uuid(), quantity: positive, supplierReference: z.string().trim().max(120).optional(), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/purchase-orders?error=invalid-fulfillment");
  await requireInternalPermission("inventory.receive");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("verify_supplier_fulfillment", {
    target_purchase_order_id: parsed.data.purchaseOrderId,
    fulfillment_lines: [{ purchase_order_line_id: parsed.data.purchaseOrderLineId, supplier_quantity: parsed.data.quantity }],
    target_evidence_id: null,
    supplier_reference: parsed.data.supplierReference || null,
    operation_id: parsed.data.operationId,
  });
  const destination = `/admin/purchase-orders/${parsed.data.purchaseOrderId}`;
  if (error || !data) redirect(`${destination}?error=${encodeURIComponent(message(error?.message))}`);
  revalidatePath(destination);
  redirect(`${destination}?notice=supplier-verified`);
}

export async function openStockCountAction(formData: FormData) {
  const parsed = z.object({ warehouseId: z.uuid(), cutoffAt: z.iso.datetime(), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/stock-counts?error=invalid-count");
  const access = await requireInternalPermission("inventory.count");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("open_stock_count", { target_branch_id: access.branchId, target_warehouse_id: parsed.data.warehouseId, cutoff_at: parsed.data.cutoffAt, operation_id: parsed.data.operationId });
  if (error || !data) redirect(`/admin/stock-counts?error=${encodeURIComponent(message(error?.message))}`);
  redirect(`/admin/stock-counts/${data}?notice=opened`);
}

export async function recordStockCountLineAction(formData: FormData) {
  const parsed = z.object({ stockCountId: z.uuid(), materialId: z.uuid(), quantity: z.string().trim().refine((value) => { try { return !new Decimal(value).isNegative(); } catch { return false; } }), unitCost: z.string().trim().optional(), reason: z.string().trim().max(500).optional(), version: z.coerce.number().int().positive(), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/stock-counts?error=invalid-line");
  await requireInternalPermission("inventory.count");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("record_stock_count_line", {
    target_stock_count_id: parsed.data.stockCountId,
    target_material_id: parsed.data.materialId,
    counted_base_quantity: parsed.data.quantity,
    adjustment_unit_cost_vnd: parsed.data.unitCost || null,
    reason: parsed.data.reason || "",
    target_evidence_id: null,
    expected_count_version: parsed.data.version,
    operation_id: parsed.data.operationId,
  });
  const destination = `/admin/stock-counts/${parsed.data.stockCountId}`;
  if (error) redirect(`${destination}?error=${encodeURIComponent(message(error.message))}`);
  revalidatePath(destination);
  redirect(`${destination}?notice=line-recorded`);
}

export async function approveStockCountAction(formData: FormData) {
  const parsed = z.object({ stockCountId: z.uuid(), version: z.coerce.number().int().positive(), operationId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/stock-counts?error=invalid-approval");
  await requireInternalPermission("inventory.adjust");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("approve_stock_count", { target_stock_count_id: parsed.data.stockCountId, expected_count_version: parsed.data.version, operation_id: parsed.data.operationId });
  const destination = `/admin/stock-counts/${parsed.data.stockCountId}`;
  if (error) redirect(`${destination}?error=${encodeURIComponent(message(error.message))}`);
  revalidatePath("/admin/inventory");
  revalidatePath(destination);
  redirect(`${destination}?notice=approved`);
}
