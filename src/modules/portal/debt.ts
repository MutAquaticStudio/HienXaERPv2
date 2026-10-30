import { formatBusinessDate } from "@/lib/core/business-time";

/** "Sắp tới hạn" on the customer's Công nợ: due within this many days. */
export const DUE_SOON_DAYS = 7;

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
const toBig = (value?: string | null) => (value && /^\d+$/.test(value) ? BigInt(value) : 0n);

export type DueTone = "overdue" | "soon" | "later";

/** How a debt's due date reads on the portal (concept "Khách · Công nợ"): overdue in red, soon in amber, else the date. */
export function dueStatus(dueDate: string | null | undefined, today: string): { tone: DueTone; label: string } {
  if (!dueDate) return { tone: "later", label: "Hạn chưa chốt" };
  const days = dayNumber(dueDate) - dayNumber(today);
  const date = formatBusinessDate(dueDate).slice(0, 5);
  if (days < 0) return { tone: "overdue", label: `Quá hạn ${-days} ngày · hạn ${date}` };
  if (days === 0) return { tone: "soon", label: `Đến hạn hôm nay · hạn ${date}` };
  if (days <= DUE_SOON_DAYS) return { tone: "soon", label: `Còn ${days} ngày · hạn ${date}` };
  return { tone: "later", label: `Hạn ${date}` };
}

/** Outstanding split into Trong hạn / Sắp tới hạn / Quá hạn (whole đồng as strings) for the summary bar. */
export function debtBuckets(items: ReadonlyArray<{ due_date?: string | null; outstanding_amount_vnd?: string | null }>, today: string) {
  const sums: Record<DueTone, bigint> = { later: 0n, soon: 0n, overdue: 0n };
  for (const item of items) sums[dueStatus(item.due_date, today).tone] += toBig(item.outstanding_amount_vnd);
  const total = sums.later + sums.soon + sums.overdue;
  const share = (value: bigint) => (total > 0n ? Number((value * 1000n) / total) / 10 : 0);
  return {
    total: String(total),
    later: { amount: String(sums.later), percent: share(sums.later) },
    soon: { amount: String(sums.soon), percent: share(sums.soon) },
    overdue: { amount: String(sums.overdue), percent: share(sums.overdue) },
  };
}
