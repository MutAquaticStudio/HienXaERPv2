import { expect, it } from "vitest";
import { normalizeWarehouseAddress } from "./warehouse-address";
it("shares warehouse-address content rules for null, blank, tabs/newlines and Unicode whitespace", () => {
  for (const value of [null, undefined, "", "   ", "\t\r\n\v\f", "\u00a0\u1680\u2000\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"]) expect(normalizeWarehouseAddress(value)).toBeNull();
  expect(normalizeWarehouseAddress(" \t12 Đường \"Kho\"\n")).toBe('12 Đường "Kho"');
  expect(normalizeWarehouseAddress("12\nĐường kho")).toBe("12\nĐường kho");
});
