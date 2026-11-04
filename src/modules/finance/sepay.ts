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

// Pure helpers used by the browser live in payment-target.ts (no zod in the client bundle); re-exported here.
export { ALL_DEBTS, paymentTarget, vietQrImageUrl } from "./payment-target";

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

export { PAYMENT_REQUEST_STATE_LABEL, selectedTotal } from "./payment-target";
