import { describe, expect, it } from "vitest";

import {
  assertConversionDefinition,
  convertQuantity,
} from "@/modules/master-data/conversion";

describe("P2 material-specific conversion", () => {
  it("keeps packaging ratios material-specific", () => {
    const cementA = convertQuantity("3", {
      sourceQuantity: "1",
      targetQuantity: "50",
      method: "PACKAGING",
      roundingScale: 3,
      sourceDimension: "COUNT",
      targetDimension: "MASS",
    });
    const cementB = convertQuantity("3", {
      sourceQuantity: "1",
      targetQuantity: "40",
      method: "PACKAGING",
      roundingScale: 3,
      sourceDimension: "COUNT",
      targetDimension: "MASS",
    });

    expect(cementA.quantity).toBe("150");
    expect(cementB.quantity).toBe("120");
    expect(cementA.methodLabel).toMatch(/riêng của vật liệu/i);
  });

  it("never presents an estimated cross-dimension result as exact", () => {
    const result = convertQuantity("10", {
      sourceQuantity: "1",
      targetQuantity: "1.4",
      method: "ESTIMATED",
      roundingScale: 3,
      sourceDimension: "VOLUME",
      targetDimension: "MASS",
    });

    expect(result.quantity).toBe("14");
    expect(result.methodLabel).toBe("Ước tính");
    expect(result.precisionNotice).toMatch(/không phải tỷ lệ chính xác/i);
  });

  it("rejects cross-dimension exact conversions", () => {
    expect(() =>
      assertConversionDefinition({
        sourceQuantity: "1",
        targetQuantity: "1.4",
        method: "EXACT",
        roundingScale: 3,
        sourceDimension: "VOLUME",
        targetDimension: "MASS",
      }),
    ).toThrowError(/không được ghi là chính xác/i);
  });

  it("uses decimal fractions and stable rounding without binary drift", () => {
    const definition = {
      sourceQuantity: "3",
      targetQuantity: "2",
      method: "MEASURED" as const,
      roundingScale: 6,
      sourceDimension: "COUNT" as const,
      targetDimension: "MASS" as const,
    };
    const toBase = convertQuantity("7", definition);
    const back = convertQuantity(toBase.quantity, definition, "FROM_BASE");

    expect(toBase.quantity).toBe("4.666667");
    expect(back.quantity).toBe("7.000001");
  });

  it("rejects unsafe scale and non-positive quantities", () => {
    const valid = {
      sourceQuantity: "1",
      targetQuantity: "50",
      method: "PACKAGING" as const,
      sourceDimension: "COUNT" as const,
      targetDimension: "MASS" as const,
    };
    expect(() =>
      assertConversionDefinition({ ...valid, roundingScale: 7 }),
    ).toThrowError(/0 đến 6/i);
    expect(() =>
      convertQuantity("0", { ...valid, roundingScale: 3 }),
    ).toThrowError(/lớn hơn 0/i);
  });
});
