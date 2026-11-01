import { z } from "zod";

/** D42: what the customer portal gets from portal_debt_payment_options — computed by the database at the moment of asking. */
export const debtPaymentOptionsSchema = z.object({
  /** D45: the debts are listed even without SePay (cash at the shop); the QR / bank fields only when this is true. */
  qr_enabled: z.boolean().default(true),
  bank_name: z.string().nullable(),
  account_number: z.string().nullable(),
  account_holder: z.string().nullable(),
  customer_code: z.string(),
  outstanding_amount_vnd: z.string().regex(/^\d+$/),
  all_note: z.string(),
  orders: z.array(z.object({
    key: z.string(),
    label: z.string(),
    outstanding_amount_vnd: z.string().regex(/^\d+$/),
    due_date: z.string().nullable(),
    note: z.string(),
  })),
});
export type DebtPaymentOptions = z.infer<typeof debtPaymentOptionsSchema>;

/** The key of the "Thanh toán tất cả" choice. */
export const ALL_DEBTS = "ALL";

/** Amount and transfer note for one choice (an order key, or ALL_DEBTS); null when that debt is already paid. */
export function paymentTarget(options: DebtPaymentOptions, key: string) {
  if (key === ALL_DEBTS) {
    return options.outstanding_amount_vnd === "0" ? null : { label: "Tất cả công nợ", amountVnd: options.outstanding_amount_vnd, note: options.all_note };
  }
  const order = options.orders.find((item) => item.key === key);
  return order ? { label: order.label, amountVnd: order.outstanding_amount_vnd, note: order.note } : null;
}

/**
 * VietQR image (SePay's vietqr.app): scanning it fills the bank, account, exact amount and note in any banking app.
 * `bank` is the bank's short name as typed in Sổ quỹ (Vietcombank, MBBank, ACB…).
 */
export function vietQrImageUrl(input: { bank: string; accountNumber: string; amountVnd: string; note: string; holder?: string }) {
  const url = new URL("https://vietqr.app/img");
  url.searchParams.set("acc", input.accountNumber);
  url.searchParams.set("bank", input.bank);
  url.searchParams.set("amount", input.amountVnd);
  url.searchParams.set("des", input.note);
  url.searchParams.set("template", "compact");
  if (input.holder) {
    url.searchParams.set("showinfo", "true");
    url.searchParams.set("holder", input.holder.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D"));
  }
  return url.toString();
}

/** D44: a payment request (several chosen debts, one QR) as returned by create_payment_request / payment_request_view. */
export const paymentRequestSchema = z.object({
  id: z.guid(),
  code: z.string().regex(/^YC[A-Z0-9]{5}$/),
  method: z.enum(["BANK_QR", "CASH"]).default("BANK_QR"),
  state: z.enum(["OPEN", "PARTIAL", "PAID", "CANCELLED"]),
  amount_vnd: z.string().regex(/^\d+$/),
  received_amount_vnd: z.string().regex(/^\d+$/),
  remaining_amount_vnd: z.string().regex(/^\d+$/),
  note: z.string(),
  created_via: z.enum(["PORTAL", "STAFF"]),
  created_at: z.string(),
  expires_at: z.string(),
  bank_name: z.string().nullable(),
  account_number: z.string().nullable(),
  account_holder: z.string().nullable(),
  lines: z.array(z.object({ label: z.string(), due_date: z.string().nullable(), amount_vnd: z.string().regex(/^\d+$/), outstanding_amount_vnd: z.string().regex(/^\d+$/) })),
});
export type PaymentRequest = z.infer<typeof paymentRequestSchema>;

/** Total still owed for the chosen debts (exact VND, as text), from the options the database gave. */
export function selectedTotal(options: Pick<DebtPaymentOptions, "orders">, keys: readonly string[]): string {
  const chosen = new Set(keys);
  return options.orders.filter((order) => chosen.has(order.key)).reduce((sum, order) => sum + BigInt(order.outstanding_amount_vnd), 0n).toString();
}

export const PAYMENT_REQUEST_STATE_LABEL: Record<PaymentRequest["state"], string> = {
  OPEN: "Chờ thanh toán", PARTIAL: "Đã trả một phần", PAID: "Đã thanh toán", CANCELLED: "Đã hủy",
};
