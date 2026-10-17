import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DeliveryProgress } from "./delivery-progress";

afterEach(cleanup);

it("marks finished steps, the current step and what comes next", () => {
  render(<DeliveryProgress state="DISPATCHED" />);
  const steps = screen.getAllByRole("listitem");
  expect(steps.map((step) => step.className)).toEqual(["done", "done", "current", "", "", ""]);
  expect(steps[2]).toHaveAttribute("aria-current", "step");
  expect(screen.getByText(/báo tới nơi giao/)).toBeInTheDocument();
});

it("shows a cancelled delivery without steps", () => {
  render(<DeliveryProgress state="CANCELLED" />);
  expect(screen.getByRole("status")).toHaveTextContent("Phiếu giao đã hủy.");
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});
