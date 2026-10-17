"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { isAuthoritativeRejection } from "@/lib/core/command-outcome";
import { createServerSupabase } from "@/lib/supabase/server";

export type CompanySaveResult = { status: "SUCCESS" | "FAILED" | "UNKNOWN"; message: string; version?: number };

const text = (max: number) => z.string().trim().max(max);
const schema = z.object({
  operationId: z.uuid(),
  /** The version shown in the form, or null before the first save; a concurrent edit is refused, not overwritten. */
  expectedVersion: z.number().int().positive().nullable(),
  profile: z.object({
    legal_name: z.string().trim().min(2).max(200),
    tax_code: z.string().trim().regex(/^(?:[0-9]{10}(?:-[0-9]{3})?)?$/),
    address: text(300),
    phone: z.string().trim().regex(/^(?:.{6,30})?$/),
    email: z.union([z.literal(""), z.email().max(200)]),
    bank_name: text(120),
    bank_account_number: z.string().trim().regex(/^(?:[0-9A-Za-z.-]{4,40})?$/),
    bank_account_holder: text(120),
  }),
});

function companyMessage(value?: string) {
  if (value?.includes("company_profile_changed")) return "Thông tin doanh nghiệp vừa được sửa ở nơi khác. Hãy tải lại trang rồi nhập lại.";
  if (value?.includes("company_name_required")) return "Nhập tên doanh nghiệp.";
  if (value?.includes("operation_payload_conflict")) return "Mã thao tác đã được dùng với dữ liệu khác. Hãy tải lại.";
  if (value?.includes("forbidden")) return "Chỉ chủ doanh nghiệp được sửa thông tin doanh nghiệp.";
  if (value?.includes("company_profile_")) return "Một thông tin chưa đúng định dạng. Kiểm tra mã số thuế, email và số tài khoản.";
  return "Không thể lưu thông tin doanh nghiệp. Không có thay đổi nào được ghi.";
}

/** "Lưu thông tin doanh nghiệp" (owner decision D10): save_company_profile guards permission, format and version. */
export async function saveCompanyProfileAction(input: unknown): Promise<CompanySaveResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { status: "FAILED", message: "Kiểm tra lại: tên doanh nghiệp 2–200 ký tự, mã số thuế 10 hoặc 13 số (dạng 0101234567-001), email và số tài khoản hợp lệ." };
  const data = parsed.data;
  const access = await requireInternalPermission("roles.manage");
  const supabase = await createServerSupabase();
  try {
    const { data: version, error } = await supabase.rpc("save_company_profile", {
      target_branch_id: access.branchId, profile: data.profile, expected_version: data.expectedVersion, operation_id: data.operationId,
    });
    if (error) {
      // A format the database refuses (check constraint) is an authoritative rejection, like the named errors.
      if (error.code === "23514") return { status: "FAILED", message: companyMessage("company_profile_format") };
      return isAuthoritativeRejection(error.code) ? { status: "FAILED", message: companyMessage(error.message) } : { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra." };
    }
    revalidatePath("/admin/settings");
    return { status: "SUCCESS", version: Number(version), message: "Đã lưu. Chứng từ in từ bây giờ dùng thông tin này." };
  } catch {
    return { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra." };
  }
}
