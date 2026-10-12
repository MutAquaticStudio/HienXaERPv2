import { describe, expect, it } from "vitest";
import { parseSafeWorkDraft, serializeSafeWorkDraft } from "./draft";
const operationId = "11111111-1111-4111-8111-111111111111";
const delivery = { id: "22222222-2222-4222-8222-222222222222", version: 4, assignment_version: 1, state: "ARRIVED", can_submit_result: true, lines: [
  { id: "33333333-3333-4333-8333-333333333333", material_name: "A", unit: "unit", planned_base_quantity: "2", loaded_base_quantity: "2", reportable_base_quantity: "2" },
  { id: "44444444-4444-4444-8444-444444444444", material_name: "B", unit: "kg", planned_base_quantity: "3", loaded_base_quantity: "3", reportable_base_quantity: "3" },
] };
describe("delivery draft", () => {
  it("restores per-line quantities, stale versions and the same retry intent without secrets", () => {
    const initial = parseSafeWorkDraft(null, 2, operationId, delivery);
    initial.receiverName = "QA Receiver"; initial.note = "Partial delivery";
    initial.delivery!.lines[0].actualQuantity = "1"; initial.delivery!.lines[1].actualQuantity = "0";
    const raw = JSON.stringify({ ...initial, token: "SECRET", money: 500000, delivery: { ...initial.delivery, secret: "SECRET" } });
    const restored = parseSafeWorkDraft(raw, 3, "55555555-5555-4555-8555-555555555555", { ...delivery, version: 5, assignment_version: 2 });
    expect(restored.operationId).toBe(operationId); expect(restored.expectedVersion).toBe(2);
    expect(restored.delivery).toMatchObject({ expectedVersion: 4, expectedAssignmentVersion: 1, lines: initial.delivery!.lines });
    expect(serializeSafeWorkDraft(restored)).not.toContain("SECRET"); expect(serializeSafeWorkDraft(restored)).not.toContain("500000");
  });
  it("never assigns an old scalar to multiple delivery lines", () => {
    expect(parseSafeWorkDraft(JSON.stringify({ actualQuantity: "4" }), 2, operationId, delivery).delivery!.lines.map((line) => line.actualQuantity)).toEqual(["", ""]);
  });
  it("handles malformed persisted data and drops unknown line identifiers", () => {
    expect(parseSafeWorkDraft("not-json", 2, operationId, delivery).delivery!.lines).toHaveLength(2);
    const raw = JSON.stringify({ delivery: { lines: [{ deliveryLineId: "unrelated", actualQuantity: "9" }] } });
    expect(parseSafeWorkDraft(raw, 2, operationId, delivery).delivery!.lines.map((line) => line.actualQuantity)).toEqual(["", ""]);
  });
});
