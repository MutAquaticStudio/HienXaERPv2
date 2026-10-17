import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));

import { saveCompanyLogoAction, saveCompanyProfileAction } from "./company-actions";
import { JPEG_LOGO_BASE64, PNG_LOGO_BASE64 } from "@/test/logo-fixtures";

const op = "11111111-1111-4111-8111-111111111111";
const profile = { legal_name: "Công ty TNHH Hiền Xa", tax_code: "0101234567-001", address: "Hà Nội", phone: "0912 345 678", email: "",
  bank_name: "Vietcombank", bank_account_number: "0011001234567", bank_account_holder: "CONG TY HIEN XA" };
beforeEach(() => { vi.clearAllMocks(); m.access.mockResolvedValue({ branchId: "b" }); m.rpc.mockResolvedValue({ data: 2, error: null }); });

it("saves the profile for the owner's branch against the version shown", async () => {
  expect(await saveCompanyProfileAction({ operationId: op, expectedVersion: 1, profile })).toMatchObject({ status: "SUCCESS", version: 2 });
  expect(m.access).toHaveBeenCalledWith("roles.manage");
  expect(m.rpc).toHaveBeenCalledWith("save_company_profile", { target_branch_id: "b", profile, expected_version: 1, operation_id: op });
});

it("refuses bad formats before calling the database and explains database refusals", async () => {
  for (const bad of [{ legal_name: "X" }, { tax_code: "12AB" }, { email: "khong-phai-email" }, { bank_account_number: "1 2" }]) {
    expect((await saveCompanyProfileAction({ operationId: op, expectedVersion: null, profile: { ...profile, ...bad } })).status).toBe("FAILED");
  }
  expect(m.rpc).not.toHaveBeenCalled();
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "company_profile_changed" } });
  expect((await saveCompanyProfileAction({ operationId: op, expectedVersion: 1, profile })).message).toContain("vừa được sửa ở nơi khác");
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "forbidden" } });
  expect((await saveCompanyProfileAction({ operationId: op, expectedVersion: 1, profile })).message).toContain("Chỉ chủ doanh nghiệp");
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "23514", message: "new row violates check constraint" } });
  expect((await saveCompanyProfileAction({ operationId: op, expectedVersion: 1, profile })).message).toContain("chưa đúng định dạng");
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: "fetch failed" } });
  expect((await saveCompanyProfileAction({ operationId: op, expectedVersion: 1, profile })).status).toBe("UNKNOWN");
});

it("saves or removes the logo against the one last read and refuses files that are not what they claim", async () => {
  const sha = "a".repeat(64);
  m.rpc.mockResolvedValueOnce({ data: "b".repeat(64), error: null });
  expect(await saveCompanyLogoAction({ operationId: op, expectedSha256: sha, mime: "image/png", base64: PNG_LOGO_BASE64 })).toMatchObject({ status: "SUCCESS", sha256: "b".repeat(64) });
  expect(m.rpc).toHaveBeenCalledWith("save_company_logo", { target_branch_id: "b", logo_mime: "image/png", logo_base64: PNG_LOGO_BASE64, expected_logo_sha256: sha, operation_id: op });
  m.rpc.mockResolvedValueOnce({ data: null, error: null });
  expect(await saveCompanyLogoAction({ operationId: op, expectedSha256: sha, mime: null, base64: null })).toMatchObject({ status: "SUCCESS", sha256: null, message: "Đã xóa logo." });
  m.rpc.mockClear();
  for (const bad of [{ mime: "image/jpeg", base64: PNG_LOGO_BASE64 }, { mime: "image/gif", base64: PNG_LOGO_BASE64 }, { mime: "image/png", base64: null }, { mime: "image/png", base64: "not base64!" }]) {
    expect((await saveCompanyLogoAction({ operationId: op, expectedSha256: null, ...bad })).status).toBe("FAILED");
  }
  expect(m.rpc).not.toHaveBeenCalled();
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "company_logo_changed" } });
  expect((await saveCompanyLogoAction({ operationId: op, expectedSha256: null, mime: "image/jpeg", base64: JPEG_LOGO_BASE64 })).message).toContain("đổi ở nơi khác");
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "company_name_required" } });
  expect((await saveCompanyLogoAction({ operationId: op, expectedSha256: null, mime: "image/jpeg", base64: JPEG_LOGO_BASE64 })).message).toContain("trước khi tải logo");
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: "fetch failed" } });
  expect((await saveCompanyLogoAction({ operationId: op, expectedSha256: null, mime: "image/jpeg", base64: JPEG_LOGO_BASE64 })).status).toBe("UNKNOWN");
});
