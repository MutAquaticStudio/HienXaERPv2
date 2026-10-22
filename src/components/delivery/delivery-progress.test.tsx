import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DeliveryProgress } from "./delivery-progress";

afterEach(cleanup);

it("marks finished steps, the current step and what comes next", () => {
  render(<DeliveryProgress state="DISPATCHED" />);
  const steps = screen.getAllByRole("listitem");
  expect(steps.map((step) => step.textContent)).toEqual(["1Lập phiếu", "2Phân người & xe", "3Thợ lấy hàng lên xe", "4Thợ đã giao"]);
  expect(steps.map((step) => step.className)).toEqual(["done", "done", "current", ""]);
  expect(steps[2]).toHaveAttribute("aria-current", "step");
  expect(screen.getByText(/Thợ bấm “Đã giao” \(kèm ảnh\) là phiếu tự hoàn tất/)).toBeInTheDocument();
  expect(screen.queryByText(/Tới nơi/)).not.toBeInTheDocument();
});

it("shows a delivery the worker reported as finished", () => {
  render(<DeliveryProgress state="VERIFIED" />);
  expect(screen.getAllByRole("listitem").map((step) => step.className)).toEqual(["done", "done", "done", "done"]);
  expect(screen.getByText(/Đã hoàn tất/)).toBeInTheDocument();
});

it("shows a cancelled delivery without steps", () => {
  render(<DeliveryProgress state="CANCELLED" />);
  expect(screen.getByRole("status")).toHaveTextContent("Phiếu giao đã hủy.");
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});
