import { expect, it } from "vitest";
import { catalogs } from "./fields";

it("asks only what a delivery site needs: no coordinates or receiving window (FB7)", () => {
  const keys = catalogs.sites.fields.map((field) => field.key);
  expect(keys).toEqual(expect.arrayContaining(["customer_id", "name", "address_text", "receiver_name", "receiver_phone", "access_note"]));
  for (const removed of ["latitude", "longitude", "receiving_window"]) expect(keys).not.toContain(removed);
});

it("lets the owner turn a service type on for the customer portal, off by default, with a group name (D75)", () => {
  const fields = catalogs.service_types.fields;
  expect(fields.find((field) => field.key === "portal_visible")).toMatchObject({ type: "checkbox", value: false });
  expect(fields.find((field) => field.key === "portal_group")?.suggestions).toEqual(expect.arrayContaining(["Chạc", "Máy", "Vận chuyển", "Nhân công"]));
  expect(catalogs.service_types.list).toContain("portal_visible");
  // "Xe" alone means "Xe cn nhỏ": the unit suggestions offer it, not a bare "xe".
  const units = fields.find((field) => field.key === "unit_label")?.suggestions ?? [];
  expect(units).toEqual(expect.arrayContaining(["xe cn nhỏ", "xe cn to"]));
  expect(units).not.toContain("xe");
});
