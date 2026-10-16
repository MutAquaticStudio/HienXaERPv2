import { formatVnd, vnd } from "@/lib/core/money";

/** Value of the "Tổng tiền hàng" line; what is still missing for a price is shown under it by the form. */
export function DocumentTotalValue({ totalVnd, pending }: { totalVnd: string | null | undefined; pending: boolean }) {
  if (totalVnd) return <>{formatVnd(vnd(totalVnd))}</>;
  return <>{pending ? "Đang tính giá..." : "—"}</>;
}
