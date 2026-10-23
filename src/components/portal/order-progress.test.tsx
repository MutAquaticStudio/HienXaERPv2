import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { OrderProgress } from "./order-progress";

afterEach(cleanup);

it("marks the step the customer's order is at, with the finished ones read as done (D29)", () => {
  render(<OrderProgress order={{ channel: "CUSTOMER_PORTAL", state: "CONFIRMED", fulfillment_state: "PARTIAL" }} />);
  const steps = within(screen.getByRole("list", { name: "Tiến trình đơn" })).getAllByRole("listitem");
  expect(steps.map((step) => step.textContent)).toEqual(["Đã đặt (xong)", "Cửa hàng duyệt (xong)", "Đang giao", "Hoàn tất"]);
  expect(steps[2]).toHaveAttribute("aria-current", "step");
  expect(steps.filter((step) => step.hasAttribute("aria-current"))).toHaveLength(1);
});

it("shows no progress for a cancelled order", () => {
  const { container } = render(<OrderProgress order={{ state: "CANCELLED" }} />);
  expect(container).toBeEmptyDOMElement();
});
