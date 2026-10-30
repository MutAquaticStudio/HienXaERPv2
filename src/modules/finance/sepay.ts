import { z } from "zod";

/** D42: what the customer portal gets from portal_debt_payment_options — computed by the database at the moment of asking. */
export const debtPaymentOptionsSchema = z.object({
  bank_name: z.string(),
  account_number: z.string(),
  account_holder: z.string(),
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
