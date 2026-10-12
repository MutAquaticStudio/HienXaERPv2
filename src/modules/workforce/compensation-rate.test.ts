import { describe, expect, it } from "vitest";
import { validCompensationRate } from "./compensation-rate";

describe("compensation rates before numeric storage", () => {
  it.each(["NaN", "Infinity", "-Infinity", "1.0000001", "100000000000000", "0", "-1", "1e3"])("rejects an invalid fixed rate %s", value => {
    expect(validCompensationRate("FIXED_PER_BASIS", value)).toBe(false);
  });
  it.each(["1", "0.000001", "99999999999999.999999"])("keeps supported exact fixed rate %s", value => {
    expect(validCompensationRate("FIXED_PER_BASIS", value)).toBe(true);
  });
  it.each(["0", "10001", "1.5", "NaN", "99999999999999999999"])("rejects invalid integer basis points %s", value => {
    expect(validCompensationRate("PERCENT_BPS", value)).toBe(false);
  });
  it.each(["1", "10000"])("allows supported integer basis points %s", value => {
    expect(validCompensationRate("PERCENT_BPS", value)).toBe(true);
  });
});
