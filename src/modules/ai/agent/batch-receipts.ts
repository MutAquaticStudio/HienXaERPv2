// D64 "Phiếu thu từ biên lai": the assistant reads transfer receipts (a photo, a bank statement as PDF / Excel) and prepares ONE card, a
// row per transfer: which customer it is, which debts it clears (oldest first, the rest as an advance) and whether the money looks
// already booked. A row that may already be booked is skipped with the receipt it matches, because nothing stops a second receipt for
// the same money. Each row posts its own payment with an operation id derived from the action.
import { z } from "zod";

import { matchRecord } from "@/modules/sales/order-match";
import { derivedOperationId, finishBatch, normalizeRef, parseVnd, rowFailureText, vnFormat } from "./batch-common";
import type { AgentAction, ListView } from "./registry";
import { findAccount, ResolveError } from "./resolve";

export const RECEIPT_BATCH_MAX = 50;
const DAY = 24 * 3600 * 1000;

type Customer = { id: string; code: string; display_name: string; phone: string | null };
type Debt = { id: string; customer_id: string; outstanding: string };
type PaidRow = { payment_number: string; customer_id: string; amount_vnd: string; effective_at: string; external_reference: string | null };
type BankRow = { amount_vnd: string; transaction_at: string; reference_code: string | null; content: string | null; state: string };

export type ReceiptRow = {
  n: number; label: string; customerId: string; amount: string; at: string | null; method: "CASH" | "BANK_TRANSFER"; reference: string;
  allocations: { obligation_id: string; amount_vnd: string }[]; advance: string; status: "CREATE" | "SKIP"; reason?: string;
};

const rowSchema = z.object({
  khach: z.string().trim().max(200).optional().default(""), so_tien: z.union([z.string(), z.number()]).optional(), ngay: z.string().trim().optional().default(""),
  gio: z.string().trim().optional().default(""), tham_chieu: z.string().trim().max(160).optional().default(""), phuong_thuc: z.enum(["CASH", "BANK_TRANSFER"]).optional().default("BANK_TRANSFER"),
});
const alnum = (value: string | null | undefined) => normalizeRef(value ?? "").replace(/[^a-z0-9]/g, "");

