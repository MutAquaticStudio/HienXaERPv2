import { describe, expect, it } from "vitest";

import { parseGpsLocationForm } from "@/modules/gps/commands";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const VALID = {
  kind: "gps.location.record",
  latitude: "21.1714382",
  longitude: "106.0697221",
  accuracyM: "18.5",
  speedMps: "4.2",
  headingDeg: "270",
  recordedAt: "2026-09-05T07:14:35.000Z",
};

describe("GPS1 browser command validation", () => {
  it("accepts a bounded browser position without any client-controlled assignment identity", () => {
    expect(parseGpsLocationForm(form(VALID))).toEqual({
      kind: "gps.location.record",
      latitude: "21.1714382",
      longitude: "106.0697221",
      accuracyM: "18.5",
      speedMps: "4.2",
      headingDeg: "270",
      recordedAt: "2026-09-05T07:14:35.000Z",
    });
  });

  it("rejects an unsupported command, coordinates, telemetry bounds, and timestamps", () => {
    expect(() => parseGpsLocationForm(form({ ...VALID, kind: "delivery.progress" }))).toThrow(/không được hỗ trợ/);
    expect(() => parseGpsLocationForm(form({ ...VALID, latitude: "91" }))).toThrow(/Vĩ độ/);
    expect(() => parseGpsLocationForm(form({ ...VALID, accuracyM: "0" }))).toThrow(/Độ chính xác/);
    expect(() => parseGpsLocationForm(form({ ...VALID, speedMps: "101" }))).toThrow(/Tốc độ/);
    expect(() => parseGpsLocationForm(form({ ...VALID, headingDeg: "360" }))).toThrow(/Hướng di chuyển/);
    expect(() => parseGpsLocationForm(form({ ...VALID, recordedAt: "not-a-time" }))).toThrow(/Thời điểm/);
  });

  it("allows absent speed and heading, but never arbitrary values", () => {
    const data = form(VALID);
    data.delete("speedMps");
    data.delete("headingDeg");
    expect(parseGpsLocationForm(data)).toMatchObject({ speedMps: null, headingDeg: null });
    expect(() => parseGpsLocationForm(form({ ...VALID, longitude: "106.0; delete" }))).toThrow(/Kinh độ/);
  });
});
