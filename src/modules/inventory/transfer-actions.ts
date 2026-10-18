"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkSavedCommandFieldsAction } from "@/lib/core/command-outcome-actions";
import { isAuthoritativeRejection, type CommandOutcome } from "@/lib/core/command-outcome";

const quantity = z.string().trim().regex(/^\d{1,14}(?:\.\d{1,6})?$/);
const reason = z.string().trim().min(3).max(500);
function failure(message?: string, code?: string): CommandOutcome {
 const text = message?.includes("version") ? "Phiếu chuyển kho đã thay đổi. Tải lại và kiểm tra phần còn lại."
  : message?.includes("insufficient_available") ? "Kho đi không đủ lượng khả dụng đã ghi nhận."
  : message?.includes("exceeds") ? "Lượng vượt phần còn lại của kế hoạch, đợt xuất hoặc hồ sơ thiếu."
  : message?.includes("requires_source") ? "Chọn hồ sơ thiếu đang mở để nhận bổ sung hoặc duyệt hao hụt."
  : "Chưa ghi được thao tác chuyển kho. Kiểm tra nguồn, quyền và kết quả đã lưu.";
 return { status: isAuthoritativeRejection(code) ? "FAILED" : "UNKNOWN", message: text };
}
function refresh(id?: string) { revalidatePath("/admin/inventory"); revalidatePath("/admin/inventory/transfers"); if (id) revalidatePath(`/admin/inventory/transfers/${id}`); }
export async function createWarehouseTransferAction(form: FormData): Promise<CommandOutcome> {
 const parsed = z.object({ fromWarehouseId: z.guid(), toWarehouseId: z.guid(), materialId: z.guid(), quantity, reason, operationId: z.guid() }).safeParse(Object.fromEntries(form));
 if (!parsed.success) return { status: "FAILED", message: "Chọn hai kho khác nhau, vật tư và lượng có tối đa 6 chữ số thập phân." };
 const access = await requireInternalPermission("inventory.reserve"); const changed = await checkSavedCommandFieldsAction(form, "create_warehouse_transfer"); if (changed) return changed;
 const db = await createServerSupabase(); const { data, error } = await db.rpc("create_warehouse_transfer", { target_branch_id: access.branchId,
  from_warehouse_id: parsed.data.fromWarehouseId, to_warehouse_id: parsed.data.toWarehouseId, target_material_id: parsed.data.materialId,
  planned_base_quantity: parsed.data.quantity, transfer_reason: parsed.data.reason, operation_id: parsed.data.operationId });
 if (error || !data) return failure(error?.message, error?.code);
 refresh(); return { status: "SUCCESS", resultId: String(data), message: "Đã mở phiếu chuyển kho. Xuất và nhận thực tế ghi riêng theo từng đợt." };
}
export async function recordWarehouseTransferAction(form: FormData): Promise<CommandOutcome> {
 const parsed = z.object({ transferId: z.guid(), kind: z.enum(["DISPATCH", "RECEIVE", "REPORT_SHORTAGE", "APPROVE_LOSS", "CLOSE_DISPATCH"]),
  dispatchId: z.union([z.guid(), z.literal("")]), issueId: z.union([z.guid(), z.literal("")]), quantity, reason,
  version: z.coerce.number().int().positive(), operationId: z.guid() }).safeParse(Object.fromEntries(form));
 if (!parsed.success) return { status: "FAILED", message: "Lượng, lý do và nguồn chuyển kho chưa hợp lệ." };
 const permission = parsed.data.kind === "APPROVE_LOSS" ? "inventory.adjust" : ["DISPATCH", "CLOSE_DISPATCH"].includes(parsed.data.kind) ? "inventory.reserve" : "inventory.receive";
 const access = await requireInternalPermission(permission); const changed = await checkSavedCommandFieldsAction(form, "record_warehouse_transfer_event"); if (changed) return changed;
 const db = await createServerSupabase(); const { data: source, error: readError } = await db.from("warehouse_transfer_read").select("id").eq("id", parsed.data.transferId).eq("branch_id", access.branchId).maybeSingle();
 if (readError || !source) return { status: "FAILED", message: "Phiếu chuyển kho không thuộc chi nhánh đang chọn." };
 const { data, error } = await db.rpc("record_warehouse_transfer_event", { target_transfer_id: parsed.data.transferId, event_kind: parsed.data.kind,
  source_dispatch_id: parsed.data.dispatchId || null, source_issue_id: parsed.data.issueId || null, actual_base_quantity: parsed.data.quantity,
  event_reason: parsed.data.reason, expected_version: parsed.data.version, operation_id: parsed.data.operationId });
 if (error || !data) return failure(error?.message, error?.code);
 refresh(parsed.data.transferId); return { status: "SUCCESS", resultId: String(data), message: "Đã ghi thao tác chuyển kho theo nguồn. Lượng và giá trị đang chuyển được giữ đến khi xử lý xong." };
}
