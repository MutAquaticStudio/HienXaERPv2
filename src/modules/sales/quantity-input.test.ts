import { describe, expect, it } from "vitest";
import { isPositiveSalesQuantity } from "./quantity-input";
describe("sales quantity validation", () => {
  it.each(["", " ", "0", "-0", "-1", "NaN", "Infinity", "0.0000001"])("rejects %s", value => expect(isPositiveSalesQuantity(value)).toBe(false));
  it.each(["1", " 2.5 ", "0.000001", "123456789.123456"])("accepts exact decimal %s", value => expect(isPositiveSalesQuantity(value)).toBe(true));
});
