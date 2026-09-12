import { describe, expect, it } from "vitest";
import { serializeVnd, vnd } from "@/lib/core/money";
import { assertCreditAvailable, calculateCreditExposure } from "./credit";

describe("credit exposure", () => {
  it("does not double count allocated cash or a transferred commitment", () => {
    const exposure = calculateCreditExposure({ receivableVnd: vnd("6000000"), commitmentVnd: vnd("4000000"), eligibleReservedAdvanceVnd: vnd("1000000") });
    expect(serializeVnd(exposure.exposureVnd)).toBe("9000000");
  });

  it("requires an approved limit and rejects overflow", () => {
    expect(() => assertCreditAvailable({ exposureVnd: vnd("0"), requestedVnd: vnd("1") })).toThrow();
    expect(() => assertCreditAvailable({ exposureVnd: vnd("9000000"), requestedVnd: vnd("2000000"), approvedLimitVnd: vnd("10000000") })).toThrow();
    expect(() => assertCreditAvailable({ exposureVnd: vnd("9000000"), requestedVnd: vnd("1000000"), approvedLimitVnd: vnd("10000000") })).not.toThrow();
  });
});
