import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ snapshot: vi.fn(), report: vi.fn() }));
vi.mock("@/modules/portal/actions", () => ({ getCustomerPortalSnapshot: m.snapshot, loadOrderedReport: m.report }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }) }));

import Page from "./page";
import { businessDay, shiftBusinessDay } from "@/lib/core/business-time";
import { orderedReport } from "@/test/ordered-report-fixture";

const customerId = "11111111-1111-4111-8111-111111111111";
const open = async (query: { from?: string; to?: string; day?: string } = {}) => render(await Page({ searchParams: Promise.resolve(query) }));
beforeEach(() => {
  vi.clearAllMocks();
  m.snapshot.mockResolvedValue({ customer: { id: customerId, code: "KH1", display_name: "Anh Minh" }, membership_role: "OWNER" });
  m.report.mockImplementation(async ({ from, to }: { from: string; to: string }) => ({ status: "ok", report: orderedReport({ from, to }) }));
});
afterEach(cleanup);

it("shows today when the address has no period, asking for exactly that day", async () => {
  await open();
  const today = businessDay();
  expect(m.report).toHaveBeenCalledTimes(1);
  expect(m.report).toHaveBeenCalledWith({ customerId, from: today, to: today });
  expect(screen.getByRole("heading", { name: "Báo cáo hàng đã đặt" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Hôm nay" })).toHaveAttribute("aria-current", "true");
});

it("asks for the period of the address, and for the picked day as a second call", async () => {
  await open({ from: "2026-11-11", to: "2026-11-17", day: "2026-11-16" });
  expect(m.report).toHaveBeenCalledWith({ customerId, from: "2026-11-11", to: "2026-11-17" });
  expect(m.report).toHaveBeenCalledWith({ customerId, from: "2026-11-16", to: "2026-11-16" });
  expect(screen.getByText("Đang xem ngày Thứ Hai, 16/11")).toBeInTheDocument();
});

it("shows today with a plain sentence for a wrong period and does not send the wrong one to the database", async () => {
  await open({ from: "17-17-2026", to: "2026-11-17" });
  const today = businessDay();
  expect(m.report).toHaveBeenCalledTimes(1);
  expect(m.report).toHaveBeenCalledWith({ customerId, from: today, to: today });
  expect(screen.getByRole("status")).toHaveTextContent(/Ngày chưa đúng.*Đang hiện hôm nay/);
  expect(screen.getByLabelText("Từ ngày")).toHaveValue("17-17-2026");
});

it("shows the error panel when the report cannot be loaded, and the refusal when it is not allowed", async () => {
  m.report.mockResolvedValue({ status: "error" });
  await open();
  expect(screen.getByRole("alert")).toHaveTextContent("Chưa tải được.");
  cleanup();
  m.report.mockResolvedValue({ status: "forbidden" });
  await open();
  expect(screen.getByText("Tài khoản này chưa xem được báo cáo.")).toBeInTheDocument();
});

it("hides money for a receiver as the database says", async () => {
  m.report.mockImplementation(async ({ from, to }: { from: string; to: string }) => ({ status: "ok", report: orderedReport({ from, to, money: false }) }));
  await open({ from: shiftBusinessDay(businessDay(), -6), to: businessDay() });
  expect(screen.queryByText("Tổng tiền")).not.toBeInTheDocument();
  expect(screen.queryByText(/₫/)).not.toBeInTheDocument();
});
