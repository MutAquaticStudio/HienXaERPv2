"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

export type PriceBookResult = { success: boolean; message: string; count?: number; outcomeUnknown?: boolean };

const itemSchema = z.object({
  materialId: z.uuid(), uomId: z.uuid(), priceVnd: z.string().regex(/^[1-9]\d{0,18}$/),
  supersedesId: z.uuid().optional(), expectedVersion: z.number().int().positive().optional(),
  /** Customer price group code; absent for the general price book. */
  tierCode: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional(),
}).refine((item) => Boolean(item.supersedesId) === Boolean(item.expectedVersion) && BigInt(item.priceVnd) <= 9223372036854775807n);
const inputSchema = z.object({
  operationId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(itemSchema).min(1).max(500),
});

function businessToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function priceBookError(message: string, code?: string): string {
  if (code === "42501" || message.includes("forbidden")) return "Bạn không có quyền quản lý giá ở chi nhánh này.";
  if (message.includes("operation_payload_conflict")) return "Lần lưu trước chưa rõ kết quả và nội dung đã thay đổi. Hãy tải lại bảng giá rồi nhập lại.";
  if (message.includes("stale_price_rule") || message.includes("newer_price_version_exists") || message.includes("active_rule_exists")) return "Giá của một số vật tư vừa được người khác thay đổi. Tải lại bảng giá; chưa có giá nào được lưu.";
  if (message.includes("effective_date_before_previous")) return "Ngày áp dụng phải từ ngày bắt đầu của giá hiện tại trở đi. Chưa có giá nào được lưu.";
  if (message.includes("material_inactive")) return "Có vật tư đã ngừng bán. Tải lại bảng giá; chưa có giá nào được lưu.";
  if (message.includes("too_many_price_items")) return "Mỗi lần lưu tối đa 500 dòng.";
  if (message.includes("price_group_inactive")) return "Nhóm giá này đã ngừng dùng. Chọn bảng giá khác; chưa có giá nào được lưu.";
  return "Không thể lưu bảng giá. Chưa có giá nào được lưu.";
}

/** Saves many general prices at once; either every price is saved or none is (save_pricing_rules_batch). */
export async function savePriceBookAction(input: unknown): Promise<PriceBookResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues.some((issue) => issue.path[0] === "reason") ? "Cần lý do thay đổi từ 3 đến 500 ký tự." : "Bảng giá có dòng chưa hợp lệ. Kiểm tra giá mới (số nguyên dương)." };
  if (parsed.data.effectiveDate < businessToday()) return { success: false, message: "Ngày áp dụng không được trước hôm nay." };
  const access = await requireInternalPermission("pricing.manage");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("save_pricing_rules_batch", {
    target_branch_id: access.branchId,
    items: parsed.data.items.map((item) => ({ material_id: item.materialId, price_uom_id: item.uomId, unit_price_vnd: item.priceVnd,
      ...(item.tierCode ? { customer_tier_code: item.tierCode } : {}),
      ...(item.supersedesId ? { supersedes_id: item.supersedesId, expected_version: item.expectedVersion } : {}) })),
    effective_from: `${parsed.data.effectiveDate}T00:00:00+07:00`,
    change_reason: parsed.data.reason,
    operation_id: parsed.data.operationId,
  });
  if (error) return { success: false, message: priceBookError(error.message, error.code) };
  revalidatePath("/admin/products/pricing");
  revalidatePath("/admin/products");
  revalidatePath("/admin/settings/pricing");
  const count = Number((data as { count?: number } | null)?.count ?? parsed.data.items.length);
  return { success: true, count, message: `Đã lưu ${count} giá mới. Đơn đã chốt trước đó giữ nguyên giá cũ.` };
}
