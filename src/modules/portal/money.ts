import { formatVnd, vnd } from "@/lib/core/money";

function exact(value: string | number | null | undefined): string | null {
  if (value == null || (typeof value === "number" && !Number.isSafeInteger(value))) return null;
  const text = String(value);
  return /^-?\d+$/.test(text) ? text : null;
}

export function formatPortalMoney(value: string | number | null | undefined) {
  const text = exact(value);
  return text === null ? "Chưa xác định" : formatVnd(vnd(text));
}

export function sumPortalMoney(values: readonly (string | number | null | undefined)[]): string | null {
  let total = 0n;
  for (const value of values) {
    const text = exact(value);
    if (text === null) return null;
    total += BigInt(text);
  }
  return total.toString();
}
