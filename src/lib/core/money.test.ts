import { describe, expect, it } from "vitest";
import { addVnd, applyBasisPoints, formatVnd, serializeVnd, vnd } from "./money";

describe("VND arithmetic", () => {
  it("keeps integer precision and serializes without float conversion", () => {
    const total = addVnd(vnd("9007199254740993000"), vnd("125"));
    expect(serializeVnd(total)).toBe("9007199254740993125");
    expect(formatVnd(vnd("6000000"))).toBe("6.000.000 ₫");
  });

  it("rounds basis points explicitly using half-up", () => {
    expect(serializeVnd(applyBasisPoints(vnd("105"), 500))).toBe("5");
    expect(serializeVnd(applyBasisPoints(vnd("110"), 500))).toBe("6");
  });
});
