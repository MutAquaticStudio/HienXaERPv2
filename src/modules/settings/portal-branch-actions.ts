"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { isAuthoritativeRejection } from "@/lib/core/command-outcome";
import { createServerSupabase } from "@/lib/supabase/server";

export type PortalBranchResult = { status: "SUCCESS" | "FAILED" | "UNKNOWN"; message: string };

const schema = z.object({ branchId: z.guid(), operationId: z.guid() });

function portalBranchMessage(value?: string) {
  if (value?.includes("company_profile_missing")) return "Lưu thông tin doanh nghiệp trước, rồi chọn chi nhánh nhận khách.";
  if (value?.includes("branch_inactive")) return "Chi nhánh này đã ngừng hoạt động. Chọn chi nhánh khác.";
  if (value?.includes("forbidden")) return "Bạn cần quyền quản trị ở chi nhánh được chọn.";
  return "Chưa lưu được chi nhánh nhận khách. Không có thay đổi nào được ghi.";
}

/** D58 "Chi nhánh nhận khách tự đăng ký": set_portal_branch checks the right on that branch and records who changed it. */
export async function setPortalBranchAction(input: unknown): Promise<PortalBranchResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { status: "FAILED", message: "Chọn một chi nhánh." };
  await requireInternalPermission("roles.manage");
  const supabase = await createServerSupabase();
  try {
    const { error } = await supabase.rpc("set_portal_branch", { target_branch_id: parsed.data.branchId, operation_id: parsed.data.operationId });
    if (error) return isAuthoritativeRejection(error.code) ? { status: "FAILED", message: portalBranchMessage(error.message) }
      : { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lưu lại để kiểm tra." };
    revalidatePath("/admin/settings");
    return { status: "SUCCESS", message: "Đã lưu. Khách tự đăng ký từ bây giờ vào chi nhánh này." };
  } catch {
    return { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lưu lại để kiểm tra." };
  }
}
