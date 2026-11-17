// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));

import { orderedReport, rawOrderedReport } from "@/test/ordered-report-fixture";
import { orderedReportSchema } from "./ordered-report-schema";
import { fetchOrderedReport } from "./ordered-report-server";
import {
  dayRows, formatDayInput, goodsSummary, orderedExportHref, orderedReportHref, parseDayInput, periodPresets, periodProblem, remainingView,
  reportOrderStateLabel, resolveOrderedPeriod, weekdayDay,
} from "./ordered-report";

describe("report periods", () => {
  it("offers Hôm nay, Hôm qua, 7 ngày and Tháng này for the business day", () => {
    expect(periodPresets("2026-11-17").map(({ label, from, to }) => [label, from, to])).toEqual([
      ["Hôm nay", "2026-11-17", "2026-11-17"], ["Hôm qua", "2026-11-16", "2026-11-16"],
      ["7 ngày", "2026-11-11", "2026-11-17"], ["Tháng này", "2026-11-01", "2026-11-17"],
    ]);
    expect(periodPresets("2026-03-02")[1].from).toBe("2026-03-01");
    expect(periodPresets("2026-03-01")[1].from).toBe("2026-02-28");
  });

  it("reads typed dates as dd/mm/yyyy and refuses what is not a day", () => {
    expect(parseDayInput("17/11/2026")).toBe("2026-11-17");
    expect(parseDayInput(" 7/1/2026 ")).toBe("2026-01-07");
    expect(parseDayInput("30/02/2026")).toBeNull();
    expect(parseDayInput("2026-11-17")).toBeNull();
    expect(parseDayInput("17/11/26")).toBeNull();
    expect(formatDayInput("2026-01-07")).toBe("07/01/2026");
  });

  it("limits a period to 92 days and to from ≤ to, in plain words", () => {
    expect(periodProblem("2026-11-17", "2026-11-17")).toBeNull();
    expect(periodProblem("2026-08-18", "2026-11-17")).toBeNull();
    expect(periodProblem("2026-08-17", "2026-11-17")).toBe("Chọn tối đa 92 ngày mỗi lần.");
    expect(periodProblem("2026-11-18", "2026-11-17")).toBe("Ngày bắt đầu phải trước hoặc cùng ngày kết thúc.");
    expect(periodProblem("2026-13-01", "2026-11-17")).toContain("Ngày chưa đúng");
  });

  it("takes the period from the address, and falls back to today with a sentence and the typed values kept", () => {
    expect(resolveOrderedPeriod({}, "2026-11-17")).toMatchObject({ from: "2026-11-17", to: "2026-11-17", day: null, notice: null, fromText: "17/11/2026" });
    expect(resolveOrderedPeriod({ from: "2026-11-11", to: "2026-11-17", day: "2026-11-16" }, "2026-11-17"))
      .toMatchObject({ from: "2026-11-11", to: "2026-11-17", day: "2026-11-16", notice: null, fromText: "11/11/2026", toText: "17/11/2026" });
    const wrong = resolveOrderedPeriod({ from: "abc", to: "2026-11-17" }, "2026-11-17");
    expect(wrong).toMatchObject({ from: "2026-11-17", to: "2026-11-17", fromText: "abc", toText: "17/11/2026" });
    expect(wrong.notice).toMatch(/Ngày chưa đúng.*Đang hiện hôm nay/);
    expect(resolveOrderedPeriod({ from: "2026-11-17" }, "2026-11-17").notice).toMatch(/Chọn đủ hai ngày/);
    expect(resolveOrderedPeriod({ from: "2026-11-18", to: "2026-11-17" }, "2026-11-17").notice).toMatch(/trước hoặc cùng ngày/);
  });

  it("keeps a day filter only for a day inside a period of several days", () => {
    expect(resolveOrderedPeriod({ from: "2026-11-11", to: "2026-11-17", day: "2026-11-20" }, "2026-11-17").day).toBeNull();
    expect(resolveOrderedPeriod({ from: "2026-11-17", to: "2026-11-17", day: "2026-11-17" }, "2026-11-17").day).toBeNull();
    expect(resolveOrderedPeriod({ from: "2026-11-11", to: "2026-11-17", day: "xx" }, "2026-11-17").day).toBeNull();
  });

  it("builds the report and export addresses", () => {
    expect(orderedReportHref({ from: "2026-11-11", to: "2026-11-17", day: "2026-11-16" })).toBe("/customer/reports/ordered?from=2026-11-11&to=2026-11-17&day=2026-11-16");
    expect(orderedReportHref({ from: "2026-11-16", to: "2026-11-16" })).toBe("/customer/reports/ordered?from=2026-11-16&to=2026-11-16");
    expect(orderedExportHref("csv", { from: "2026-11-16", to: "2026-11-16" })).toBe("/api/portal/reports/ordered/export?format=csv&from=2026-11-16&to=2026-11-16");
    expect(weekdayDay("2026-11-16")).toBe("Thứ Hai, 16/11");
    expect(weekdayDay("2026-11-15")).toBe("Chủ Nhật, 15/11");
  });
});

