import { describe, expect, it } from "vitest";
import { activationIntent, operationalLabel } from "./state";
describe("operational state presentation", () => {
 it("maps exactly the approved three states", () => {
  expect(operationalLabel("PENDING_OPENING")).toBe("Đang chuẩn bị số dư đầu kỳ");
  expect(operationalLabel("READY_FOR_ACTIVATION")).toContain("chờ kích hoạt");
  expect(operationalLabel("ACTIVE")).toBe("Đang vận hành");
 });
 it("unknown/missing states never imply active", () => {
  for (const value of [null, undefined, "", "READY", {}, 1]) expect(operationalLabel(value)).toContain("Chưa xác minh");
 });
 it("activation confirmation binds the branch and current version", () => {
  expect(activationIntent("branch", 2)).toBe("ACTIVATE:branch:2");
 });
});
