import { expect, it } from "vitest";
import { inventoryCommandMessage } from "./errors";

it("explains a receipt / supplier delivery for a cancelled sales order in Vietnamese (D95)", () => {
  const message = inventoryCommandMessage("purchase_linked_sales_order_cancelled");
  expect(message).toContain("Đơn bán của đơn mua này đã hủy");
  expect(message).not.toContain("purchase_");
});
