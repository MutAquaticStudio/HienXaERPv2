// FB15 (D37): finding the customer, site, goods and unit a line of the Excel file means. People type codes, names
// without accents or a phone number; a match is taken only when it is the one record meant, otherwise the line says
// which records it could be.
import { normalizeRef } from "./order-import";

export type MatchHow = "code" | "phone" | "name";
export type Match<T> = { found: T; how: MatchHow } | { found: null; candidates: T[] };

const digits = (value: string) => value.replace(/\D/g, "");
/** Phone numbers compare on their last 9 digits, so "0901 234 567", "+84901234567" and an Excel number 901234567 match. */
const samePhone = (left: string, right: string) => { const a = digits(left), b = digits(right); return a.length >= 9 && b.length >= 9 && a.slice(-9) === b.slice(-9); };

export function matchRecord<T>(rows: readonly T[], ref: string, keys: { code(row: T): string; name(row: T): string; phone?(row: T): string | null | undefined }): Match<T> {
  const wanted = normalizeRef(ref);
  if (!wanted) return { found: null, candidates: [] };
  const byCode = rows.filter((row) => normalizeRef(keys.code(row)) === wanted);
  if (byCode.length === 1) return { found: byCode[0], how: "code" };
  if (keys.phone && /^\+?[\d\s.()-]{9,}$/.test(ref.trim())) {
    const byPhone = rows.filter((row) => samePhone(keys.phone!(row) ?? "", ref));
    if (byPhone.length === 1) return { found: byPhone[0], how: "phone" };
    if (byPhone.length > 1) return { found: null, candidates: byPhone };
  }
  const byName = rows.filter((row) => normalizeRef(keys.name(row)) === wanted);
  if (byName.length === 1) return { found: byName[0], how: "name" };
  if (byName.length > 1) return { found: null, candidates: byName };
  const containing = wanted.length >= 3 ? rows.filter((row) => normalizeRef(keys.name(row)).includes(wanted)) : [];
  if (containing.length === 1) return { found: containing[0], how: "name" };
  return { found: null, candidates: containing.slice(0, 5) };
}
