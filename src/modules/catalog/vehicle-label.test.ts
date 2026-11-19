import { describe, expect, it } from "vitest";
import { vehicleName } from "./vehicle-label";

describe("vehicleName", () => {
  it("shows the name alone when the vehicle has no plate", () => {
    expect(vehicleName({ code: "Xe điện", plate_number: null })).toBe("Xe điện");
  });
  it("keeps the plate next to the code when there is one", () => {
    expect(vehicleName({ code: "XE09", plate_number: "29-3434" })).toBe("XE09 · 29-3434");
  });
  it("falls back to the plate when only the plate was read", () => {
    expect(vehicleName({ plate_number: "29-3434" })).toBe("29-3434");
    expect(vehicleName({ code: " ", plate_number: " " })).toBe("");
  });
});
