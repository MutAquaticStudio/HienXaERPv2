import { expect, it } from "vitest";
import { deleteBlockedNote } from "./delete-order";

it("warns up front, naming the delivery, when a delivery already ran, but never hides the button", () => {
  const note = deleteBlockedNote("CONFIRMED", [{ number: "DL-2026-000001", state: "PLANNED" }, { number: "DL-2026-000002", state: "DISPATCHED" }]);
  expect(note).toContain("DL-2026-000002");
  expect(note).not.toContain("DL-2026-000001");
  expect(note).toContain("từ chối xóa");
  expect(note).toContain("trả hàng");
  for (const state of ["ARRIVED", "RESULT_SUBMITTED", "VERIFIED"]) expect(deleteBlockedNote("CONFIRMED", [{ number: "DL-9", state }])).toContain("từ chối xóa");
});

it("says the deliveries that never ran are deleted with the order (D90)", () => {
  const note = deleteBlockedNote("CONFIRMED", [{ number: "DL-2026-000001", state: "PLANNED" }, { number: "DL-2026-000002", state: "ASSIGNED" }, { number: "DL-2026-000003", state: "CANCELLED" }]);
  expect(note).toBe("Xóa đơn sẽ xóa luôn 3 phiếu giao chưa chạy (DL-2026-000001, DL-2026-000002, DL-2026-000003), cùng phần giữ hàng, phân công và việc của thợ trên các phiếu đó.");
  expect(note).not.toContain("từ chối");
});

it("warns for a closed order", () => {
  expect(deleteBlockedNote("CLOSED", [])).toContain("đã đóng");
});

it.each(["DRAFT", "CONFIRMED", "CANCELLED"])("says nothing for a %s order without deliveries", (state) => {
  expect(deleteBlockedNote(state, [])).toBeNull();
});
