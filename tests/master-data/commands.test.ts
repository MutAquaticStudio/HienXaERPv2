import { describe, expect, it } from "vitest";

import { parseSaveMasterDataForm } from "@/modules/master-data/commands";

describe("P2 master-data command validation", () => {
  it("normalizes codes and accepts one material-specific packaging ratio", () => {
    const form = new FormData();
    form.set("kind", "material-group");
    form.set("code", " cement ");
    form.set("name", "Xi măng");
    expect(parseSaveMasterDataForm(form)).toMatchObject({
      kind: "material-group",
      code: "CEMENT",
      name: "Xi măng",
    });
  });

  it("requires exactly one load-profile target", () => {
    const form = new FormData();
    form.set("kind", "vehicle-load-profile");
    form.set("vehicleId", "vehicle-001");
    form.set("materialId", "material-001");
    form.set("materialGroupId", "group-001");
    form.set("plannedQuantity", "9");
    form.set("uomId", "uom-m3");
    expect(() => parseSaveMasterDataForm(form)).toThrowError(/đúng một vật liệu/i);
  });

  it("rejects quantities with unsafe precision", () => {
    const form = new FormData();
    form.set("kind", "conversion");
    form.set("materialId", "material-001");
    form.set("fromUomId", "uom-bag");
    form.set("sourceQuantity", "1");
    form.set("targetQuantity", "50.1234567");
    form.set("method", "PACKAGING");
    form.set("roundingScale", "3");
    expect(() => parseSaveMasterDataForm(form)).toThrowError(/tối đa 6/i);
  });

  it("rejects an invalid UOM decimal scale before reaching Postgres", () => {
    const form = new FormData();
    form.set("kind", "uom");
    form.set("code", "PALLET");
    form.set("symbol", "pallet");
    form.set("name", "Pallet");
    form.set("dimension", "COUNT");
    form.set("decimalScale", "x");

    expect(() => parseSaveMasterDataForm(form)).toThrowError(/từ 0 đến 6/i);
  });
});