/** The instant of a receipt's date (and time, noon when none) in Vietnam time; null when blank, invalid or in the future. */
export function receiptInstant(date: string, time: string, now: number): { at: string | null; problem?: string } {
  if (!date) return { at: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return { at: null, problem: "Ngày giờ dạng yyyy-mm-dd và HH:MM" };
  const at = Date.parse(`${date}T${time || "12:00"}:00+07:00`);
  if (!Number.isFinite(at)) return { at: null, problem: "Ngày không hợp lệ" };
  if (at > now + 5 * 60 * 1000) return { at: null, problem: "Ngày trong tương lai" };
  return { at: new Date(at).toISOString() };
}

export type ReceiptInputs = { customers: Customer[]; debts: Debt[]; paid: PaidRow[]; bank: BankRow[]; now: number };

export function checkReceiptRows(input: readonly unknown[], data: ReceiptInputs): ReceiptRow[] {
  const left = new Map(data.debts.map((debt) => [debt.id, BigInt(debt.outstanding)]));
  const seen = new Set<string>();
  return input.map((raw, index): ReceiptRow => {
    const n = index + 1;
    const parsed = rowSchema.safeParse(raw ?? {});
    const value = parsed.success ? parsed.data : rowSchema.parse({});
    const blank: ReceiptRow = { n, label: value.khach || "—", customerId: "", amount: "", at: null, method: value.phuong_thuc, reference: value.tham_chieu, allocations: [], advance: "0", status: "SKIP" };
    const skip = (reason: string, patch: Partial<ReceiptRow> = {}): ReceiptRow => ({ ...blank, ...patch, status: "SKIP", reason });
    if (!parsed.success || !value.khach) return skip("Thiếu tên khách");
    const amount = parseVnd(parsed.data.so_tien);
    if (!amount) return skip("Số tiền chưa đúng");
    const match = matchRecord(data.customers, value.khach, { code: (row) => row.code, name: (row) => row.display_name, phone: (row) => row.phone });
    if (!match.found) return skip(match.candidates.length ? `Có nhiều khách khớp: ${match.candidates.slice(0, 4).map((row) => `${row.code} ${row.display_name}`).join("; ")}` : "Không tìm thấy khách này", { amount });
    const customer = match.found;
    const label = `${customer.display_name} (${customer.code})`;
    const when = receiptInstant(value.ngay, value.gio, data.now);
    if (when.problem) return skip(when.problem, { label, customerId: customer.id, amount });
    const patch = { label, customerId: customer.id, amount, at: when.at };
    const around = when.at ? Date.parse(when.at) : data.now;
    const near = (iso: string) => Math.abs(Date.parse(iso) - around) <= DAY * (when.at ? 1 : 3);
    const ref = alnum(value.tham_chieu);
    const booked = data.paid.find((row) => row.customer_id === customer.id && row.amount_vnd === amount && near(row.effective_at)
      && (!ref || !alnum(row.external_reference) || alnum(row.external_reference).includes(ref) || ref.includes(alnum(row.external_reference))));
    if (booked) return skip(`Có thể đã ghi: phiếu ${booked.payment_number} (cùng khách, số tiền, ngày)`, patch);
    const bank = data.bank.find((row) => row.amount_vnd === amount && near(row.transaction_at) && (!ref || alnum(row.reference_code).includes(ref) || ref.includes(alnum(row.reference_code)) || alnum(row.content).includes(ref) || !alnum(row.reference_code)));
    if (bank) return skip(bank.state === "NEEDS_REVIEW" ? "Tiền đã về ngân hàng, đang chờ xử lý ở Giao dịch chờ xử lý; ghép khách ở đó" : "Ngân hàng đã tự ghi khoản này (SePay)", patch);
    const key = `${customer.id}:${amount}:${when.at?.slice(0, 10) ?? ""}:${ref}`;
    if (seen.has(key)) return skip("Trùng một dòng khác trong danh sách", patch);
    seen.add(key);
    let remain = BigInt(amount);
    const allocations: ReceiptRow["allocations"] = [];
    for (const debt of data.debts.filter((item) => item.customer_id === customer.id)) {
      const open = left.get(debt.id) ?? 0n;
      if (remain <= 0n) break;
      if (open <= 0n) continue;
      const take = open < remain ? open : remain;
      allocations.push({ obligation_id: debt.id, amount_vnd: take.toString() });
      left.set(debt.id, open - take);
      remain -= take;
    }
    return { ...blank, ...patch, status: "CREATE", allocations, advance: remain.toString() };
  });
}

export const receiptsFromTransfers: AgentAction = {
  kind: "soan_thu_tien_tu_bien_lai", area: "Tài chính", permissions: ["finance.payment.post", "finance.ar.read"],
  description: `Soạn phiếu THU từ biên lai chuyển khoản / sao kê người dùng gửi (ảnh, PDF hoặc Excel), mỗi dòng một khoản tiền khách đã chuyển, tối đa ${RECEIPT_BATCH_MAX} dòng. `
    + "Đưa tên (hoặc mã / số điện thoại) khách theo nội dung chuyển khoản, số tiền số nguyên đồng, ngày giờ trên biên lai, mã giao dịch. Hệ thống trừ nợ cũ nhất trước, dư ghi trả trước, "
    + "và bỏ qua khoản có vẻ đã được ghi (cùng khách, số tiền, ngày hoặc ngân hàng đã tự ghi).",
  properties: {
    quy: { type: "string", description: "Mã hoặc tên quỹ / tài khoản nhận tiền; trống = quỹ đầu tiên." },
    dong: { type: "array", description: "Các khoản thu theo thứ tự trên biên lai.", items: { type: "object", additionalProperties: false, required: ["khach", "so_tien"], properties: {
      khach: { type: "string", description: "Tên, mã hoặc số điện thoại khách theo nội dung chuyển." }, so_tien: { type: "string", description: "Số tiền VND, số nguyên." },
      ngay: { type: "string", description: "Ngày trên biên lai yyyy-mm-dd; trống = bây giờ." }, gio: { type: "string", description: "HH:MM nếu có." },
      tham_chieu: { type: "string", description: "Mã giao dịch / nội dung chuyển khoản." }, phuong_thuc: { type: "string", enum: ["CASH", "BANK_TRANSFER"], description: "Mặc định BANK_TRANSFER." } } } },
  },
  async prepare(context, input) {
    const value = z.object({ quy: z.string().trim().optional().default(""), dong: z.array(z.unknown()).min(1).max(RECEIPT_BATCH_MAX) }).parse(input);
    const account = value.quy ? await findAccount(context.supabase, context.branchId, value.quy)
      : (await context.supabase.from("finance_accounts").select("id, code, name").eq("branch_id", context.branchId).eq("active", true).order("code").limit(1)).data?.[0];
    if (!account) throw new ResolveError("Chi nhánh chưa có quỹ / tài khoản.");
    const since = new Date(Date.now() - 45 * DAY).toISOString();
    const [customerResult, debtResult, paidResult, bankResult] = await Promise.all([
      context.supabase.from("customers").select("id, code, display_name, phone").eq("branch_id", context.branchId).eq("active", true).limit(5000),
      context.supabase.from("receivable_read").select("id, customer_id, outstanding_amount_vnd::text, due_date").eq("branch_id", context.branchId).gt("outstanding_amount_vnd", 0).order("due_date").limit(5000),
      context.supabase.from("payment_read").select("payment_number, customer_id, amount_vnd::text, effective_at, external_reference").eq("branch_id", context.branchId).eq("direction", "RECEIPT")
        .eq("posting_state", "POSTED").is("reversal_of_payment_id", null).gte("effective_at", since).limit(5000),
      context.supabase.from("bank_transactions").select("amount_vnd::text, transaction_at, reference_code, content, state").eq("branch_id", context.branchId).eq("transfer_type", "in")
        .in("state", ["POSTED", "NEEDS_REVIEW"]).gte("transaction_at", since).limit(5000),
    ]);
    if (customerResult.error || debtResult.error || paidResult.error) throw new ResolveError("Chưa đọc được khách, công nợ hoặc phiếu thu hiện có. Thử lại.");
    const debts = ((debtResult.data ?? []) as unknown as { id: string; customer_id: string; outstanding_amount_vnd: string }[]).map((row) => ({ id: row.id, customer_id: row.customer_id, outstanding: String(row.outstanding_amount_vnd) }));
    const rows = checkReceiptRows(value.dong, { customers: (customerResult.data ?? []) as Customer[], debts, now: Date.now(),
      paid: ((paidResult.data ?? []) as unknown as { payment_number: string; customer_id: string; amount_vnd: string | number; effective_at: string; external_reference: string | null }[]).map((row) => ({ ...row, amount_vnd: String(row.amount_vnd) })),
      // The bank feed is optional (not every shop uses it): when it cannot be read, only the receipts are compared.
      bank: bankResult.error ? [] : ((bankResult.data ?? []) as unknown as { amount_vnd: string | number; transaction_at: string; reference_code: string | null; content: string | null; state: string }[]).map((row) => ({ ...row, amount_vnd: String(row.amount_vnd) })) });
    const create = rows.filter((row) => row.status === "CREATE");
    if (!create.length) throw new ResolveError(`Không có khoản nào ghi được: ${rows.slice(0, 8).map((row) => `dòng ${row.n} ${row.reason}`).join("; ")}.`);
    const total = create.reduce((sum, row) => sum + BigInt(row.amount), 0n).toString();
    return { title: `Thu ${create.length} khoản · ${vnFormat(total)} ₫`, payload: { accountId: account.id, rows },
      summary: [{ label: "Vào quỹ", value: account.name }, { label: "Sẽ ghi", value: `${create.length} phiếu thu · ${vnFormat(total)} ₫` },
        ...(rows.length > create.length ? [{ label: "Bỏ qua", value: `${rows.length - create.length} dòng (có thể đã ghi hoặc không khớp khách)` }] : [])] };
  },
  view(payload): ListView | null {
    const rows = payload.rows as ReceiptRow[] | undefined;
    if (!rows) return null;
    return { columns: ["Khách hàng", "Số tiền", "Ngày", "Trừ nợ / trả trước"], verb: "ghi", noun: "phiếu thu", okLabel: "Ghi phiếu",
      rows: rows.map((row) => ({ n: row.n, status: row.status, ...(row.reason ? { reason: row.reason } : {}), cells: [row.label, row.amount ? `${vnFormat(row.amount)} ₫` : "—",
        row.at ? new Date(row.at).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "Bây giờ",
        row.status === "CREATE" ? `${row.allocations.length} khoản nợ${row.advance !== "0" ? ` · trả trước ${vnFormat(row.advance)} ₫` : ""}` : "—"] })) };
  },
  async execute(context, payload, actionId, options) {
    const rows = ((payload.rows ?? []) as ReceiptRow[]).filter((row) => row.status === "CREATE" && !options?.exclude?.includes(row.n));
    if (!rows.length) throw new ResolveError("Chưa chọn khoản nào để ghi.");
    const failed: string[] = [];
    let done = 0;
    for (const row of rows) {
      const { error } = await context.supabase.rpc("post_payment", { target_branch_id: context.branchId, direction: "RECEIPT", target_customer_id: row.customerId, target_supplier_id: null,
        target_account_id: payload.accountId, amount_vnd: row.amount, effective_at: row.at ?? new Date().toISOString(), method: row.method, external_reference: row.reference,
        allocation_lines: row.allocations, advance_amount_vnd: row.advance, operation_id: derivedOperationId(actionId, `row:${row.n}`) });
      if (error) failed.push(`dòng ${row.n} ${row.label} (${/payment_effects_exceed|outstanding|stale|version/i.test(error.message) ? "công nợ vừa thay đổi, soạn lại" : rowFailureText(error.message)})`); else done += 1;
    }
    return { link: "/admin/cashbook", message: finishBatch(done, rows.length, failed, "phiếu thu") };
  },
};

