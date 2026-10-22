import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ServiceJobProgress, serviceNextText, serviceStep } from "./service-job-progress";

afterEach(cleanup);

it("follows the job from scheduling to verification", () => {
  expect(serviceStep("SCHEDULED", null)).toBe(0);
  expect(serviceStep("SCHEDULED", "AVAILABLE")).toBe(1);
  expect(serviceStep("SCHEDULED", "CLAIMED")).toBe(1);
  expect(serviceStep("IN_PROGRESS", "IN_PROGRESS")).toBe(2);
  expect(serviceStep("RESULT_SUBMITTED", "DONE")).toBe(3);
  expect(serviceStep("VERIFIED", "VERIFIED")).toBe(4);
  expect(serviceStep("CANCELLED", null)).toBe(-1);
  expect(serviceNextText({ state: "RESULT_SUBMITTED", workState: "DONE", operator: "Thợ 01", unit: "chuyến", actual: "5" }))
    .toBe("Thợ 01 báo 5 chuyến. Kiểm tra rồi bấm “Xác minh & ghi công nợ”.");
});

it("marks the current step", () => {
  render(<ServiceJobProgress state="IN_PROGRESS" workState="IN_PROGRESS" operator="Thợ 01" unit="giờ" actual={null} />);
  expect(screen.getByText("Đang làm").closest("li")).toHaveAttribute("aria-current", "step");
  expect(screen.getByText("Giao thợ").closest("li")).toHaveClass("done");
});
