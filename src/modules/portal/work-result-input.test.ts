import { describe, expect, it } from "vitest";
import { parseWorkResultInput } from "./work-result-input";
const common = { workItemId: "11111111-1111-4111-8111-111111111111", operationId: "22222222-2222-4222-8222-222222222222", expectedVersion: 3 };
const delivery = { ...common, expectedDeliveryVersion: 4, expectedAssignmentVersion: 1, deliveryLines: [
  { deliveryLineId: "33333333-3333-4333-8333-333333333333", actualQuantity: "1.000001" },
  { deliveryLineId: "44444444-4444-4444-8444-444444444444", actualQuantity: "0" },
] };
describe("portal work-result input", () => {
  it("preserves exact per-line quantities and both source versions", () => {
    const parsed = parseWorkResultInput(delivery);
    expect(parsed).toMatchObject(delivery);
    expect("actualQuantity" in parsed).toBe(false);
  });
  it.each(["", " ", "NaN", "Infinity", "-1"])("rejects invalid quantity %s", (quantity) => {
    expect(() => parseWorkResultInput({ ...delivery, deliveryLines: [{ ...delivery.deliveryLines[0], actualQuantity: quantity }] })).toThrow();
  });
  it("rejects duplicate lines and missing assignment version", () => {
    expect(() => parseWorkResultInput({ ...delivery, deliveryLines: [delivery.deliveryLines[0], delivery.deliveryLines[0]] })).toThrow();
    expect(() => parseWorkResultInput({ ...delivery, expectedAssignmentVersion: null })).toThrow();
  });
  it("retains the service scalar path and rejects invalid identifiers", () => {
    expect(parseWorkResultInput({ ...common, actualQuantity: "10.5" })).toMatchObject({ actualQuantity: "10.5" });
    expect(() => parseWorkResultInput({ ...common, workItemId: "other", actualQuantity: "1" })).toThrow();
  });
});
