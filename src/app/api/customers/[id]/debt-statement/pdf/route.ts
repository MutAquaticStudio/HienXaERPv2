import { createServerSupabase } from "@/lib/supabase/server";
import { pdfResponse } from "@/lib/pdf/standard-document";
import { loadCompanyDocumentHeading } from "@/lib/company/profile";
import { createPrintDocument } from "@/lib/pdf/print-document";
import { debtStatementPrint } from "@/lib/pdf/print-builders";
import { debtSourceNames, loadShownBank, loadVietQr, type DebtRow } from "@/lib/pdf/print-data";
import { bankTransferNote } from "@/modules/finance/transfer-note";

type Obligation = { obligation_id: string; site_name: string | null; due_date: string; outstanding_amount_vnd: string };

function localDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** D52: Bảng đối chiếu công nợ (A4) — balances as of the chosen day, each debt named by its document, the QR to pay the total. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Cần đăng nhập.", { status: 401 });
  const requested = new URL(request.url).searchParams.get("asOf") ?? "";
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : localDate();
  const cutoff = new Date().toISOString();
  const customerResult = await supabase.from("customers").select("id, branch_id, code, display_name, phone, address_text").eq("id", id).maybeSingle();
  if (!customerResult.data) return new Response("Không tìm thấy khách hàng.", { status: 404 });
  const obligations: Obligation[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.rpc("finance_obligation_snapshot", {
      target_branch_id: customerResult.data.branch_id,
      target_side: "AR",
      as_of: `${asOf}T23:59:59.999+07:00`,
      knowledge_cutoff: cutoff,
      target_customer_id: id,
      target_site_id: null,
      target_sales_employee_id: null,
    }).select("obligation_id,site_name,due_date,outstanding_amount_vnd::text").gt("outstanding_amount_vnd", 0).order("due_date").order("obligation_id").range(offset, offset + pageSize - 1);
    if (error) return new Response("Không thể tạo bảng đối chiếu.", { status: 403 });
    const page = (data ?? []) as Obligation[];
    obligations.push(...page);
    if (page.length < pageSize) break;
  }
  const total = obligations.reduce((sum, row) => sum + BigInt(row.outstanding_amount_vnd), 0n);
  const branchId = customerResult.data.branch_id as string;
  const [sources, bank, company] = await Promise.all([
    obligations.length ? supabase.from("receivable_read").select("id, sales_order_id, delivery_id, service_job_id, source_label, recorded_at").in("id", obligations.map((row) => row.obligation_id).slice(0, 1000)) : Promise.resolve({ data: [] }),
    loadShownBank(supabase, branchId),
    loadCompanyDocumentHeading(supabase),
  ]);
  const sourceRows = (sources.data ?? []) as unknown as (Pick<DebtRow, "id" | "sales_order_id" | "delivery_id" | "service_job_id" | "source_label"> & { recorded_at: string })[];
  const names = await debtSourceNames(supabase, sourceRows);
  const recorded = new Map(sourceRows.map((row) => [row.id, row.recorded_at]));
  const customer = customerResult.data as { code: string; display_name: string; phone: string | null; address_text: string | null };
  const qrImage = bank && total > 0n ? await loadVietQr(bank, total.toString(), bankTransferNote(bank.prefix, null, customer.code)) : null;
  const bytes = await createPrintDocument(debtStatementPrint({ paper: "A4", company, printedAt: cutoff, customer, asOf, bank, qrImage,
    rows: obligations.map((row) => ({ label: names.get(row.obligation_id) ?? "Khoản công nợ", site_name: row.site_name, recorded_at: recorded.get(row.obligation_id) ?? null,
      due_date: row.due_date, outstanding_amount_vnd: row.outstanding_amount_vnd, overdue: row.due_date < asOf })) }));
  return pdfResponse(bytes, `doi-chieu-cong-no-${customer.code}-${asOf}.pdf`);
}
