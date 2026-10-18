import { afterEach, expect, it, vi } from "vitest";
import { earningKindLabel, earningStateLabel, salesStateLabel, soldQuantityLabel, workKindLabel, workStateLabel, portalOrderStateLabel } from "./presentation";
afterEach(() => vi.restoreAllMocks());
it("translates existing worker, earning and sales states", () => {
  expect(workStateLabel("DONE")).toBe("Chờ xác minh"); expect(workKindLabel("DELIVERY")).toBe("Chuyến giao hàng");
  expect(earningStateLabel("APPROVED")).toBe("Đã duyệt"); expect(earningKindLabel("SALES_COMMISSION")).toBe("Hoa hồng bán hàng");
  expect(salesStateLabel("FULFILLED")).toBe("Đã giao đủ"); expect(salesStateLabel("DRAFT")).toBe("Bản nháp");
});
it("never exposes an unknown technical status or logs its raw payload", () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  for (const translate of [workStateLabel, workKindLabel, earningStateLabel, earningKindLabel, salesStateLabel]) {
    expect(translate("SECRET_ENUM_WITH_IDENTIFIER")).not.toContain("SECRET");
  }
  expect(JSON.stringify(warning.mock.calls)).not.toContain("SECRET");
});

it("names service jobs and shows quantities in the unit the order was sold in", () => {
  expect(workKindLabel("SERVICE_JOB")).toBe("Công việc dịch vụ");
  const format = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  expect(soldQuantityLabel("3000", { unit: "kg", sold_unit: "bao", sold_numerator: "50", sold_denominator: "1" }, format)).toBe("60 bao (3.000 kg)");
  expect(soldQuantityLabel("6", { unit: "m³", sold_unit: "m³", sold_numerator: "1", sold_denominator: "1" }, format)).toBe("6 m³");
  expect(soldQuantityLabel("5", { unit: "kg" }, format)).toBe("5 kg");
});

it("shows a customer's own order as waiting, approved, delivering or delivered", () => {
  expect(portalOrderStateLabel({ channel: "CUSTOMER_PORTAL", state: "DRAFT" })).toBe("Chờ duyệt");
  expect(portalOrderStateLabel({ channel: "CUSTOMER_PORTAL", state: "CONFIRMED", fulfillment_state: "NOT_STARTED" })).toBe("Đã duyệt");
  expect(portalOrderStateLabel({ channel: "INTERNAL", state: "CONFIRMED", fulfillment_state: "NOT_STARTED" })).toBe("Đã xác nhận");
  expect(portalOrderStateLabel({ state: "CONFIRMED", fulfillment_state: "PARTIAL" })).toBe("Đang giao");
  expect(portalOrderStateLabel({ state: "CLOSED", fulfillment_state: "FULFILLED" })).toBe("Đã giao");
  expect(portalOrderStateLabel({ channel: "CUSTOMER_PORTAL", state: "CANCELLED" })).toBe("Đã hủy");
});
