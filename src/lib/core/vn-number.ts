import Decimal from "decimal.js";

/**
 * Reads numbers the way Vietnamese users type them: "," is the decimal mark and "." groups thousands
 * ("1.250,5" = 1250.5), while a lone "." that is not a thousands group still reads as a decimal ("1.5").
 * Returns the canonical dot-decimal string the commands expect, or null when the text is ambiguous or invalid.
 */
const GROUPED = (separator: "." | ",") => new RegExp(`^[1-9]\\d{0,2}(?:\\${separator}\\d{3})+$`);

function canonical(text: string, maxScale: number): string | null {
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const [, fraction = ""] = text.split(".");
  if (fraction.replace(/0+$/, "").length > maxScale) return null;
  return new Decimal(text).toFixed();
}

export function normalizeDecimalInput(raw: string, maxScale = 6): string | null {
  const text = raw.replace(/[\s ]/g, "");
  if (!text) return null;
  const dots = (text.match(/\./g) ?? []).length;
  const commas = (text.match(/,/g) ?? []).length;
  if (dots && commas) {
    const decimalMark = text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".";
    const grouping = decimalMark === "," ? "." : ",";
    const [whole, fraction, extra] = text.split(decimalMark);
    if (extra !== undefined || !GROUPED(grouping).test(whole) || !/^\d+$/.test(fraction ?? "")) return null;
    return canonical(`${whole.split(grouping).join("")}.${fraction}`, maxScale);
  }
  if (commas) {
    if (commas === 1) return canonical(text.replace(",", "."), maxScale);
    return GROUPED(",").test(text) ? canonical(text.split(",").join(""), maxScale) : null;
  }
  if (dots) {
    if (GROUPED(".").test(text)) return canonical(text.split(".").join(""), maxScale);
    return dots === 1 ? canonical(text, maxScale) : null;
  }
  return canonical(text, maxScale);
}

/** Whole-đồng amounts: "120.000", "120,000", "120 000 đ" and "120000" all read as 120000. */
export function normalizeVndInput(raw: string): string | null {
  const text = raw.replace(/[\s ]/g, "").replace(/(?:đ|₫|vnd)$/i, "");
  if (!text) return null;
  if (/^\d+$/.test(text)) return new Decimal(text).toFixed();
  for (const separator of [".", ","] as const) {
    if (GROUPED(separator).test(text)) return text.split(separator).join("");
  }
  return null;
}

/** Shows a canonical decimal with the Vietnamese decimal mark, without grouping, for editing. */
export function decimalForEditing(value: string): string {
  const text = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return text;
  return new Decimal(text).toFixed().replace(".", ",");
}
