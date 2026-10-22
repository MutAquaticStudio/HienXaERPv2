import { expect, it } from "vitest";
import { reasonOrDefault } from "./reason";

it("keeps a note long enough for the history and describes the action otherwise", () => {
  expect(reasonOrDefault("  Khách đổi địa chỉ  ", "Cập nhật danh mục")).toBe("Khách đổi địa chỉ");
  expect(reasonOrDefault("", "Cập nhật danh mục")).toBe("Cập nhật danh mục");
  expect(reasonOrDefault(null, "Hủy đơn")).toBe("Hủy đơn");
  expect(reasonOrDefault("ok", "Hủy đơn")).toBe("Hủy đơn: ok");
  expect(reasonOrDefault("x".repeat(600), "Hủy đơn")).toHaveLength(500);
});
