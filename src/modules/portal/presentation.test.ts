import { afterEach, expect, it, vi } from "vitest";
import { earningKindLabel, earningStateLabel, salesStateLabel, workKindLabel, workStateLabel } from "./presentation";
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
