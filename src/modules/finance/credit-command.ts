export const creditCommandNames = ["adjust_return_receivable", "refund_customer_credit", "offset_customer_credit", "reverse_customer_credit_offset"] as const;
export type CreditCommand = typeof creditCommandNames[number];
