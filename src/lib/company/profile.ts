import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Company details printed on documents (owner decision D10). Stored in one company_profile row; until the owner fills
 * it in, documents keep the former fixed heading.
 */
export const COMPANY_FIELDS = ["legal_name", "tax_code", "address", "phone", "email", "bank_name", "bank_account_number", "bank_account_holder"] as const;
export type CompanyField = (typeof COMPANY_FIELDS)[number];
export type CompanyProfile = Record<CompanyField, string | null> & { version: number };
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg"] as const;
export type LogoMime = (typeof LOGO_MIME_TYPES)[number];
/** Largest logo file accepted (save_company_logo enforces the same limit). */
export const LOGO_MAX_BYTES = 300 * 1024;
export type CompanyLogo = { mime: LogoMime; base64: string; sha256: string };

/** PNG signature or JPEG start-of-image marker, so a renamed file is refused before reaching the database. */
export function logoMatchesType(mime: LogoMime, bytes: Uint8Array) {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], jpeg = [0xff, 0xd8, 0xff];
  return (mime === "image/png" ? png : jpeg).every((byte, index) => bytes[index] === byte);
}
/** The printed heading: company name, up to three short lines and the logo when one is set. */
export type CompanyHeading = { name: string; lines: string[]; logo?: { mime: LogoMime; bytes: Uint8Array } };

export const FALLBACK_COMPANY_NAME = "Hiền Xa ERP";

export async function loadCompanyProfile(supabase: SupabaseClient): Promise<CompanyProfile | null> {
  const { data, error } = await supabase.from("company_profile").select(`${COMPANY_FIELDS.join(", ")}, version`).maybeSingle();
  // A missing or unreadable profile must not block a document; it prints the fallback heading.
  if (error || !data) return null;
  return data as unknown as CompanyProfile;
}

export async function loadCompanyLogo(supabase: SupabaseClient): Promise<CompanyLogo | null> {
  const { data, error } = await supabase.from("company_profile").select("logo_mime, logo_base64, logo_sha256").maybeSingle();
  const row = data as { logo_mime: LogoMime | null; logo_base64: string | null; logo_sha256: string | null } | null;
  if (error || !row?.logo_mime || !row.logo_base64 || !row.logo_sha256) return null;
  return { mime: row.logo_mime, base64: row.logo_base64, sha256: row.logo_sha256 };
}

/** Heading for a PDF in one read: profile and logo. A missing or unreadable profile prints the fallback heading. */
export async function loadCompanyDocumentHeading(supabase: SupabaseClient): Promise<CompanyHeading> {
  const { data, error } = await supabase.from("company_profile").select(`${COMPANY_FIELDS.join(", ")}, version, logo_mime, logo_base64, logo_sha256`).maybeSingle();
  if (error || !data) return companyHeading(null);
  const row = data as unknown as CompanyProfile & { logo_mime: LogoMime | null; logo_base64: string | null; logo_sha256: string | null };
  return companyHeading(row, row.logo_mime && row.logo_base64 && row.logo_sha256 ? { mime: row.logo_mime, base64: row.logo_base64, sha256: row.logo_sha256 } : null);
}

export function companyHeading(profile: CompanyProfile | null, logo: CompanyLogo | null = null): CompanyHeading {
  if (!profile?.legal_name) return { name: FALLBACK_COMPANY_NAME, lines: [] };
  const contact = [profile.tax_code && `MST: ${profile.tax_code}`, profile.phone && `ĐT: ${profile.phone}`, profile.email].filter(Boolean).join(" · ");
  const bank = profile.bank_account_number
    ? [`STK: ${profile.bank_account_number}`, profile.bank_name, profile.bank_account_holder && `Chủ TK: ${profile.bank_account_holder}`].filter(Boolean).join(" · ")
    : "";
  return { name: profile.legal_name, lines: [profile.address ?? "", contact, bank].filter((line) => line.trim()),
    ...(logo ? { logo: { mime: logo.mime, bytes: Uint8Array.from(atob(logo.base64), (char) => char.charCodeAt(0)) } } : {}) };
}
