import { createServerSupabase } from "@/lib/supabase/server";
import { createStandardPdf, pdfResponse } from "@/lib/pdf/standard-document";

type Payment = { id: string; payment_number: string; direction: "RECEIPT" | "DISBURSEMENT"; counterparty_name: string; account_code: string; amount_vnd: string; allocated_amount_vnd: string; advance_amount_vnd: string; unallocated_amount_vnd: string; effective_at: string; posting_state: string; reconciliation_state: string; reversal_of_payment_id: string | null };
type Allocation = { id: string; receivable_obligation_id: string | null; payable_obligation_id: string | null; amount_delta_vnd: string; allocated_at: string };
const money = (value: string) => `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} VND`;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Cần đăng nhập.", { status: 401 });
  const [paymentResult, allocationResult] = await Promise.all([
    supabase.from("payment_read").select("id, payment_number, direction, counterparty_name, account_code, amount_vnd, allocated_amount_vnd, advance_amount_vnd, unallocated_amount_vnd, effective_at, posting_state, reconciliation_state, reversal_of_payment_id").eq("id", id).maybeSingle(),
    supabase.from("payment_allocations").select("id, receivable_obligation_id, payable_obligation_id, amount_delta_vnd, allocated_at").eq("payment_id", id).order("allocated_at"),
  ]);
  if (!paymentResult.data || allocationResult.error) return new Response("Không tìm thấy giao dịch tiền.", { status: 404 });
  const payment = paymentResult.data as Payment;
  const allocations = (allocationResult.data ?? []) as Allocation[];
  const generatedAt = new Date().toISOString();
  const title = payment.direction === "RECEIPT" ? "PHIẾU THU" : "PHIẾU CHI";
  const bytes = await createStandardPdf({
    title,
    reference: payment.payment_number,
    subtitle: `${payment.posting_state} / ${payment.reconciliation_state}`,
    fields: [
      { label: "Đối tác", value: payment.counterparty_name },
      { label: "Tài khoản", value: payment.account_code },
      { label: "Ngày hiệu lực", value: new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(payment.effective_at)) },
      { label: "Trạng thái", value: `${payment.posting_state}${payment.reversal_of_payment_id ? " - giao dịch đảo" : ""}` },
    ],
    columns: [
      { label: "Nguồn phân bổ", key: "source", width: 236 },
      { label: "Thời điểm", key: "time", width: 150 },
      { label: "Số tiền", key: "amount", width: 125, align: "right" },
    ],
    rows: allocations.map((allocation) => ({ source: allocation.receivable_obligation_id ? `AR ${allocation.receivable_obligation_id}` : allocation.payable_obligation_id ? `AP ${allocation.payable_obligation_id}` : "Chưa gắn nghĩa vụ", time: new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(allocation.allocated_at)), amount: money(allocation.amount_delta_vnd) })),
    totals: [
      { label: "Tổng giao dịch", value: money(payment.amount_vnd) },
      { label: "Đã phân bổ", value: money(payment.allocated_amount_vnd) },
      { label: "Ứng trước", value: money(payment.advance_amount_vnd) },
      { label: "Chưa phân bổ", value: money(payment.unallocated_amount_vnd) },
    ],
    trace: `Source payment_id=${payment.id}; generated_at=${generatedAt}; posting_state=${payment.posting_state}`,
    disclaimer: `${title.charAt(0)}${title.slice(1).toLowerCase()} - chứng từ tiền, không phải hóa đơn thuế.`,
  });
  return pdfResponse(bytes, `${payment.payment_number}-${payment.direction === "RECEIPT" ? "receipt" : "payment"}-voucher.pdf`);
}
