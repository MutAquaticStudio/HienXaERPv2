import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { companyHeading, loadCompanyDocumentHeading, loadCompanyLogo, loadCompanyProfile, logoMatchesType, type CompanyProfile } from "@/lib/company/profile";
import { logoBytes, PNG_LOGO_BASE64 } from "@/test/logo-fixtures";

const profile: CompanyProfile = {
  legal_name: "Công ty TNHH Hiền Xa", tax_code: "0101234567", address: "Thôn Đông, Hà Nội", phone: "0912 345 678", email: null,
  bank_name: "Vietcombank", bank_account_number: "0011001234567", bank_account_holder: "CONG TY HIEN XA", version: 2,
};
const reader = (result: { data: unknown; error: unknown }) => ({ from: () => ({ select: () => ({ maybeSingle: async () => result }) }) }) as unknown as SupabaseClient;

describe("company heading", () => {
  it("prints name, address, contact and bank lines, skipping blanks", () => {
    expect(companyHeading(profile)).toEqual({
      name: "Công ty TNHH Hiền Xa",
      lines: ["Thôn Đông, Hà Nội", "MST: 0101234567 · ĐT: 0912 345 678", "STK: 0011001234567 · Vietcombank · Chủ TK: CONG TY HIEN XA"],
    });
    expect(companyHeading({ ...profile, address: null, bank_account_number: null, tax_code: null })).toEqual({ name: "Công ty TNHH Hiền Xa", lines: ["ĐT: 0912 345 678"] });
  });

  it("keeps the former heading until the owner fills the profile in", async () => {
    expect(companyHeading(null)).toEqual({ name: "Hiền Xa ERP", lines: [] });
    expect(await loadCompanyProfile(reader({ data: null, error: null }))).toBeNull();
    expect(await loadCompanyProfile(reader({ data: null, error: { message: "network" } }))).toBeNull();
    expect(await loadCompanyProfile(reader({ data: profile, error: null }))).toEqual(profile);
  });
});

describe("company logo", () => {
  it("reads the logo with the heading for documents, and nothing when it is missing or unreadable", async () => {
    const logo = { logo_mime: "image/png", logo_base64: PNG_LOGO_BASE64, logo_sha256: "c".repeat(64) };
    const heading = await loadCompanyDocumentHeading(reader({ data: { ...profile, ...logo }, error: null }));
    expect(heading.name).toBe("Công ty TNHH Hiền Xa");
    expect(heading.logo?.mime).toBe("image/png");
    expect(heading.logo?.bytes).toEqual(logoBytes(PNG_LOGO_BASE64));
    expect((await loadCompanyDocumentHeading(reader({ data: profile, error: null }))).logo).toBeUndefined();
    expect(await loadCompanyDocumentHeading(reader({ data: null, error: { message: "network" } }))).toEqual({ name: "Hiền Xa ERP", lines: [] });
    expect(await loadCompanyLogo(reader({ data: logo, error: null }))).toEqual({ mime: "image/png", base64: PNG_LOGO_BASE64, sha256: "c".repeat(64) });
    expect(await loadCompanyLogo(reader({ data: { logo_mime: null, logo_base64: null, logo_sha256: null }, error: null }))).toBeNull();
  });

  it("recognises PNG and JPEG by their first bytes", () => {
    expect(logoMatchesType("image/png", logoBytes(PNG_LOGO_BASE64))).toBe(true);
    expect(logoMatchesType("image/jpeg", logoBytes(PNG_LOGO_BASE64))).toBe(false);
    expect(logoMatchesType("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
  });
});
