import { describe, expect, it } from "vitest";

import {
  assertDeliveryTransition,
  resolveDeliveryOutcome,
} from "@/modules/delivery/workflow";

describe("P7 delivery workflow", () => {
  it("allows the required happy path and blocks terminal rewrites", () => {
    expect(() => assertDeliveryTransition("PLANNED", "ASSIGNED")).not.toThrow();
    expect(() => assertDeliveryTransition("ASSIGNED", "DISPATCHED")).not.toThrow();
    expect(() => assertDeliveryTransition("DISPATCHED", "ARRIVED")).not.toThrow();
    expect(() => assertDeliveryTransition("ARRIVED", "DELIVERED")).not.toThrow();
    expect(() => assertDeliveryTransition("DELIVERED", "CONFIRMED")).not.toThrow();
    expect(() => assertDeliveryTransition("CONFIRMED", "PLANNED")).toThrow(/Không thể chuyển/);
  });

  it("keeps partial, failed and cancelled paths explicit", () => {
    expect(() => assertDeliveryTransition("PLANNED", "CANCELLED")).not.toThrow();
    expect(() => assertDeliveryTransition("DISPATCHED", "FAILED")).not.toThrow();
    expect(() => assertDeliveryTransition("DELIVERED", "PARTIAL")).not.toThrow();
  });

  it("derives final outcome from accepted quantity", () => {
    expect(resolveDeliveryOutcome([{ plannedQuantity: 10, actualQuantity: 10, acceptedQuantity: 10 }])).toBe("CONFIRMED");
    expect(resolveDeliveryOutcome([{ plannedQuantity: 10, actualQuantity: 9, acceptedQuantity: 8 }])).toBe("PARTIAL");
    expect(() => resolveDeliveryOutcome([{ plannedQuantity: 10, actualQuantity: 9, acceptedQuantity: 10 }])).toThrow(/không hợp lệ/);
  });
});
