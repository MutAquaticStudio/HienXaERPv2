import { describe, expect, it } from "vitest";
import { searchResult } from "./results";

describe("ô tìm chung — kết quả (D56)", () => {
  const raw = {
    customers: [{ id: "c1", code: "KH01", name: "Công ty TNHH Xây dựng An Phát", phone: "0912 345 678" }],
    orders: [{ id: "o1", number: "SO-2026-000079", customer: "An Phát", site: "Nhà xưởng Sóng Thần", state: "CONFIRMED", created_at: "2026-11-02T08:00:00Z" }],
    deliveries: [],
    materials: [{ id: "m1", code: "XIBS30", name: "Xi măng Bút Sơn PC30" }],
  };

  it("groups hits in a fixed order with where each opens, leaving out empty groups", () => {
    const result = searchResult(raw, "an phat");
    expect(result.groups.map((group) => group.label)).toEqual(["Khách hàng", "Đơn bán", "Vật tư"]);
    expect(result.groups[0].hits[0]).toEqual({ id: "c1", href: "/admin/customers/c1", title: "Công ty TNHH Xây dựng An Phát", detail: "KH01 · 0912 345 678" });
    expect(result.groups[1].hits[0]).toMatchObject({ href: "/admin/orders/o1", badge: "Đã xác nhận" });
    expect(result.exact).toBeNull();
  });

  it("opens a document directly when its number is typed exactly", () => {
    expect(searchResult(raw, " so-2026-000079 ").exact).toBe("/admin/orders/o1");
  });
});
