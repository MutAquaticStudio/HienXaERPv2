import { expect, it } from "vitest";
import { sameCommandFields } from "./command-fields";
const saved: Array<[string, string]> = [["operationId", "intent"], ["purchaseOrderLineId", "A"], ["quantity", "10"], ["purchaseOrderLineId", "B"], ["quantity", "20"]];
it("accepts transport grouping while preserving the original line and quantity arrays", () => {
  expect(sameCommandFields(saved, [["quantity", "10"], ["quantity", "20"], ["operationId", "intent"], ["purchaseOrderLineId", "A"], ["purchaseOrderLineId", "B"]])).toBe(true);
});
it("rejects changed quantities, swapped line pairing, missing values or a new intent", () => {
  expect(sameCommandFields(saved, [["operationId", "intent"], ["purchaseOrderLineId", "A"], ["purchaseOrderLineId", "B"], ["quantity", "20"], ["quantity", "10"]])).toBe(false);
  expect(sameCommandFields(saved, [["operationId", "intent"], ["purchaseOrderLineId", "B"], ["purchaseOrderLineId", "A"], ["quantity", "10"], ["quantity", "20"]])).toBe(false);
  expect(sameCommandFields(saved, saved.slice(0, -1))).toBe(false);
  expect(sameCommandFields(saved, [["operationId", "new"], ...saved.slice(1)])).toBe(false);
});
