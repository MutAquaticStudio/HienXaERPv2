import "server-only";

import type { createServerSupabase } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;

/** D56 "Giao hàng hôm nay": the day's slips by where they stand (cancelled ones are not counted). */
export type DeliveryDay = { waiting: number; assigned: number; onTheWay: number; done: number; total: number };
const DELIVERY_BUCKET: Record<string, keyof Omit<DeliveryDay, "total"> | undefined> = {
  PLANNED: "waiting", ASSIGNED: "assigned", DISPATCHED: "onTheWay", ARRIVED: "onTheWay", RESULT_SUBMITTED: "done", VERIFIED: "done",
};
export function deliveryDay(states: string[]): DeliveryDay {
  const day: DeliveryDay = { waiting: 0, assigned: 0, onTheWay: 0, done: 0, total: 0 };
  for (const state of states) {
    const bucket = DELIVERY_BUCKET[state];
    if (!bucket) continue;
    day[bucket] += 1;
    day.total += 1;
  }
  return day;
}

/** D56 "Doanh thu theo nhóm hàng": delivered sales by material group, largest first; past `top` groups fold into "Khác". */
export type GroupSales = { name: string; amountVnd: bigint; share: number };
export function salesByGroup(rows: { code: string; amount_vnd: string }[], groupOfCode: Map<string, string>, top = 5): GroupSales[] {
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    const name = groupOfCode.get(row.code) ?? "Chưa phân nhóm";
    totals.set(name, (totals.get(name) ?? 0n) + BigInt(row.amount_vnd));
  }
  const sorted = [...totals].filter(([, amount]) => amount > 0n).sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : a[0].localeCompare(b[0], "vi")));
  const kept = sorted.slice(0, top);
  const rest = sorted.slice(top).reduce((sum, [, amount]) => sum + amount, 0n);
  if (rest > 0n) kept.push(["Khác", rest]);
  const total = kept.reduce((sum, [, amount]) => sum + amount, 0n);
  return kept.map(([name, amountVnd]) => ({ name, amountVnd, share: total > 0n ? Number((amountVnd * 1000n) / total) / 10 : 0 }));
}

/** D56 "Khách đang nợ": what customers owe by how late it is (report_center CUSTOMER_DEBT), and who owes most. */
export type DebtAging = { totalVnd: bigint; notDueVnd: bigint; late30Vnd: bigint; late60Vnd: bigint; late90Vnd: bigint; customers: number;
  top: { name: string; code: string; totalVnd: bigint; lateVnd: bigint }[] };
type DebtRow = { label: string; code: string; total_vnd: string; not_due_vnd: string; d30_vnd: string; d60_vnd: string; d90_vnd: string };
export function debtAging(rows: DebtRow[], top = 3): DebtAging {
  const sum = (key: keyof DebtRow) => rows.reduce((total, row) => total + BigInt(row[key] || "0"), 0n);
  return {
    totalVnd: sum("total_vnd"), notDueVnd: sum("not_due_vnd"), late30Vnd: sum("d30_vnd"), late60Vnd: sum("d60_vnd"), late90Vnd: sum("d90_vnd"),
    customers: rows.length,
    top: rows.slice(0, top).map((row) => ({ name: row.label, code: row.code, totalVnd: BigInt(row.total_vnd),
      lateVnd: BigInt(row.d30_vnd || "0") + BigInt(row.d60_vnd || "0") + BigInt(row.d90_vnd || "0") })),
  };
}

/** "12%" up / down against the previous period of the same length; null when it cannot be said (no base). */
export function changeAgainst(current: bigint | null, previous: bigint | null): { percent: number; up: boolean } | null {
  if (current === null || previous === null || previous <= 0n) return null;
  const percent = Math.round(Number(((current - previous) * 1000n) / previous) / 10);
  return { percent: Math.abs(percent), up: current >= previous };
}

const dayBefore = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const businessDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(date);

export async function loadDeliveryDay(supabase: Supabase, branchId: string, now = new Date()): Promise<DeliveryDay | null> {
  const today = businessDay(now);
  const next = new Date(Date.parse(`${today}T00:00:00+07:00`) + 86_400_000).toISOString();
  const { data, error } = await supabase.from("deliveries").select("execution_state").eq("branch_id", branchId)
    .gte("scheduled_at", `${today}T00:00:00+07:00`).lt("scheduled_at", next).limit(2000);
  return error ? null : deliveryDay(((data ?? []) as { execution_state: string }[]).map((row) => row.execution_state));
}

/** `to` is the dashboard's exclusive end date; report_center takes an inclusive one. */
export async function loadSalesByGroup(supabase: Supabase, branchId: string, from: string, to: string): Promise<GroupSales[] | null> {
  const { data, error } = await supabase.rpc("report_center", { target_branch_id: branchId, report_key: "GOODS_SALES", from_date: from, to_date: dayBefore(to) });
  if (error || !data) return null;
  const rows = ((data as { rows?: { code: string; amount_vnd: string }[] }).rows ?? []);
  if (!rows.length) return [];
  const { data: materials, error: materialError } = await supabase.from("materials").select("code, material_groups(name)").in("code", [...new Set(rows.map((row) => row.code))]);
  if (materialError) return null;
  const groupOfCode = new Map(((materials ?? []) as unknown as { code: string; material_groups: { name: string } | { name: string }[] | null }[])
    .map((row) => [row.code, (Array.isArray(row.material_groups) ? row.material_groups[0]?.name : row.material_groups?.name) ?? "Chưa phân nhóm"]));
  return salesByGroup(rows, groupOfCode);
}

export async function loadDebtAging(supabase: Supabase, branchId: string, now = new Date()): Promise<DebtAging | null> {
  const today = businessDay(now);
  const { data, error } = await supabase.rpc("report_center", { target_branch_id: branchId, report_key: "CUSTOMER_DEBT", from_date: today, to_date: today });
  if (error || !data) return null;
  return debtAging(((data as { rows?: DebtRow[] }).rows ?? []));
}

/** Money in each active cash / bank account now (cashbook_period_summary from the first day to now). */
export async function loadAccountBalances(supabase: Supabase, branchId: string, now = new Date()): Promise<{ id: string; name: string; kind: string; balanceVnd: bigint }[] | null> {
  const { data: accounts, error } = await supabase.from("finance_accounts").select("id, name, account_kind").eq("branch_id", branchId).eq("active", true).order("code").limit(8);
  if (error) return null;
  const results = await Promise.all(((accounts ?? []) as { id: string; name: string; account_kind: string }[]).map(async (account) => {
    const { data: summary, error: summaryError } = await supabase.rpc("cashbook_period_summary", { target_branch_id: branchId,
      from_at: "2000-01-01T00:00:00+07:00", to_at: now.toISOString(), target_account_id: account.id });
    if (summaryError || !summary) return null;
    return { id: account.id, name: account.name, kind: account.account_kind, balanceVnd: BigInt(String((summary as { closing_vnd: string }).closing_vnd ?? "0")) };
  }));
  return results.some((row) => row === null) ? null : results as { id: string; name: string; kind: string; balanceVnd: bigint }[];
}
