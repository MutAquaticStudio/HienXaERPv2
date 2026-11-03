import { createServerSupabase } from "@/lib/supabase/server";
import { pdfResponse } from "@/lib/pdf/standard-document";
import { loadCompanyDocumentHeading } from "@/lib/company/profile";
import { createPrintDocument } from "@/lib/pdf/print-document";
import { paymentPrint, type PaymentPrint, type PaymentPrintAllocation } from "@/lib/pdf/print-builders";
import { debtSourceNames, type DebtRow } from "@/lib/pdf/print-data";

type Payment = PaymentPrint & { id: string; branch_id: string; customer_id: string | null };
type Allocation = { id: string; receivable_obligation_id: string | null; payable_obligation_id: string | null; amount_delta_vnd: string; reversal_of_allocation_id: string | null };

/** D52: Phiếu thu / Phiếu chi on A5 landscape, or an 80 mm receipt with "?kho=k80"; each allocation names its document. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Cần đăng nhập.", { status: 401 });
  const paper = new URL(request.url).searchParams.get("kho") === "k80" ? "K80" : "A5";
  const [paymentResult, allocationResult] = await Promise.all([
    supabase.from("payment_read").select("id, branch_id, customer_id, payment_number, direction, counterparty_name, account_name, account_code, account_kind, amount_vnd::text, advance_amount_vnd::text, method, external_reference, effective_at, posting_state, reversal_of_payment_id").eq("id", id).maybeSingle(),
    supabase.from("payment_allocations").select("id, receivable_obligation_id, payable_obligation_id, amount_delta_vnd::text, reversal_of_allocation_id").eq("payment_id", id).order("allocated_at"),
  ]);
  if (!paymentResult.data || allocationResult.error) return new Response("Không tìm thấy giao dịch tiền.", { status: 404 });
  const payment = paymentResult.data as unknown as Payment;
  // What each allocation paid, net of allocations moved later (a reversal carries the opposite amount).
  const net = new Map<string, bigint>();
  for (const row of (allocationResult.data ?? []) as Allocation[]) {
    const key = row.receivable_obligation_id ? `r:${row.receivable_obligation_id}` : `p:${row.payable_obligation_id}`;
    net.set(key, (net.get(key) ?? 0n) + BigInt(row.amount_delta_vnd));
  }
  const receivableIds = [...net].filter(([key, amount]) => key.startsWith("r:") && amount > 0n).map(([key]) => key.slice(2));
  const payableIds = [...net].filter(([key, amount]) => key.startsWith("p:") && amount > 0n).map(([key]) => key.slice(2));
  const [receivables, payables, customer, openDebts, company] = await Promise.all([
    receivableIds.length ? supabase.from("receivable_read").select("id, sales_order_id, delivery_id, service_job_id, source_label, due_date").in("id", receivableIds) : Promise.resolve({ data: [] }),
    payableIds.length ? supabase.from("payable_read").select("id, source_label, due_date, purchase_order_id").in("id", payableIds) : Promise.resolve({ data: [] }),
    payment.customer_id ? supabase.from("customers").select("code").eq("id", payment.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    payment.customer_id && payment.direction === "RECEIPT"
      ? supabase.from("receivable_read").select("outstanding_amount_vnd::text").eq("branch_id", payment.branch_id).eq("customer_id", payment.customer_id).gt("outstanding_amount_vnd", 0).limit(1000)
      : Promise.resolve({ data: null }),
    loadCompanyDocumentHeading(supabase),
  ]);
  const receivableRows = (receivables.data ?? []) as unknown as Pick<DebtRow, "id" | "sales_order_id" | "delivery_id" | "service_job_id" | "source_label" | "due_date">[];
  const names = await debtSourceNames(supabase, receivableRows);
  const payableRows = (payables.data ?? []) as { id: string; source_label: string; due_date: string; purchase_order_id: string | null }[];
  const purchaseIds = [...new Set(payableRows.flatMap((row) => row.purchase_order_id ? [row.purchase_order_id] : []))];
  const purchases = purchaseIds.length ? await supabase.from("purchase_order_read").select("id, purchase_order_number").in("id", purchaseIds) : { data: [] };
  const purchaseNumber = new Map(((purchases.data ?? []) as { id: string; purchase_order_number: string }[]).map((row) => [row.id, row.purchase_order_number]));
  const allocations: PaymentPrintAllocation[] = [
    ...receivableRows.map((row) => ({ label: names.get(row.id) ?? row.source_label, due_date: row.due_date, amount_vnd: String(net.get(`r:${row.id}`) ?? 0n) })),
    ...payableRows.map((row) => ({ label: [row.source_label, row.purchase_order_id && purchaseNumber.get(row.purchase_order_id) ? `Đơn mua ${purchaseNumber.get(row.purchase_order_id)}` : null].filter(Boolean).join(" · "),
      due_date: row.due_date, amount_vnd: String(net.get(`p:${row.id}`) ?? 0n) })),
  ];
  const outstanding = openDebts.data ? ((openDebts.data ?? []) as { outstanding_amount_vnd: string }[]).reduce((sum, row) => sum + BigInt(row.outstanding_amount_vnd), 0n).toString() : null;
  const bytes = await createPrintDocument(paymentPrint({ paper, company, printedAt: new Date().toISOString(), payment, allocations,
    customerCode: (customer.data as { code: string } | null)?.code ?? null, outstandingVnd: outstanding }));
  return pdfResponse(bytes, `${payment.payment_number}${paper === "K80" ? "-k80" : ""}.pdf`);
}
