import { describe, expect, it } from "vitest";
import { activationIntent, operationalLabel, operationalNextStep } from "./state";
describe("operational state presentation", () => {
 it("maps exactly the approved three states", () => {
  expect(operationalLabel("PENDING_OPENING")).toBe("Đang chuẩn bị số dư đầu kỳ");
  expect(operationalLabel("READY_FOR_ACTIVATION")).toContain("chờ kích hoạt");
  expect(operationalLabel("ACTIVE")).toBe("Đang vận hành");
 });
 it("unknown/missing states never imply active", () => {
  for (const value of [null, undefined, "", "READY", "toString", "constructor", "__proto__", {}, 1]) expect(operationalLabel(value)).toContain("Chưa xác minh");
 });
 it("activation confirmation binds the branch and current version", () => {
  expect(activationIntent("branch", 2)).toBe("ACTIVATE:branch:2");
 });
 it("explains the next authorized step without changing the state", () => {
  expect(operationalNextStep("PENDING_OPENING")).toContain("nhập và đối chiếu số dư đầu kỳ");
  expect(operationalNextStep("READY_FOR_ACTIVATION")).toContain("xác nhận kích hoạt");
  expect(operationalNextStep("ACTIVE")).toContain("tuân theo quyền");
  expect(operationalNextStep(null)).toContain("Chưa thể xác minh");
 });
});
