import { expect, it } from "vitest";
import { formatPortalMoney, sumPortalMoney } from "./money";
it("keeps all integer VND digits beyond the floating-point boundary", () => {
  expect(formatPortalMoney("9007199254740993")).toBe("9.007.199.254.740.993 ₫");
  expect(sumPortalMoney(["9007199254740993", "1"])).toBe("9007199254740994");
});
it("distinguishes unknown or already-rounded values from a verified recorded zero", () => {
  expect(formatPortalMoney(null)).toBe("Chưa xác định");
  expect(formatPortalMoney(9007199254740992)).toBe("Chưa xác định");
  expect(sumPortalMoney(["1", undefined])).toBeNull();
  expect(formatPortalMoney("0")).toBe("0 ₫");
  expect(sumPortalMoney([])).toBe("0");
});
