import { expect, it } from "vitest";
import { deleteBlockedNote } from "./delete-order";

it("warns up front when the order already has deliveries, but never hides the button", () => {
  expect(deleteBlockedNote("CONFIRMED", 2)).toContain("phiếu giao");
  expect(deleteBlockedNote("CANCELLED", 1)).toContain("phiếu giao");
});

it("warns for a closed order", () => {
  expect(deleteBlockedNote("CLOSED", 0)).toContain("đã đóng");
});

it.each(["DRAFT", "CONFIRMED", "CANCELLED"])("says nothing for a %s order without deliveries", (state) => {
  expect(deleteBlockedNote(state, 0)).toBeNull();
});
