import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { loadTodayFacts, todayItems } from "./today";

describe("Cần xử lý hôm nay (D56)", () => {
  it("lists what needs doing, most urgent first, and leaves out what is done or not visible", () => {
    const items = todayItems({
      waitingDeliveries: { count: 7, earliestAt: "2026-11-04T04:52:00Z", late: 1, declined: 1 },
      bankReview: { count: 1, latestAmountVnd: "10500000", latestAt: "2026-11-02T03:00:00Z" },
      portalOrders: { count: 1, firstNumber: "SO-2026-000080", firstCustomer: "An Phát" },
      openShifts: { count: 1, firstName: "Thợ 01", firstDay: "2026-11-02" },
      draftPurchases: { count: 0, supplier: null },
      unreconciled: null,
    });
    expect(items.map((item) => item.key)).toEqual(["deliveries", "shifts", "bank", "portal"]);
    expect(items[0]).toMatchObject({ count: 7, href: "/admin/dispatch", action: "Phân giao", tone: "warning", detail: "Sớm nhất 11:52 · 1 phiếu trễ hẹn · 1 phiếu thợ từ chối" });
    expect(items[1].detail).toBe("Thợ 01 · vào ca ngày 02/11/2026");
    expect(items[2].detail).toBe("+10.500.000 ₫ · 02/11/2026");
    expect(todayItems({})).toEqual([]);
  });

  it("reads nothing the user may not see", async () => {
    const supabase = { rpc: vi.fn(), from: vi.fn() };
    const facts = await loadTodayFacts(supabase as never, "b1", new Set(["dashboard.read"]), new Date("2026-11-04T02:00:00Z"));
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(todayItems(facts)).toEqual([]);
  });
});
