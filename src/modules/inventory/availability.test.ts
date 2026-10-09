import { expect, it } from "vitest";
import { stockDemand } from "./availability";
it.each([
 ["10", "2", true, "SUFFICIENT"], ["1", "2", true, "SHORT"], ["0", "1", true, "SHORT"],
 [null, "2", true, "UNKNOWN"], ["10", "2", false, "UOM_MISMATCH"],
 ["9007199254740993.123456", "9007199254740993.123457", true, "SHORT"],
 ["Infinity", "2", true, "INVALID"], ["1", "0", true, "INVALID"], ["1", "-1", true, "INVALID"],
 ["1", "NaN", true, "INVALID"], ["1", "", true, "INVALID"],
] as const)("assesses exact quantities %s %s %s", (a,q,same,expected) => expect(stockDemand(a,q,same)).toBe(expected));
