"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { isAuthoritativeRejection } from "@/lib/core/command-outcome";
import { createServerSupabase } from "@/lib/supabase/server";

export type PurchaseBookResult = { success: boolean; message: string; count?: number; outcomeUnknown?: boolean };

const priceItem = z.object({
  supplierId: z.guid(), materialId: z.guid(), uomId: z.guid(), costVnd: z.string().regex(/^[1-9]\d{0,18}$/),
  supersedesId: z.guid().optional(), expectedVersion: z.number().int().positive().optional(),
}).refine((item) => Boolean(item.supersedesId) === Boolean(item.expectedVersion) && BigInt(item.costVnd) <= 9223372036854775807n);
const bookInput = z.object({
  operationId: z.guid(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(priceItem).min(1).max(500),
});

const assignmentItem = z.object({ supplierId: z.guid(), materialId: z.guid(), uomId: z.guid().optional(), active: z.boolean() })
  .refine((item) => !item.active || Boolean(item.uomId));
const assignmentInput = z.object({ operationId: z.guid(), items: z.array(assignmentItem).min(1).max(200) });

function businessToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function bookError(message: string, code?: string) {
  if (code === "42501" || message.includes("forbidden") || message.includes("supplier_outside_branch")) return "Bạn không có quyền nhập giá mua ở chi nhánh này, hoặc nhà cung cấp đã ngừng.";
  if (message.includes("operation_payload_conflict")) return "Lần lưu trước chưa rõ kết quả và nội dung đã thay đổi. Hãy tải lại bảng giá rồi nhập lại.";
  if (message.includes("stale_price_rule") || message.includes("active_rule_exists")) return "Giá của một số dòng vừa được người khác thay đổi. Tải lại bảng giá; chưa có giá nào được lưu.";
  if (message.includes("material_or_uom_invalid")) return "Có vật tư đã ngừng mua hoặc đơn vị mua không còn dùng. Tải lại bảng giá; chưa có giá nào được lưu.";
  if (message.includes("too_many_price_items")) return "Mỗi lần lưu tối đa 500 dòng.";
  if (message.includes("invalid_price")) return "Có giá chưa hợp lệ (phải là số nguyên dương). Chưa có giá nào được lưu.";
  return "Không thể lưu bảng giá mua. Chưa có giá nào được lưu.";
}

function revalidateBooks() {
  revalidatePath("/admin/suppliers/pricing");
  revalidatePath("/admin/suppliers/pricing/history");
  revalidatePath("/admin/products");
}

/**
 * D61 "Lưu bảng giá mua": every changed price of the book for one day, all or nothing (save_purchase_price_book, which
 * saves each through save_purchase_price_rule). An unclear outcome keeps the same operation, so pressing again only checks.
 */
export async function savePurchasePriceBookAction(input: unknown): Promise<PurchaseBookResult> {
  const parsed = bookInput.safeParse(input);
  if (!parsed.success) return { success: false, message: "Bảng giá có dòng chưa hợp lệ. Kiểm tra giá mới (số nguyên dương)." };
  if (parsed.data.effectiveDate < businessToday()) return { success: false, message: "Ngày áp dụng không được trước hôm nay." };
  const access = await requireInternalPermission("purchasing.price.manage");
  const supabase = await createServerSupabase();
  try {
    const { data, error } = await supabase.rpc("save_purchase_price_book", {
      target_branch_id: access.branchId,
      items: parsed.data.items.map((item) => ({ supplier_id: item.supplierId, material_id: item.materialId, purchase_uom_id: item.uomId, unit_cost_vnd: item.costVnd,
        ...(item.supersedesId ? { supersedes_id: item.supersedesId, expected_version: item.expectedVersion } : {}) })),
      effective_from: `${parsed.data.effectiveDate}T00:00:00+07:00`,
      change_reason: "Cập nhật bảng giá mua",
      operation_id: parsed.data.operationId,
    });
    if (error) return isAuthoritativeRejection(error.code) ? { success: false, message: bookError(error.message, error.code) }
      : { success: false, outcomeUnknown: true, message: "Chưa xác định kết quả lưu. Giữ nguyên nội dung và bấm Lưu lại; hệ thống không lưu trùng." };
    revalidateBooks();
    const count = Number((data as { count?: number } | null)?.count ?? parsed.data.items.length);
    return { success: true, count, message: `Đã lưu ${count} giá mua. Đơn mua đã tạo giữ nguyên giá cũ.` };
  } catch {
    return { success: false, outcomeUnknown: true, message: "Chưa xác định kết quả lưu. Giữ nguyên nội dung và bấm Lưu lại; hệ thống không lưu trùng." };
  }
}

/** D61 "Gán vật tư" / "Nhà cung cấp" of a material: assign (with the purchase unit) or unassign; prices are kept. */
export async function setSupplierMaterialsAction(input: unknown): Promise<PurchaseBookResult> {
  const parsed = assignmentInput.safeParse(input);
  if (!parsed.success) return { success: false, message: "Chọn vật tư, nhà cung cấp và đơn vị mua." };
  const access = await requireInternalPermission("purchasing.price.manage");
  const supabase = await createServerSupabase();
  try {
    const { error } = await supabase.rpc("set_supplier_material_assignments", {
      target_branch_id: access.branchId,
      items: parsed.data.items.map((item) => ({ supplier_id: item.supplierId, material_id: item.materialId, active: item.active, ...(item.uomId ? { purchase_uom_id: item.uomId } : {}) })),
      operation_id: parsed.data.operationId,
    });
    if (error) {
      if (!isAuthoritativeRejection(error.code)) return { success: false, outcomeUnknown: true, message: "Chưa xác định kết quả. Bấm lưu lại; hệ thống không ghi trùng." };
      if (error.message.includes("material_or_uom_invalid")) return { success: false, message: "Vật tư đã ngừng mua hoặc đơn vị mua không thuộc vật tư này." };
      if (error.message.includes("duplicate_assignment")) return { success: false, message: "Một nhà cung cấp được chọn hai lần cho cùng vật tư." };
      return { success: false, message: bookError(error.message, error.code) };
    }
    revalidateBooks();
    revalidatePath(`/admin/products/${parsed.data.items[0].materialId}`);
    const on = parsed.data.items.filter((item) => item.active).length, off = parsed.data.items.length - on;
    const text = [on && `đã gán ${on}`, off && `bỏ gán ${off}`].filter(Boolean).join(", ");
    return { success: true, count: parsed.data.items.length, message: `${text.charAt(0).toUpperCase()}${text.slice(1)}.` };
  } catch {
    return { success: false, outcomeUnknown: true, message: "Chưa xác định kết quả. Bấm lưu lại; hệ thống không ghi trùng." };
  }
}

const quickAssignInput = z.object({ operationId: z.guid(), supplierId: z.guid(), materialIds: z.array(z.guid()).min(1).max(200) });
export type QuickAssignResult = { status: "SUCCESS" | "PARTIAL" | "FAILED"; message: string; changed: number; unchanged: number; failed: { code: string; reason: string }[]; outcomeUnknown?: boolean };

/**
 * D61 "Gán nhà cung cấp" on the material list: one supplier for every chosen material. Each is bought in the unit other
 * suppliers of that material already use (else its base unit); one already assigned to this supplier keeps its unit; a
 * material that is stopped or not bought is skipped and named. Prices are entered later in Giá mua.
 */
export async function assignSupplierToMaterialsAction(input: unknown): Promise<QuickAssignResult> {
  const parsed = quickAssignInput.safeParse(input);
  if (!parsed.success) return { status: "FAILED", message: "Chọn nhà cung cấp và tối đa 200 vật tư.", changed: 0, unchanged: 0, failed: [] };
  const access = await requireInternalPermission("purchasing.price.manage");
  const supabase = await createServerSupabase();
  const ids = [...new Set(parsed.data.materialIds)];
  const [materialResult, assignmentResult, supplierResult] = await Promise.all([
    supabase.from("materials").select("id, code, active, purchase_enabled, base_uom_id").in("id", ids).limit(200),
    supabase.from("supplier_materials").select("supplier_id, material_id, purchase_uom_id").eq("branch_id", access.branchId).eq("active", true).in("material_id", ids).limit(5000),
    supabase.from("suppliers").select("id, name").eq("id", parsed.data.supplierId).eq("branch_id", access.branchId).eq("active", true).maybeSingle(),
  ]);
  if (materialResult.error || assignmentResult.error || supplierResult.error) return { status: "FAILED", outcomeUnknown: true, message: "Không tải được vật tư. Thử lại.", changed: 0, unchanged: 0, failed: [] };
  const supplier = supplierResult.data as { id: string; name: string } | null;
  if (!supplier) return { status: "FAILED", message: "Nhà cung cấp đã ngừng hoặc không thuộc chi nhánh này.", changed: 0, unchanged: 0, failed: [] };
  const materials = (materialResult.data ?? []) as { id: string; code: string; active: boolean; purchase_enabled: boolean; base_uom_id: string }[];
  const assignments = (assignmentResult.data ?? []) as { supplier_id: string; material_id: string; purchase_uom_id: string }[];
  const failed = materials.filter((row) => !row.active || !row.purchase_enabled).map((row) => ({ code: row.code, reason: row.active ? "không cho phép mua" : "đã ngừng dùng" }));
  const eligible = materials.filter((row) => row.active && row.purchase_enabled);
  const already = eligible.filter((row) => assignments.some((item) => item.material_id === row.id && item.supplier_id === supplier.id));
  const items = eligible.filter((row) => !already.includes(row)).map((row) => {
    const counts = new Map<string, number>();
    for (const item of assignments) if (item.material_id === row.id) counts.set(item.purchase_uom_id, (counts.get(item.purchase_uom_id) ?? 0) + 1);
    const usual = [...counts].sort((left, right) => right[1] - left[1])[0]?.[0];
    return { supplier_id: supplier.id, material_id: row.id, purchase_uom_id: usual ?? row.base_uom_id, active: true };
  });
  const summary = (changed: number) => [changed ? `Đã gán ${changed} vật tư cho ${supplier.name}.` : `Không có vật tư mới để gán cho ${supplier.name}.`,
    already.length ? `${already.length} vật tư đã gán từ trước.` : "", failed.length ? `${failed.length} vật tư bỏ qua.` : ""].filter(Boolean).join(" ");
  if (!items.length) return { status: failed.length ? "PARTIAL" : "SUCCESS", message: summary(0), changed: 0, unchanged: already.length, failed };
  try {
    const { error } = await supabase.rpc("set_supplier_material_assignments", { target_branch_id: access.branchId, items, operation_id: parsed.data.operationId });
    if (error) {
      if (!isAuthoritativeRejection(error.code)) return { status: "FAILED", outcomeUnknown: true, message: "Chưa xác định kết quả. Bấm Xác nhận lại; hệ thống không ghi trùng.", changed: 0, unchanged: 0, failed: [] };
      const message = error.message.includes("material_or_uom_invalid") ? "Có vật tư vừa ngừng mua hoặc đổi đơn vị. Tải lại trang rồi gán lại; chưa có vật tư nào được gán." : bookError(error.message, error.code);
      return { status: "FAILED", message, changed: 0, unchanged: 0, failed: [] };
    }
  } catch {
    return { status: "FAILED", outcomeUnknown: true, message: "Chưa xác định kết quả. Bấm Xác nhận lại; hệ thống không ghi trùng.", changed: 0, unchanged: 0, failed: [] };
  }
  revalidateBooks();
  return { status: failed.length ? "PARTIAL" : "SUCCESS", message: summary(items.length), changed: items.length, unchanged: already.length, failed };
}