describe("report figures", () => {
  it("tells what is left: '0 · đủ' when nothing, partly or not delivered otherwise", () => {
    const [sand, brick, cement] = orderedReport().goods;
    expect(remainingView(sand)).toEqual({ text: "0 · đủ", tone: "done" });
    expect(remainingView(brick)).toEqual({ text: "400", tone: "partial" });
    expect(remainingView(cement)).toEqual({ text: "10", tone: "none" });
  });

  it("counts kinds per day from the source orders and adds days that only have services", () => {
    const rows = dayRows(orderedReport());
    expect(rows.map((row) => row.day)).toEqual(["2026-11-17", "2026-11-16", "2026-11-15", "2026-11-13"]);
    expect(rows.find((row) => row.day === "2026-11-16")).toMatchObject({ orders: 4, kinds: 2, services: 0, amountVnd: "2170000" });
    expect(rows.find((row) => row.day === "2026-11-15")).toMatchObject({ orders: 0, kinds: 0, services: 1, amountVnd: "1800000" });
    expect(dayRows(orderedReport({ money: false })).every((row) => row.amountVnd === undefined)).toBe(true);
  });

  it("summarises the first goods and counts the rest", () => {
    expect(goodsSummary(orderedReport())).toBe("Cát đen 2 xe · Gạch đặc 1.000 viên · và 1 món khác");
    expect(goodsSummary(orderedReport(), 3)).toBe("Cát đen 2 xe · Gạch đặc 1.000 viên · Xi măng Bút Sơn PC30 10 bao");
  });

  it("words an order's state for the customer, never as a code", () => {
    expect(["DRAFT", "CONFIRMED", "PARTIAL", "FULFILLED", "CLOSED_REMAINDER"].map(reportOrderStateLabel)).toEqual(["Chờ duyệt", "Đã duyệt", "Đang giao", "Đã giao", "Hoàn tất"]);
  });
});

describe("what the database returns", () => {
  it("is read as text without rounding, money is optional and numbers are accepted", () => {
    const parsed = orderedReportSchema.parse({ ...rawOrderedReport(), total_vnd: 3460000 });
    expect(parsed.total_vnd).toBe("3460000");
    expect(parsed.goods[0].ordered_qty).toBe("2.000000");
    const receiver = orderedReportSchema.parse(rawOrderedReport({ money: false }));
    expect(receiver.show_money).toBe(false);
    expect(receiver.goods[0].amount_vnd).toBeUndefined();
    expect(receiver.total_vnd).toBeUndefined();
  });

  it("refuses an answer that is not a report", () => {
    expect(orderedReportSchema.safeParse({ ...rawOrderedReport(), order_count: "x" }).success).toBe(false);
    expect(orderedReportSchema.safeParse({ ...rawOrderedReport(), goods: [{ name: "x" }] }).success).toBe(false);
  });
});

describe("fetchOrderedReport", () => {
  const customerId = "11111111-1111-4111-8111-111111111111";
  const supabase = { rpc };
  beforeEach(() => { rpc.mockReset(); });

  it("calls the database report with the period and returns it parsed", async () => {
    rpc.mockResolvedValue({ data: rawOrderedReport(), error: null });
    const result = await fetchOrderedReport(supabase as never, { customerId, from: "2026-11-11", to: "2026-11-17" });
    expect(rpc).toHaveBeenCalledWith("customer_portal_ordered_report", { target_customer_id: customerId, from_day: "2026-11-11", to_day: "2026-11-17" });
    expect(result.status).toBe("ok");
  });

  it("tells a refusal, a bad period and a failure apart, and never throws", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "forbidden" } });
    expect((await fetchOrderedReport(supabase as never, { customerId, from: "2026-11-17", to: "2026-11-17" })).status).toBe("forbidden");
    rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "invalid_report_period" } });
    expect((await fetchOrderedReport(supabase as never, { customerId, from: "2026-11-17", to: "2026-11-17" })).status).toBe("period");
    rpc.mockResolvedValue({ data: null, error: { code: "08006", message: "connection failure" } });
    expect((await fetchOrderedReport(supabase as never, { customerId, from: "2026-11-17", to: "2026-11-17" })).status).toBe("error");
    rpc.mockResolvedValue({ data: { nonsense: true }, error: null });
    expect((await fetchOrderedReport(supabase as never, { customerId, from: "2026-11-17", to: "2026-11-17" })).status).toBe("error");
  });

  it("answers 'error' when the call itself breaks", async () => {
    rpc.mockImplementation(async () => { throw new Error("network"); });
    expect((await fetchOrderedReport(supabase as never, { customerId, from: "2026-11-17", to: "2026-11-17" })).status).toBe("error");
  });

  it("does not call the database for a malformed request", async () => {
    expect((await fetchOrderedReport(supabase as never, { customerId: "not-a-uuid", from: "2026-11-17", to: "2026-11-17" })).status).toBe("period");
    expect((await fetchOrderedReport(supabase as never, { customerId, from: "17/11/2026", to: "2026-11-17" })).status).toBe("period");
    expect(rpc).not.toHaveBeenCalled();
  });
});
