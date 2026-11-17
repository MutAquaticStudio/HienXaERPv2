import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ closePurchaseOrderRemainingAction: vi.fn() }));
import { ClosePurchaseRemainingForm } from "./close-remaining-form";

afterEach(cleanup);
const props = { purchaseOrderId: "p1", state: "CONFIRMED", arrivals: 1, openLines: 1, canClose: true };

it("shows “Đóng phần còn lại” with a required reason for a purchase received in part (D95)", () => {
  render(<ClosePurchaseRemainingForm {...props} />);
  expect(screen.getByRole("button", { name: "Đóng phần còn lại" })).toBeInTheDocument();
  expect(screen.getByLabelText("Lý do")).toBeRequired();
});

it.each([
  ["nothing received yet", { arrivals: 0 }],
  ["everything received", { openLines: 0 }],
  ["a draft", { state: "DRAFT" }],
  ["no cancel permission", { canClose: false }],
])("is hidden for %s", (_, change) => {
  const { container } = render(<ClosePurchaseRemainingForm {...props} {...change} />);
  expect(container).toBeEmptyDOMElement();
});
