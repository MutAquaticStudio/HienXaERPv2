"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { isAuthoritativeRejection } from "@/lib/core/command-outcome";
import { createServerSupabase } from "@/lib/supabase/server";
import { LOGO_MAX_BYTES, LOGO_MIME_TYPES, logoMatchesType } from "@/lib/company/profile";

export type CompanySaveResult = { status: "SUCCESS" | "FAILED" | "UNKNOWN"; message: string; version?: number };

const text = (max: number) => z.string().trim().max(max);
const schema = z.object({
  operationId: z.guid(),
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

export type CompanyLogoResult = { status: "SUCCESS" | "FAILED" | "UNKNOWN"; message: string; sha256?: string | null };

const logoSchema = z.object({
  operationId: z.guid(),
  /** The logo shown when the owner chose the file; replacing a logo changed elsewhere is refused. */
  expectedSha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  /** Both null removes the logo. */
  mime: z.enum(LOGO_MIME_TYPES).nullable(),
  base64: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(Math.ceil(LOGO_MAX_BYTES / 3) * 4).nullable(),
});

function logoMessage(value?: string) {
  if (value?.includes("company_logo_changed")) return "Logo vừa được đổi ở nơi khác. Hãy tải lại trang rồi chọn lại.";
  if (value?.includes("company_logo_too_large")) return "Logo tối đa 300 KB.";
  if (value?.includes("company_logo_invalid")) return "Tệp không phải ảnh PNG hoặc JPG hợp lệ.";
  if (value?.includes("company_name_required")) return "Lưu thông tin doanh nghiệp (tên doanh nghiệp) trước khi tải logo.";
  if (value?.includes("operation_payload_conflict")) return "Mã thao tác đã được dùng với dữ liệu khác. Hãy tải lại.";
  if (value?.includes("forbidden")) return "Chỉ chủ doanh nghiệp được đổi logo.";
  return "Không thể lưu logo. Không có thay đổi nào được ghi.";
}

/** "Lưu logo" / "Xóa logo": save_company_logo checks permission, file type, size and the logo last read. */
export async function saveCompanyLogoAction(input: unknown): Promise<CompanyLogoResult> {
  const parsed = logoSchema.safeParse(input);
  const data = parsed.success ? parsed.data : null;
  const bytes = data?.base64 ? Uint8Array.from(Buffer.from(data.base64, "base64")) : null;
  if (!data || (data.mime === null) !== (data.base64 === null) || (bytes && (bytes.length > LOGO_MAX_BYTES || !logoMatchesType(data.mime!, bytes)))) {
    return { status: "FAILED", message: "Chọn ảnh PNG hoặc JPG, tối đa 300 KB." };
  }
  const access = await requireInternalPermission("roles.manage");
  const supabase = await createServerSupabase();
  try {
    const { data: sha256, error } = await supabase.rpc("save_company_logo", {
      target_branch_id: access.branchId, logo_mime: data.mime, logo_base64: data.base64, expected_logo_sha256: data.expectedSha256, operation_id: data.operationId,
    });
    if (error) return isAuthoritativeRejection(error.code) ? { status: "FAILED", message: logoMessage(error.message) } : { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra." };
    revalidatePath("/admin/settings");
    return { status: "SUCCESS", sha256: (sha256 as string | null) ?? null, message: data.base64 ? "Đã lưu logo. Chứng từ in từ bây giờ có logo." : "Đã xóa logo." };
  } catch {
    return { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra." };
  }
}
