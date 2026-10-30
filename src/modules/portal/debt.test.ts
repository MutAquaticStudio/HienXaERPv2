import { describe, expect, it } from "vitest";
import { debtBuckets, dueStatus } from "./debt";

describe("customer debt summary (concept Khách · Công nợ)", () => {
  it("labels due dates: overdue N days, N days left, the date, not set", () => {
    expect(dueStatus("2026-10-21", "2026-10-30")).toEqual({ tone: "overdue", label: "Quá hạn 9 ngày · hạn 21/10" });
    expect(dueStatus("2026-11-02", "2026-10-30")).toEqual({ tone: "soon", label: "Còn 3 ngày · hạn 02/11" });
    expect(dueStatus("2026-10-30", "2026-10-30").label).toBe("Đến hạn hôm nay · hạn 30/10");
    expect(dueStatus("2026-11-27", "2026-10-30")).toEqual({ tone: "later", label: "Hạn 27/11" });
    expect(dueStatus(null, "2026-10-30").tone).toBe("later");
  });

  it("splits the outstanding into in time / soon / overdue for the bar", () => {
    const buckets = debtBuckets([
      { due_date: "2026-10-21", outstanding_amount_vnd: "12000000" },
      { due_date: "2026-11-02", outstanding_amount_vnd: "18200000" },
      { due_date: "2026-11-27", outstanding_amount_vnd: "15100000" },
    ], "2026-10-30");
    expect(buckets.total).toBe("45300000");
    expect(buckets.overdue).toEqual({ amount: "12000000", percent: 26.4 });
    expect(buckets.soon.amount).toBe("18200000");
    expect(buckets.later.amount).toBe("15100000");
    expect(debtBuckets([], "2026-10-30").overdue.percent).toBe(0);
  });
});
