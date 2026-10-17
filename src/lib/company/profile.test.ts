import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { companyHeading, loadCompanyProfile, type CompanyProfile } from "@/lib/company/profile";

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
