import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { changeAgainst, debtAging, deliveryDay, salesByGroup } from "./overview";

describe("Tổng quan widgets (D56)", () => {
  it("counts today's slips by where they stand, without cancelled ones", () => {
    expect(deliveryDay(["PLANNED", "PLANNED", "ASSIGNED", "DISPATCHED", "ARRIVED", "VERIFIED", "RESULT_SUBMITTED", "CANCELLED"]))
      .toEqual({ waiting: 2, assigned: 1, onTheWay: 2, done: 2, total: 7 });
  });

  it("adds delivered sales by material group, largest first, folding the rest into Khác", () => {
    const groups = new Map([["XM1", "Xi măng"], ["XM2", "Xi măng"], ["S10", "Sắt thép"], ["C1", "Cát"]]);
    const result = salesByGroup([{ code: "XM1", amount_vnd: "300" }, { code: "XM2", amount_vnd: "200" }, { code: "S10", amount_vnd: "400" },
      { code: "C1", amount_vnd: "50" }, { code: "X9", amount_vnd: "50" }], groups, 2);
    expect(result.map((row) => [row.name, row.amountVnd, row.share])).toEqual([["Xi măng", 500n, 50], ["Sắt thép", 400n, 40], ["Khác", 100n, 10]]);
  });

  it("sums debts by how late they are and keeps who owes most", () => {
    const aging = debtAging([
      { label: "An Phát", code: "KH01", total_vnd: "8700000", not_due_vnd: "0", d30_vnd: "8700000", d60_vnd: "0", d90_vnd: "0" },
      { label: "Minh Long", code: "KH02", total_vnd: "4100000", not_due_vnd: "1000000", d30_vnd: "0", d60_vnd: "3100000", d90_vnd: "0" },
    ]);
    expect([aging.totalVnd, aging.notDueVnd, aging.late30Vnd, aging.late60Vnd, aging.late90Vnd, aging.customers]).toEqual([12800000n, 1000000n, 8700000n, 3100000n, 0n, 2]);
    expect(aging.top[1]).toEqual({ name: "Minh Long", code: "KH02", totalVnd: 4100000n, lateVnd: 3100000n });
  });

  it("compares with the previous period only when there is a base", () => {
    expect(changeAgainst(112n, 100n)).toEqual({ percent: 12, up: true });
    expect(changeAgainst(90n, 100n)).toEqual({ percent: 10, up: false });
    expect(changeAgainst(50n, 0n)).toBeNull();
    expect(changeAgainst(null, 10n)).toBeNull();
  });
});
