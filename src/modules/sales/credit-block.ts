// FB8: a confirmation stopped by the customer's credit opens the credit popup on the order page (?credit=<kind>).
export type CreditBlock = "limit" | "no-limit" | "overdue";

export function creditBlockOf(message: string | undefined): CreditBlock | null {
  if (!message) return null;
  if (message.includes("credit_limit_exceeded")) return "limit";
  if (message.includes("credit_limit_not_approved")) return "no-limit";
  if (message.includes("overdue_receivable_blocks_credit")) return "overdue";
  return null;
}

export function parseCreditBlock(value: string | undefined): CreditBlock | null {
  return value === "limit" || value === "no-limit" || value === "overdue" ? value : null;
}

export function creditBlockText(block: CreditBlock): string {
  if (block === "no-limit") return "Khách hàng chưa có hạn mức tín dụng được duyệt, nên đơn chưa xác nhận được.";
  if (block === "overdue") return "Khách hàng đang có công nợ quá hạn, nên đơn chưa xác nhận được.";
  return "Công nợ của khách cộng giá trị đơn này vượt hạn mức tín dụng, nên đơn chưa xác nhận được.";
}
