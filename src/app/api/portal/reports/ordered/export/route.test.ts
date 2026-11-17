// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const portal = vi.hoisted(() => ({ rpc: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));
vi.mock("@/modules/portal/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/portal/server")>()),
  authenticatedPortalClient: portal.client, portalRpc: portal.rpc,
}));

import { GET } from "./route";
import { PortalRpcError } from "@/modules/portal/server";
import { rawOrderedReport } from "@/test/ordered-report-fixture";

const customerId = "11111111-1111-4111-8111-111111111111";
const url = (query: string) => `http://localhost/api/portal/reports/ordered/export?${query}`;
const get = (query: string, headers: Record<string, string> = {}) => GET(new Request(url(query), { headers }));

function database(report: ReturnType<typeof rawOrderedReport> | PortalRpcError) {
  portal.rpc.mockImplementation(async (_client: unknown, name: string) => {
    if (name === "customer_portal_snapshot") return { customer: { id: customerId, code: "KH1", display_name: "Anh Minh - Công trình Lô B7" } };
    if (report instanceof PortalRpcError) throw report;
    return report;
  });
}

beforeEach(() => {
  portal.client.mockReset().mockResolvedValue({ supabase: {} });
  portal.rpc.mockReset();
  database(rawOrderedReport({ from: "2026-11-11", to: "2026-11-17" }));
});

it("sends the report as a CSV with the period and customer in the title block, a money column and no formula risk", async () => {
  const response = await get("format=csv&from=2026-11-11&to=2026-11-17");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
  expect(response.headers.get("content-disposition")).toContain("hang-da-dat_2026-11-11_2026-11-17.csv");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const text = await response.text();
  expect(text).toContain('"Khách hàng","Anh Minh - Công trình Lô B7"');
  expect(text).toContain('"Kỳ","11/11/2026 – 17/11/2026"');
  expect(text).toContain('"Hàng hóa","ĐVT","Đặt","Đã giao","Còn lại","Tiền"');
  expect(text).toContain('"Gạch đặc","viên",1000,600,400,1300000');
  expect(text).toContain('"Cát đen","xe",2,2,0,1300000');
  expect(text).toContain('"Dịch vụ: Máy xúc","ca",1,,,1800000');
  expect(portal.rpc).toHaveBeenCalledWith({}, "customer_portal_ordered_report", { target_customer_id: customerId, from_day: "2026-11-11", to_day: "2026-11-17" });
});

it("neutralises a goods name that a spreadsheet would run as a formula", async () => {
  const report = rawOrderedReport();
  report.goods[0].name = "=HYPERLINK(\"http://x\")";
  database(report);
  const text = await (await get("format=csv&from=2026-11-11&to=2026-11-17")).text();
  expect(text).toContain(`"'=HYPERLINK(""http://x"")"`);
});

it("sends an Excel file with the right type and file name", async () => {
  const response = await get("format=xlsx&from=2026-11-11&to=2026-11-17");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  expect(response.headers.get("content-disposition")).toContain("hang-da-dat_2026-11-11_2026-11-17.xlsx");
  expect(new Uint8Array(await response.arrayBuffer()).slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
});

it("leaves the money column out of a receiver's file", async () => {
  database(rawOrderedReport({ money: false }));
  const text = await (await get("format=csv&from=2026-11-11&to=2026-11-17")).text();
  expect(text).toContain('"Hàng hóa","ĐVT","Đặt","Đã giao","Còn lại"\r\n');
  expect(text).not.toContain("Tiền");
  expect(text).not.toContain("Tổng tiền");
  expect(text).not.toMatch(/1300000|860000|5260000|1800000/);
});

it("needs a signed-in portal account", async () => {
  portal.client.mockResolvedValue(null);
  expect((await get("format=csv&from=2026-11-11&to=2026-11-17")).status).toBe(401);
  expect(portal.rpc).not.toHaveBeenCalled();
});

it("refuses a request sent by a page of another site", async () => {
  const response = await get("format=csv&from=2026-11-11&to=2026-11-17", { origin: "https://evil.example", host: "localhost" });
  expect(response.status).toBe(403);
  expect(portal.rpc).not.toHaveBeenCalled();
});

it("refuses a wrong or too long period before asking the database", async () => {
  expect((await get("format=csv&from=17/11/2026&to=2026-11-17")).status).toBe(400);
  expect((await get("format=csv&from=2026-11-18&to=2026-11-17")).status).toBe(400);
  expect((await get("format=csv&from=2026-01-01&to=2026-11-17")).status).toBe(400);
  expect(portal.rpc).not.toHaveBeenCalled();
});

it("passes the database's refusal on in plain words", async () => {
  database(new PortalRpcError({ code: "42501", message: "forbidden" }));
  const response = await get("format=csv&from=2026-11-11&to=2026-11-17");
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "Tài khoản này chưa xem được báo cáo." });
  database(new PortalRpcError({ code: "22023", message: "invalid_report_period" }));
  expect((await get("format=csv&from=2026-11-11&to=2026-11-17")).status).toBe(400);
  database(new PortalRpcError({ code: "08006", message: "connection failure" }));
  const failed = await get("format=csv&from=2026-11-11&to=2026-11-17");
  expect(failed.status).toBe(503);
  expect((await failed.json()).error).not.toMatch(/08006|connection/);
});
