import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Company details printed on documents (owner decision D10). Stored in one company_profile row; until the owner fills
 * it in, documents keep the former fixed heading.
 */
export const COMPANY_FIELDS = ["legal_name", "tax_code", "address", "phone", "email", "bank_name", "bank_account_number", "bank_account_holder"] as const;
export type CompanyField = (typeof COMPANY_FIELDS)[number];
export type CompanyProfile = Record<CompanyField, string | null> & { version: number };
/** The printed heading: company name plus up to three short lines. */
export type CompanyHeading = { name: string; lines: string[] };

export const FALLBACK_COMPANY_NAME = "Hiền Xa ERP";

export async function loadCompanyProfile(supabase: SupabaseClient): Promise<CompanyProfile | null> {
  const { data, error } = await supabase.from("company_profile").select(`${COMPANY_FIELDS.join(", ")}, version`).maybeSingle();
  // A missing or unreadable profile must not block a document; it prints the fallback heading.
  if (error || !data) return null;
  return data as unknown as CompanyProfile;
}

export function companyHeading(profile: CompanyProfile | null): CompanyHeading {
  if (!profile?.legal_name) return { name: FALLBACK_COMPANY_NAME, lines: [] };
  const contact = [profile.tax_code && `MST: ${profile.tax_code}`, profile.phone && `ĐT: ${profile.phone}`, profile.email].filter(Boolean).join(" · ");
  const bank = profile.bank_account_number
    ? [`STK: ${profile.bank_account_number}`, profile.bank_name, profile.bank_account_holder && `Chủ TK: ${profile.bank_account_holder}`].filter(Boolean).join(" · ")
    : "";
  return { name: profile.legal_name, lines: [profile.address ?? "", contact, bank].filter((line) => line.trim()) };
}
