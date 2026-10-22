import { expect, it } from "vitest";
import { catalogs } from "./fields";

it("asks only what a delivery site needs: no coordinates or receiving window (FB7)", () => {
  const keys = catalogs.sites.fields.map((field) => field.key);
  expect(keys).toEqual(expect.arrayContaining(["customer_id", "name", "address_text", "receiver_name", "receiver_phone", "access_note"]));
  for (const removed of ["latitude", "longitude", "receiving_window"]) expect(keys).not.toContain(removed);
});
