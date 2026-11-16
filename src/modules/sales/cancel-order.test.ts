import { expect, it } from "vitest";
import { cancelOrderView } from "./cancel-order";

it("offers cancelling an order without deliveries, as before", () => {
  expect(cancelOrderView("DRAFT", [])).toEqual({ canCancel: true, note: null });
  expect(cancelOrderView("CONFIRMED", [])).toEqual({ canCancel: true, note: null });
});

it("offers cancelling when every delivery is unrun and names the ones cancelled with it (D94)", () => {
  const view = cancelOrderView("CONFIRMED", [
    { number: "DL-2026-000001", state: "PLANNED" }, { number: "DL-2026-000002", state: "ASSIGNED" }, { number: "DL-2026-000003", state: "CANCELLED" }]);
  expect(view.canCancel).toBe(true);
  expect(view.note).toContain("Hủy đơn sẽ hủy luôn 2 phiếu giao chưa chạy (DL-2026-000001, DL-2026-000002)");
  expect(view.note).not.toContain("DL-2026-000003");
  expect(view.note).toContain("Đã hủy");
});

it("needs no note when the only deliveries are already cancelled", () => {
  expect(cancelOrderView("CONFIRMED", [{ number: "DL-9", state: "CANCELLED" }])).toEqual({ canCancel: true, note: null });
});

it("hides the button and says why when a delivery ran", () => {
  for (const state of ["DISPATCHED", "ARRIVED", "RESULT_SUBMITTED", "VERIFIED"]) {
    const view = cancelOrderView("CONFIRMED", [{ number: "DL-1", state: "PLANNED" }, { number: "DL-2", state }]);
    expect(view.canCancel).toBe(false);
    expect(view.note).toContain("DL-2");
    expect(view.note).not.toContain("DL-1");
    expect(view.note).toContain("trả hàng");
    expect(view.note).toContain("Đóng phần còn lại");
  }
});

it.each(["CANCELLED", "CLOSED"])("offers nothing for a %s order", (state) => {
  expect(cancelOrderView(state, [{ number: "DL-1", state: "VERIFIED" }])).toEqual({ canCancel: false, note: null });
});
