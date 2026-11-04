import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, calls: [] as { table: string; method: string; args: unknown[] }[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/access/context", () => ({ requireInternalAccess: async () => ({ employeeId: "e1", branchId: "b1" }) }));
vi.mock("@/modules/attendance/forms", () => ({ ClockPanel: ({ clockedIn }: { clockedIn: boolean }) => <button type="button">{clockedIn ? "Ra ca" : "Vào ca"}</button> }));
vi.mock("@/modules/portal/actions", () => ({ getWorkerPortalSnapshot: async () => ({ employee: { display_name: "Anh Hải" }, jobs: [], pool: [] }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const filters: { method: string; args: unknown[] }[] = [];
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "gte", "not", "is", "order", "limit"]) query[method] = (...args: unknown[]) => { filters.push({ method, args }); m.calls.push({ table, method, args }); return query; };
    query.maybeSingle = async () => ({ data: null, error: null });
    query.then = (resolve: (value: unknown) => unknown) => {
      // An open record is looked up on any day: only queries asking for clock_out_at IS NULL get the open row.
      const rows = (m.tables[table] ?? []).filter((row) => {
        const record = row as { clock_out_at: string | null; work_date: string };
        if (filters.some((f) => f.method === "is" && f.args[0] === "clock_out_at")) return record.clock_out_at === null;
        const day = filters.find((f) => f.method === "eq" && f.args[0] === "work_date")?.args[1];
        return (day === undefined || record.work_date === day) && record.clock_out_at !== null;
      });
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    };
    return query;
  },
}) }));
import Page from "./page";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T02:00:00Z"));
  m.calls = [];
  m.tables = { shift_assignments: [], attendance_records: [] };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("shows a shift left open two days ago instead of 'Chưa vào ca', with Ra ca to close it", async () => {
  m.tables.attendance_records = [{ work_date: "2026-11-02", clock_in_at: "2026-11-02T04:49:00Z", clock_out_at: null }];
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText("Ca 02/11 chưa ra ca (vào lúc 11:49)")).toBeTruthy();
  expect(screen.getByText("Bấm “Ra ca” để kết thúc ca cũ trước khi vào ca mới.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Ra ca" })).toBeTruthy();
  expect(screen.queryByText("Chưa vào ca")).toBeNull();
  // The open record is not limited to today's work date.
  const openQuery = m.calls.filter((call) => call.table === "attendance_records" && call.method === "is");
  expect(openQuery[0]?.args).toEqual(["clock_out_at", null]);
});

it("says not clocked in when there is no open shift", async () => {
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText("Chưa vào ca")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Vào ca" })).toBeTruthy();
});
