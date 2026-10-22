import { expect, it } from "vitest";
import { creditBlockOf, creditBlockText, parseCreditBlock } from "./credit-block";

it("recognises the credit refusals of confirm_sales_order", () => {
  expect(creditBlockOf("credit_limit_exceeded")).toBe("limit");
  expect(creditBlockOf("credit_limit_not_approved")).toBe("no-limit");
  expect(creditBlockOf("overdue_receivable_blocks_credit")).toBe("overdue");
  expect(creditBlockOf("sales_order_not_confirmable")).toBeNull();
  expect(creditBlockOf(undefined)).toBeNull();
  expect(parseCreditBlock("overdue")).toBe("overdue");
  expect(parseCreditBlock("<script>")).toBeNull();
  expect(creditBlockText("no-limit")).toContain("chưa có hạn mức");
});
