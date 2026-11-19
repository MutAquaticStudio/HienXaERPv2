import { formatVnd, vnd } from "@/lib/core/money";

/** Short money for a dashboard figure: "68,4 triệu", "1,2 tỷ"; under a million the exact amount ("950.000 ₫"). */
export function shortVnd(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const scaled = (unit: bigint, name: string) => {
    const tenths = (abs * 10n + unit / 2n) / unit;
    const whole = tenths / 10n, rest = tenths % 10n;
    return `${sign}${whole.toLocaleString("vi-VN")}${rest ? `,${rest}` : ""} ${name}`;
  };
  if (abs >= 1_000_000_000n) return scaled(1_000_000_000n, "tỷ");
  if (abs >= 1_000_000n) return scaled(1_000_000n, "triệu");
  return formatVnd(vnd(value.toString()));
}
