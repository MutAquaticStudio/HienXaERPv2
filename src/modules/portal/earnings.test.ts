import { describe, expect, it } from "vitest";
import { attendanceWeek, businessMonth, monthEarnings } from "./earnings";

const worked = (work_date: string, late = 0, early = 0) => ({ work_date, status: "WORKED", clock_in_at: `${work_date}T01:00:00Z`, clock_out_at: `${work_date}T10:00:00Z`,
  late_minutes: late, early_minutes: early, overtime_minutes: 0 });

describe("worker earnings card (concept cổng thợ)", () => {
  it("splits this business month into time pay, trips (with count) and the rest, in whole đồng", () => {
    const result = monthEarnings([
      { id: "1", type: "FIXED_MONTHLY", amount_vnd: "6500000", occurred_at: "2026-10-31T02:00:00Z" },
      { id: "2", type: "PER_TRIP", amount_vnd: "100000", occurred_at: "2026-10-05T03:00:00Z" },
      { id: "3", type: "DELIVERY_PIECEWORK", amount_vnd: "100000", occurred_at: "2026-10-06T03:00:00Z" },
      { id: "4", type: "BONUS", amount_vnd: "150000", occurred_at: "2026-10-07T03:00:00Z" },
      // 30/09 23:30 in Hà Nội is still September even though it is 16:30Z of the 30th; 31/10 18:00Z is already November.
      { id: "5", type: "PER_TRIP", amount_vnd: "999", occurred_at: "2026-09-30T16:30:00Z" },
      { id: "6", type: "PER_TRIP", amount_vnd: "999", occurred_at: "2026-10-31T18:00:00Z" },
    ], "2026-10");
    expect(result).toMatchObject({ total: "6850000", time: "6500000", trips: "200000", tripCount: 2, other: "150000" });
    expect(result.items.map((item) => item.id)).toEqual(["1", "2", "3", "4"]);
    expect(businessMonth("2026-10-31T18:00:00Z")).toBe("2026-11");
  });

  it("marks the week: done, late with the reason, today, planned shifts and days off", () => {
    const week = attendanceWeek("2026-10-26", "2026-10-29", [worked("2026-10-26"), worked("2026-10-27"), worked("2026-10-28", 12)],
      ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
    expect(week.days.map((day) => `${day.weekday} ${day.day} ${day.tone}`)).toEqual([
      "T2 26 done", "T3 27 done", "T4 28 late", "T5 29 today", "T6 30 planned", "T7 31 off", "CN 1 off"]);
    expect(week.days[2].note).toBe("vào ca trễ 12 phút");
    expect({ worked: week.worked, scheduled: week.scheduled }).toEqual({ worked: 3, scheduled: 5 });
  });
});
