import "server-only";

// D52: what the printed documents read besides the document itself — the bank account shown to customers (with the
// SePay transfer note prefix), its VietQR image, the customer's open debts and readable names for each debt's source.
// Every read runs with the person's own session (RLS); anything they may not read is simply left off the paper.
import type { createServerSupabase } from "@/lib/supabase/server";
import { vietQrImageUrl } from "@/modules/finance/sepay";

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;
export type ShownBank = { bankName: string; accountNumber: string; holder: string; prefix: string | null };
export type DebtRow = { id: string; sales_order_id: string | null; delivery_id: string | null; service_job_id: string | null; source_label: string;
  site_name: string | null; due_date: string; recorded_at: string; original_amount_vnd: string; outstanding_amount_vnd: string; state: string };

export async function loadShownBank(supabase: Supabase, branchId: string): Promise<ShownBank | null> {
  const { data, error } = await supabase.from("finance_accounts").select("bank_name, bank_account_number, bank_account_holder, bank_qr_note_prefix")
    .eq("branch_id", branchId).eq("shown_to_customers", true).eq("active", true).maybeSingle();
  if (error || !data?.bank_name || !data.bank_account_number) return null;
  return { bankName: data.bank_name, accountNumber: data.bank_account_number, holder: data.bank_account_holder ?? "", prefix: data.bank_qr_note_prefix ?? null };
}

/** The VietQR image (PNG / JPEG bytes) for an amount and note; null when the QR service does not answer in time. */
export async function loadVietQr(bank: ShownBank, amountVnd: string, note: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(vietQrImageUrl({ bank: bank.bankName, accountNumber: bank.accountNumber, amountVnd, note, holder: bank.holder || undefined }),
      { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length > 100 && bytes.length < 2_000_000 ? bytes : null;
  } catch {
    return null;
  }
}

/** The customer's debts still open (oldest due first); empty when the person may not read receivables. */
export async function loadOpenDebts(supabase: Supabase, branchId: string, customerId: string): Promise<DebtRow[] | null> {
  const { data, error } = await supabase.from("receivable_read")
    .select("id, sales_order_id, delivery_id, service_job_id, source_label, site_name, due_date, recorded_at, original_amount_vnd::text, outstanding_amount_vnd::text, state")
    .eq("branch_id", branchId).eq("customer_id", customerId).gt("outstanding_amount_vnd", 0).order("due_date").limit(500);
  if (error) return null;
  return (data ?? []) as unknown as DebtRow[];
}

/** "Giao hàng DL-041 · Đơn SO-2026-000080" for each debt (by receivable id), from the deliveries, orders and jobs it came from. */
export async function debtSourceNames(supabase: Supabase, rows: readonly Pick<DebtRow, "id" | "sales_order_id" | "delivery_id" | "service_job_id" | "source_label">[]) {
  const ids = (key: "sales_order_id" | "delivery_id" | "service_job_id") => [...new Set(rows.flatMap((row) => row[key] ? [row[key]!] : []))];
  const [orders, deliveries, jobs] = await Promise.all([
    ids("sales_order_id").length ? supabase.from("sales_order_read").select("id, order_number").in("id", ids("sales_order_id")) : Promise.resolve({ data: [] }),
    ids("delivery_id").length ? supabase.from("delivery_read").select("id, delivery_number").in("id", ids("delivery_id")) : Promise.resolve({ data: [] }),
    ids("service_job_id").length ? supabase.from("service_jobs").select("id, job_number").in("id", ids("service_job_id")) : Promise.resolve({ data: [] }),
  ]);
  const orderNumber = new Map(((orders.data ?? []) as { id: string; order_number: string }[]).map((row) => [row.id, row.order_number]));
  const deliveryNumber = new Map(((deliveries.data ?? []) as { id: string; delivery_number: string }[]).map((row) => [row.id, row.delivery_number]));
  const jobNumber = new Map(((jobs.data ?? []) as { id: string; job_number: string }[]).map((row) => [row.id, row.job_number]));
  return new Map(rows.map((row) => {
    if (row.delivery_id) {
      const parts = [`Giao hàng ${deliveryNumber.get(row.delivery_id) ?? ""}`.trim(), row.sales_order_id && orderNumber.get(row.sales_order_id) ? `Đơn ${orderNumber.get(row.sales_order_id)}` : null];
      return [row.id, parts.filter(Boolean).join(" · ")];
    }
    if (row.service_job_id) return [row.id, `Dịch vụ ${jobNumber.get(row.service_job_id) ?? ""}`.trim()];
    return [row.id, row.source_label === "Số dư đầu kỳ" ? "Nợ đầu kỳ" : row.source_label];
  }));
}
