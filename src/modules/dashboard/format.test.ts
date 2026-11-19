import { describe, expect, it } from "vitest";
import { shortVnd } from "./format";

describe("shortVnd", () => {
  it("writes millions and billions with one decimal, smaller amounts exactly", () => {
    expect(shortVnd(68_400_000n)).toBe("68,4 triệu");
    expect(shortVnd(15_000_000n)).toBe("15 triệu");
    expect(shortVnd(1_250_000_000n)).toBe("1,3 tỷ");
    expect(shortVnd(-253_200n)).toMatch(/^-253\.200/);
    expect(shortVnd(950_000n)).toMatch(/^950\.000/);
  });
});
