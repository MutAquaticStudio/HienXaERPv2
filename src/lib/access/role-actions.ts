"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { isAuthoritativeRejection } from "@/lib/core/command-outcome";
import { createServerSupabase } from "@/lib/supabase/server";

export type RoleSaveResult = { status: "SUCCESS" | "FAILED" | "UNKNOWN"; message: string; roleId?: string };

const schema = z.object({
  operationId: z.guid(),
  roleId: z.guid().nullable(),
  name: z.string().trim().min(2).max(100),
  permissions: z.array(z.string().regex(/^[a-z_]+(?:\.[a-z_]+)+$/)).max(200),
  /** The role's permissions as the editor read them, so a concurrent change is not overwritten. */
  expected: z.array(z.string()).nullable(),
  active: z.boolean(),
});

function roleMessage(value?: string) {
  if (value?.includes("owner_only_permission")) return "Quyền quản lý nhân viên & phân quyền chỉ dành cho chủ doanh nghiệp, không gán vào vai trò.";
  if (value?.includes("role_exceeds_actor_permissions")) return "Không thể gán quyền mà chính bạn không có.";
  if (value?.includes("role_not_editable")) return "Vai trò mẫu và vai trò quản trị chỉ xem, không sửa được.";
  if (value?.includes("role_name_taken")) return "Đã có vai trò cùng tên. Hãy đặt tên khác.";
  if (value?.includes("role_permissions_required")) return "Chọn ít nhất một quyền cho vai trò.";
  if (value?.includes("role_in_use")) return "Vai trò đang được gán cho nhân viên. Đổi vai trò của họ trước khi ngừng dùng.";
  if (value?.includes("role_changed")) return "Vai trò vừa được sửa ở nơi khác. Hãy tải lại trang.";
  if (value?.includes("unknown_permission")) return "Có quyền không còn trong danh mục. Hãy tải lại trang.";
  if (value?.includes("operation_payload_conflict")) return "Mã thao tác đã được dùng với dữ liệu khác. Hãy tải lại.";
  if (value?.includes("forbidden")) return "Chỉ chủ doanh nghiệp được tạo hoặc sửa vai trò.";
  return "Không thể lưu vai trò. Không có thay đổi nào được ghi.";
}

/** "Tạo vai trò" / "Sửa vai trò" (owner decision D12): save_custom_role guards every rule; this only shapes the request. */
export async function saveCustomRoleAction(input: unknown): Promise<RoleSaveResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { status: "FAILED", message: "Nhập tên vai trò (2–100 ký tự) và chọn quyền hợp lệ." };
  const data = parsed.data;
  const access = await requireInternalPermission("roles.manage");
  const supabase = await createServerSupabase();
  try {
    const { data: roleId, error } = await supabase.rpc("save_custom_role", {
      target_branch_id: access.branchId, target_role_id: data.roleId, role_name: data.name, permission_codes: data.permissions,
      expected_permission_codes: data.expected, role_active: data.active, operation_id: data.operationId,
    });
    // PGRST202: the database does not have save_custom_role yet (migration 20261017120000 not applied); nothing was written.
    if (error?.code === "PGRST202") return { status: "FAILED", message: "Máy chủ chưa bật chức năng vai trò tùy biến. Liên hệ người quản trị hệ thống; vai trò mẫu vẫn dùng bình thường." };
    if (error) return isAuthoritativeRejection(error.code) ? { status: "FAILED", message: roleMessage(error.message) } : { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra." };
    revalidatePath("/admin/access");
    return { status: "SUCCESS", roleId: String(roleId), message: data.roleId ? (data.active ? "Đã lưu vai trò. Quyền mới áp dụng ngay cho người đang dùng." : "Đã ngừng dùng vai trò.") : "Đã tạo vai trò. Có thể gán cho nhân viên ở tab Nhân viên." };
  } catch {
    return { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra." };
  }
}
