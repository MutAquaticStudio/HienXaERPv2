"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { isAuthoritativeRejection } from "@/lib/core/command-outcome";
import { isExactEntryQuantity } from "@/lib/core/quantity";
import { reasonOrDefault } from "@/lib/core/reason";
import { createServerSupabase } from "@/lib/supabase/server";
import { inventoryCommandMessage } from "./errors";

export type StockCountSheetResult = {
  status: "SUCCESS" | "FAILED" | "UNKNOWN";
  message: string;
  /** The count's version after what was saved; present whenever lines were saved. */
  version?: number;
  approved?: boolean;
};

const UNKNOWN = "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra; hệ thống không ghi trùng.";
const sheetSchema = z.object({
  operationId: z.guid(),
  stockCountId: z.guid(),
  version: z.number().int().positive(),
  lines: z.array(z.object({
    materialId: z.guid(),
    counted: z.string().refine((value) => isExactEntryQuantity(value, true)),
    reason: z.string().trim().max(500),
    unitCost: z.string().refine((value) => isExactEntryQuantity(value)).nullable(),
  })).max(500),
  /** Present for "Hoàn thành & cân bằng kho": approve right after the lines are saved. */
  approveOperationId: z.guid().nullable(),
});

/**
 * Saves the count sheet (FB2 Đợt 5): all new or changed counted lines in one record_stock_count_lines_batch, then, when
 * asked, approve_stock_count on the version that left, which posts the adjustments.
 */
export async function saveStockCountSheetAction(input: unknown): Promise<StockCountSheetResult> {
  const parsed = sheetSchema.safeParse(input);
  if (!parsed.success) return { status: "FAILED", message: "Số đếm hoặc giá vốn không hợp lệ. Kiểm tra các dòng được đánh dấu." };
  const data = parsed.data;
  if (!data.lines.length && !data.approveOperationId) return { status: "FAILED", message: "Chưa có số đếm mới để lưu." };
  if (new Set(data.lines.map((line) => line.materialId)).size !== data.lines.length) return { status: "FAILED", message: "Một vật tư xuất hiện hai lần trong phiếu kiểm. Hãy tải lại trang." };
  // Before the try: a missing permission redirects, which must not be caught.
  if (data.lines.length) await requireInternalPermission("inventory.count");
  if (data.approveOperationId) await requireInternalPermission("inventory.adjust");
  const supabase = await createServerSupabase();
  const destination = `/admin/stock-counts/${data.stockCountId}`;
  let version = data.version;
  let saved = false;
  try {
    if (data.lines.length) {
      const { data: result, error } = await supabase.rpc("record_stock_count_lines_batch", {
        target_stock_count_id: data.stockCountId,
        count_lines: data.lines.map((line) => ({ material_id: line.materialId, counted_base_quantity: line.counted, adjustment_unit_cost_vnd: line.unitCost, reason: line.reason })),
        expected_count_version: data.version,
        operation_id: data.operationId,
      });
      if (error) return isAuthoritativeRejection(error.code) ? { status: "FAILED", message: inventoryCommandMessage(error.message) } : { status: "UNKNOWN", message: UNKNOWN };
      version = Number((result as { version?: number } | null)?.version ?? version);
      saved = true;
      revalidatePath(destination);
    }
    if (!data.approveOperationId) return { status: "SUCCESS", version, message: `Đã lưu ${data.lines.length} dòng kiểm. Phiếu vẫn đang kiểm.` };
    const { error } = await supabase.rpc("approve_stock_count", { target_stock_count_id: data.stockCountId, expected_count_version: version, operation_id: data.approveOperationId });
    if (error) {
      const prefix = saved ? "Đã lưu số đếm nhưng chưa cân bằng kho: " : "";
      return isAuthoritativeRejection(error.code)
        ? { status: "FAILED", version: saved ? version : undefined, message: prefix + inventoryCommandMessage(error.message) }
        : { status: "UNKNOWN", version: saved ? version : undefined, message: UNKNOWN };
    }
    revalidatePath(destination);
    revalidatePath("/admin/stock-counts");
    revalidatePath("/admin/inventory");
    return { status: "SUCCESS", version, approved: true, message: "Đã hoàn thành phiếu kiểm và cân bằng kho." };
  } catch {
    return { status: "UNKNOWN", version: saved ? version : undefined, message: UNKNOWN };
  }
}

const cancelSchema = z.object({ operationId: z.guid(), stockCountId: z.guid(), version: z.number().int().positive(), reason: z.string().trim().max(500).optional() });

/** "Hủy phiếu": an open count is closed without any stock movement; what was counted stays as history. */
export async function cancelStockCountAction(input: unknown): Promise<StockCountSheetResult> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { status: "FAILED", message: "Phiếu kiểm đã thay đổi. Tải lại trang rồi hủy lại." };
  await requireInternalPermission("inventory.count");
  const supabase = await createServerSupabase();
  try {
    const { error } = await supabase.rpc("cancel_stock_count", {
      target_stock_count_id: parsed.data.stockCountId,
      expected_count_version: parsed.data.version,
      cancel_reason: reasonOrDefault(parsed.data.reason, "Hủy phiếu kiểm"),
      operation_id: parsed.data.operationId,
    });
    if (error) return isAuthoritativeRejection(error.code) ? { status: "FAILED", message: inventoryCommandMessage(error.message) } : { status: "UNKNOWN", message: UNKNOWN };
  } catch {
    return { status: "UNKNOWN", message: UNKNOWN };
  }
  revalidatePath(`/admin/stock-counts/${parsed.data.stockCountId}`);
  revalidatePath("/admin/stock-counts");
  return { status: "SUCCESS", message: "Đã hủy phiếu kiểm. Tồn kho không thay đổi." };
}
