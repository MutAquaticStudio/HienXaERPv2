import { describe, expect, it } from "vitest";
import { activationIntent, operationalLabel, operationalNextStep, recordingScopeText } from "./state";
describe("operational state presentation", () => {
 it("maps exactly the approved three states", () => {
  expect(operationalLabel("PENDING_OPENING")).toBe("Lịch sử chưa đối chiếu");
  expect(operationalLabel("READY_FOR_ACTIVATION")).toContain("hồ sơ lịch sử");
  expect(operationalLabel("ACTIVE")).toBe("Đang vận hành");
 });
 it("unknown/missing states never imply active", () => {
  for (const value of [null, undefined, "", "READY", "toString", "constructor", "__proto__", {}, 1]) expect(operationalLabel(value)).toContain("Chưa xác minh");
 });
 it("activation confirmation binds the branch and current version", () => {
  expect(activationIntent("branch", 2)).toBe("ACTIVATE:branch:2");
 });
 it("explains the next authorized step without changing the state", () => {
  expect(operationalNextStep("PENDING_OPENING")).toContain("không cần số dư đầu kỳ");
  expect(operationalNextStep("READY_FOR_ACTIVATION")).toContain("không cần kích hoạt thủ công");
  expect(operationalNextStep("ACTIVE")).toContain("tuân theo quyền");
  expect(operationalNextStep(null)).toContain("Chưa thể xác minh");
 });
 it("unknown history never claims zero or verified enterprise totals", () => {
  expect(recordingScopeText(undefined)).toContain("lịch sử chưa đối chiếu");
  expect(recordingScopeText("VERIFIED_IMPORT_SCOPE")).toContain("phạm vi lịch sử đã nhập");
  for (const quality of [undefined, "UNRECONCILED", "VERIFIED_IMPORT_SCOPE"]) expect(recordingScopeText(quality)).toContain("chưa xác minh tổng số dư toàn doanh nghiệp");
 });
});
