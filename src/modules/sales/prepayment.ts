// FB5 (Owner 18/10): what the customer paid up front when the order is made, recorded as a receipt in the cash book
// (customer advance, post_payment) and tied to the order by its reference.
export const PREPAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CARD", "OTHER"] as const;
export type PrepaymentMethod = (typeof PREPAYMENT_METHODS)[number];
export const prepaymentMethodLabels: Record<PrepaymentMethod, string> = { CASH: "Tiền mặt", BANK_TRANSFER: "Chuyển khoản", CARD: "Thẻ", OTHER: "Khác" };
export type PrepaymentAccount = { id: string; name: string; kind: "CASH" | "BANK" };
/** Cash and bank accounts to receive into, and the moment the form was drawn (the receipt time, the same on a retry). */
export type PrepaymentOptions = { accounts: PrepaymentAccount[]; at: string };

/** The receipt reference that ties a prepayment to its order: payments carry no order link of their own. */
export const prepaymentReference = (orderNumber: string) => `Trả trước đơn ${orderNumber}`;

/** The account a method is received into by default: cash into a cash account, everything else into a bank account. */
export function defaultPrepaymentAccount(accounts: PrepaymentAccount[], method: PrepaymentMethod): PrepaymentAccount | undefined {
  const kind = method === "CASH" ? "CASH" : "BANK";
  return accounts.find((account) => account.kind === kind) ?? accounts[0];
}

export type PrepaymentReceipt = { id: string; payment_number: string; method: string | null; amount_vnd: string; posting_state: string; reversal_of_payment_id: string | null };

/** What the order page shows: the posted (not reversed) prepayment receipts, their total and what the customer still owes. */
export function prepaymentSummary(receipts: PrepaymentReceipt[], orderTotalVnd: string) {
  const posted = receipts.filter((receipt) => receipt.posting_state === "POSTED" && !receipt.reversal_of_payment_id);
  const paidVnd = posted.reduce((sum, receipt) => sum + BigInt(receipt.amount_vnd), 0n);
  const remainingVnd = BigInt(orderTotalVnd) - paidVnd;
  return {
    receipts: posted.map((receipt) => ({ id: receipt.id, number: receipt.payment_number,
      method: prepaymentMethodLabels[receipt.method as PrepaymentMethod] ?? null })),
    paidVnd,
    remainingVnd: remainingVnd > 0n ? remainingVnd : 0n,
  };
}
