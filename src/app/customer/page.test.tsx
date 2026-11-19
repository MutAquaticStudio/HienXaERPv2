import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ snapshot: vi.fn(), requests: vi.fn(), report: vi.fn() }));
vi.mock("@/modules/portal/actions", () => ({ getCustomerPortalSnapshot: m.snapshot, loadOrderedReport: m.report, requestQuotationChangeAction: vi.fn() }));
vi.mock("@/modules/portal/service-actions", () => ({ getCustomerServiceRequests: m.requests }));

import Page from "./page";
import { businessDay, shiftBusinessDay } from "@/lib/core/business-time";
import { orderedReport } from "@/test/ordered-report-fixture";

const customerId = "11111111-1111-4111-8111-111111111111";
const yesterday = () => shiftBusinessDay(businessDay(), -1);
const open = async () => render(await Page({ searchParams: Promise.resolve({}) }));
beforeEach(() => {
  vi.clearAllMocks();
  m.snapshot.mockResolvedValue({ customer: { id: customerId, code: "KH1", display_name: "Anh Minh" }, membership_role: "OWNER", can_view_debt: false, debt: null, quotation: null, orders: [], payment_notices: [] });
  m.requests.mockResolvedValue({ customer_id: customerId, membership_role: "OWNER", requests: [] });
  m.report.mockImplementation(async () => ({ status: "ok", report: orderedReport({ from: yesterday(), to: yesterday() }) }));
});
afterEach(cleanup);

it("tells what was ordered yesterday, with a link to the report of that day (D98)", async () => {
  await open();
  expect(m.report).toHaveBeenCalledWith({ customerId, from: yesterday(), to: yesterday() });
  const row = screen.getByRole("link", { name: /Hôm qua anh\/chị đặt 3 món/ });
  expect(row).toHaveAttribute("href", `/customer/reports/ordered?from=${yesterday()}&to=${yesterday()}`);
  expect(row).toHaveTextContent("Cát đen 2 xe · Gạch đặc 1.000 viên · và 1 món khác · Tổng 5.260.000 ₫");
  expect(row).toHaveTextContent("Xem báo cáo");
});

it("leaves the total out for a receiver", async () => {
  m.report.mockImplementation(async () => ({ status: "ok", report: orderedReport({ money: false }) }));
  await open();
  const row = screen.getByRole("link", { name: /Hôm qua anh\/chị đặt 3 món/ });
  expect(row.textContent).not.toMatch(/Tổng|₫/);
});

it("shows no row when yesterday has no order that counts", async () => {
  m.report.mockImplementation(async () => ({ status: "ok", report: { ...orderedReport(), order_count: 0, goods: [], material_kinds: 0 } }));
  await open();
  expect(screen.queryByText(/Hôm qua anh\/chị đặt/)).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Anh Minh" })).toBeInTheDocument();
});

it.each([
  ["refuses", () => m.report.mockResolvedValue({ status: "forbidden" })],
  ["fails", () => m.report.mockResolvedValue({ status: "error" })],
  ["throws", () => m.report.mockRejectedValue(new Error("network"))],
])("never breaks the home page when the report %s: the row is simply left out", async (_name, arrange) => {
  arrange();
  await open();
  expect(screen.queryByText(/Hôm qua anh\/chị đặt/)).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Anh Minh" })).toBeInTheDocument();
});
