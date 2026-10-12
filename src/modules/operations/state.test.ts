import { describe, expect, it } from "vitest";
import { historicalScopeLabel, recordingScopeText } from "./state";

describe("historical recording scope", () => {
 it("only calls a sourced historical import reconciled", () => {
  expect(historicalScopeLabel("VERIFIED_IMPORT_SCOPE")).toContain("phạm vi lịch sử đã nhập");
  for (const value of [null, undefined, "ACTIVE", "PENDING_OPENING", "READY_FOR_ACTIVATION", "UNRECONCILED", "__proto__", {}]) {
   expect(historicalScopeLabel(value)).toBe("Lịch sử chưa đối chiếu");
  }
 });
 it("unknown history never claims zero or verified enterprise totals", () => {
  expect(recordingScopeText(undefined)).toContain("lịch sử chưa đối chiếu");
  expect(recordingScopeText("VERIFIED_IMPORT_SCOPE")).toContain("phạm vi lịch sử đã nhập");
  for (const quality of [undefined, "UNRECONCILED", "VERIFIED_IMPORT_SCOPE"]) expect(recordingScopeText(quality)).toContain("chưa xác minh tổng số dư toàn doanh nghiệp");
 });
});
