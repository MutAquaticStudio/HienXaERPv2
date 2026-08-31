import { describe, expect, it } from "vitest";
import {
  adjustmentMovementForVariance,
  assertWarehouseReceiptRoute,
  deriveInventoryAvailability,
  isLowStock,
  movingWeightedAverage,
  reserveAvailableStock,
  stockCountVariance,
} from "@/modules/inventory/workflow";

describe("P6 inventory and yard workflow", () => {
  it("derives on hand, reserved and available without a direct balance edit", () => {
    expect(deriveInventoryAvailability("125000", "25000")).toBe(100000);
    expect(reserveAvailableStock(100, 20, 80)).toBe(100);
    expect(() => reserveAvailableStock(100, 20, 81)).toThrowError(
      /không đủ tồn khả dụng/i,
    );
  });

  it("calculates the moving weighted average on receipt", () => {
    expect(movingWeightedAverage(100, 10, 50, 14)).toBeCloseTo(11.333333, 6);
  });

  it("routes counted variance through an adjustment movement", () => {
    const variance = stockCountVariance(125000, 124950);
    expect(variance).toBe(-50);
    expect(adjustmentMovementForVariance(variance)).toBe("ADJUSTMENT_OUT");
    expect(adjustmentMovementForVariance(0)).toBeNull();
  });

  it("detects low stock and prevents dropship phantom inventory", () => {
    expect(isLowStock(30000, 30000)).toBe(true);
    expect(() => assertWarehouseReceiptRoute("SUPPLIER_DIRECT")).toThrowError(
      /không được nhập kho/i,
    );
  });
});
