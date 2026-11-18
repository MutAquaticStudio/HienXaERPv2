import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { OrderedReportView } from "./ordered-report";
import { orderedReport } from "@/test/ordered-report-fixture";
import { resolveOrderedPeriod } from "@/modules/portal/ordered-report";
import type { OrderedReportResult } from "@/modules/portal/ordered-report-schema";

const TODAY = "2026-11-17";
const ok = (options: Parameters<typeof orderedReport>[0] = {}): OrderedReportResult => ({ status: "ok", report: orderedReport(options) });
const show = (query: { from?: string; to?: string; day?: string }, result: OrderedReportResult, dayResult: OrderedReportResult | null = null) =>
  render(<OrderedReportView period={resolveOrderedPeriod(query, TODAY)} today={TODAY} result={result} dayResult={dayResult} />);

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("a period of several days (owner / money)", () => {
  const week = { from: "2026-11-11", to: "2026-11-17" };

  it("shows the period chips with the chosen one marked, and the date boxes in dd/mm/yyyy", () => {
    show(week, ok());
    const chips = screen.getByRole("group", { name: "Chọn nhanh kỳ" });
    expect(within(chips).getAllByRole("link").map((link) => link.textContent)).toEqual(["Hôm nay", "Hôm qua", "7 ngày", "Tháng này"]);
    expect(within(chips).getByRole("link", { name: "7 ngày" })).toHaveAttribute("aria-current", "true");
    expect(within(chips).getByRole("link", { name: "Hôm qua" })).toHaveAttribute("href", "/customer/reports/ordered?from=2026-11-16&to=2026-11-16");
    expect(screen.getByLabelText("Từ ngày")).toHaveValue("11/11/2026");
    expect(screen.getByLabelText("Đến ngày")).toHaveValue("17/11/2026");
    expect(screen.getByRole("status")).toHaveTextContent("Kỳ 11/11/2026 – 17/11/2026 · tự áp dụng khi anh/chị chọn xong");
  });

  it("shows the four figures, with the cancelled orders told apart and the money split", () => {
    show(week, ok());
    expect(screen.getByText("Số đơn").closest("div")).toHaveTextContent("61 đơn đã hủy, không tính");
    expect(screen.getByText("Số loại hàng").closest("div")).toHaveTextContent("3gộp theo từng loại hàng");
    expect(screen.getByText("Đã giao", { selector: "dt" }).closest("div")).toHaveTextContent("1/3loại đã giao đủ");
    expect(screen.getByText("Tổng tiền").closest("div")).toHaveTextContent("5.260.000 ₫hàng 3.460.000 ₫ · dịch vụ 1.800.000 ₫");
  });

  it("lists each kind of goods with Đặt / Đã giao / Còn lại / tiền, quantities exact", () => {
    show(week, ok());
    const goods = screen.getByRole("region", { name: "Hàng đã đặt" });
    const rows = goods.querySelectorAll("details");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Cát đen1.300.000 ₫Đặt2 xeĐã giao2Còn lại0 · đủ");
    expect(rows[1]).toHaveTextContent("Gạch đặc1.300.000 ₫Đặt1.000 viênĐã giao600Còn lại400");
    expect(rows[2]).toHaveTextContent("Xi măng Bút Sơn PC30860.000 ₫Đặt10 baoĐã giao0Còn lại10");
    expect(within(goods).getByText("3 dòng")).toBeInTheDocument();
    expect(goods).toHaveTextContent("Tổng cộng");
    expect(goods).toHaveTextContent("3 loại hàng · 6 đơn");
    expect(goods).toHaveTextContent("3.460.000 ₫");
  });

  it("opens a row to the orders the goods came from, each linking to the order", () => {
    show(week, ok());
    const brick = screen.getByText("Gạch đặc").closest("details")!;
    fireEvent.click(within(brick).getByText("Gạch đặc"));
    brick.open = true;
    expect(within(brick).getByText("Nằm trong 2 đơn")).toBeInTheDocument();
    const links = within(brick).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/customer/orders/o2", "/customer/orders/o3"]);
    expect(links[0]).toHaveTextContent("SO-2026-000415Đặt 16/11/2026 · 600 viênĐang giao");
    expect(links[1]).toHaveTextContent("Chờ duyệt");
  });

  it("lists the days, newest first, each a link that picks that day", () => {
    show(week, ok());
    const days = screen.getByRole("region", { name: "Theo ngày" });
    const links = within(days).getAllByRole("link");
    expect(links.map((link) => link.querySelector("strong")?.textContent)).toEqual(["Thứ Ba, 17/11", "Thứ Hai, 16/11", "Chủ Nhật, 15/11", "Thứ Sáu, 13/11"]);
    expect(links[1]).toHaveTextContent("4 đơn · 2 loại hàng2.170.000 ₫");
    expect(links[2]).toHaveTextContent("1 dịch vụ1.800.000 ₫");
    expect(links[1]).toHaveAttribute("href", "/customer/reports/ordered?from=2026-11-11&to=2026-11-17&day=2026-11-16");
  });

  it("filters to one day with a bar that clears the filter, and the goods follow that day", () => {
    const day = ok({ from: "2026-11-16", to: "2026-11-16" });
    if (day.status === "ok") { day.report.goods = day.report.goods.slice(0, 1); day.report.services = []; day.report.order_count = 1; day.report.total_vnd = "1300000"; }
    show({ ...week, day: "2026-11-16" }, ok(), day);
    expect(screen.getByText("Đang xem ngày Thứ Hai, 16/11")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bỏ lọc ngày" })).toHaveAttribute("href", "/customer/reports/ordered?from=2026-11-11&to=2026-11-17");
    const goods = screen.getByRole("region", { name: "Hàng đã đặt" });
    expect(goods.querySelectorAll("details")).toHaveLength(1);
    expect(goods).toHaveTextContent("1 loại hàng · ngày 16/11");
    expect(screen.queryByRole("region", { name: "Dịch vụ" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Theo ngày" })).getByRole("link", { name: /Thứ Hai, 16\/11/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: /Xuất Excel/ })).toHaveAttribute("href", "/api/portal/reports/ordered/export?format=xlsx&from=2026-11-16&to=2026-11-16");
  });

  it("says so when the picked day cannot be loaded, instead of showing the wrong goods", () => {
    show({ ...week, day: "2026-11-16" }, ok(), { status: "error" });
    expect(screen.getByRole("region", { name: "Hàng đã đặt" })).toHaveTextContent("Chưa tải được hàng của ngày này");
    expect(screen.getByRole("link", { name: "Bỏ lọc ngày" })).toBeInTheDocument();
  });

  it("lists the services of the period and the export buttons with the update time", () => {
    show(week, ok());
    const services = screen.getByRole("region", { name: "Dịch vụ" });
    expect(services).toHaveTextContent("Máy xúc · 1 ca1.800.000 ₫Ngày 15/11/2026");
    expect(screen.getByRole("link", { name: /Xuất Excel/ })).toHaveAttribute("href", "/api/portal/reports/ordered/export?format=xlsx&from=2026-11-11&to=2026-11-17");
    expect(screen.getByRole("link", { name: /Xuất CSV/ })).toHaveAttribute("href", "/api/portal/reports/ordered/export?format=csv&from=2026-11-11&to=2026-11-17");
    expect(screen.getByText(/Cập nhật đến 08:46 ngày 17\/11\/2026\. Đơn đã hủy không tính \(1 đơn trong kỳ\)\./)).toBeInTheDocument();
  });
});

describe("a receiver (no money)", () => {
  it("shows goods and quantities only: no money card, no amounts, no total in money", () => {
    const { container } = show({ from: "2026-11-11", to: "2026-11-17" }, ok({ money: false }));
    expect(screen.queryByText("Tổng tiền")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/₫|đ\b.*\d{3}\.\d{3}/);
    expect(container.textContent).not.toContain("1.300.000");
    expect(screen.getByRole("region", { name: "Hàng đã đặt" })).toHaveTextContent("Cát đenĐặt2 xe");
    expect(screen.getByRole("region", { name: "Hàng đã đặt" })).toHaveTextContent("Tổng cộng3 loại hàng · 6 đơn");
    expect(screen.getByRole("region", { name: "Dịch vụ" })).toHaveTextContent("Máy xúc · 1 ca");
  });
});

describe("one day", () => {
  it("has no 'Theo ngày' list and tells the day in words", () => {
    show({ from: TODAY, to: TODAY }, ok({ from: TODAY, to: TODAY }));
    expect(screen.queryByRole("region", { name: "Theo ngày" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Ngày 17/11/2026 · tự áp dụng khi anh/chị chọn xong");
    expect(screen.getByRole("link", { name: "Hôm nay" })).toHaveAttribute("aria-current", "true");
  });
});

describe("empty, error and refusal", () => {
  it("offers another day when nothing was ordered, and mentions cancelled orders", () => {
    const empty = ok();
    if (empty.status === "ok") { Object.assign(empty.report, { order_count: 0, goods: [], days: [], services: [], material_kinds: 0, delivered_kinds: 0, cancelled_count: 2 }); }
    show({}, empty);
    expect(screen.getByText("Chưa có đơn trong khoảng này.")).toBeInTheDocument();
    expect(screen.getByText("2 đơn đã hủy, không tính.")).toBeInTheDocument();
    const input = screen.getByLabelText("Từ ngày");
    fireEvent.click(screen.getByRole("button", { name: "Chọn ngày khác" }));
    expect(input).toHaveFocus();
    expect(screen.queryByRole("link", { name: /Xuất/ })).not.toBeInTheDocument();
  });

  it("says 'Chưa tải được.' with a retry that asks the server again, and shows no technical text", () => {
    const { container } = show({ from: TODAY, to: TODAY }, { status: "error" });
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa tải được.");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toMatch(/forbidden|invalid_|42501|22023|undefined|null/i);
    expect(screen.getByLabelText("Từ ngày")).toBeInTheDocument();
  });

  it("explains a refusal in plain words", () => {
    show({}, { status: "forbidden" });
    expect(screen.getByText("Tài khoản này chưa xem được báo cáo.")).toBeInTheDocument();
  });

  it("asks for another period when the database refuses it", () => {
    show({ from: "2026-05-01", to: "2026-11-17" }, { status: "period" });
    expect(screen.getByRole("status")).toHaveTextContent("Chọn tối đa 92 ngày");
  });
});

describe("a wrong address", () => {
  it("shows today with a plain sentence and keeps what was written in the boxes", () => {
    show({ from: "hôm qua", to: "2026-11-17" }, ok({ from: TODAY, to: TODAY }));
    expect(screen.getByRole("status")).toHaveTextContent(/Ngày chưa đúng.*Đang hiện hôm nay/);
    expect(screen.getByLabelText("Từ ngày")).toHaveValue("hôm qua");
    expect(screen.getByLabelText("Đến ngày")).toHaveValue("17/11/2026");
    expect(screen.getByLabelText("Từ ngày")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("typing the period", () => {
  it("applies by itself once both dates are real, putting the period in the address", () => {
    show({ from: "2026-11-11", to: "2026-11-17" }, ok());
    fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "01/11/2026" } });
    expect(router.replace).toHaveBeenCalledWith("/customer/reports/ordered?from=2026-11-01&to=2026-11-17");
  });

  it("waits while a date is still being typed and says so when a finished date is wrong or the period too long", () => {
    show({ from: "2026-11-11", to: "2026-11-17" }, ok());
    const from = screen.getByLabelText("Từ ngày");
    fireEvent.change(from, { target: { value: "01/11/20" } });
    expect(router.replace).not.toHaveBeenCalled();
    fireEvent.change(from, { target: { value: "31/02/2026" } });
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Ngày chưa đúng");
    expect(from).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(from, { target: { value: "01/01/2026" } });
    expect(screen.getByRole("status")).toHaveTextContent("Chọn tối đa 92 ngày mỗi lần.");
    fireEvent.change(from, { target: { value: "18/11/2026" } });
    expect(screen.getByRole("status")).toHaveTextContent("Ngày bắt đầu phải trước hoặc cùng ngày kết thúc.");
    expect(router.replace).not.toHaveBeenCalled();
  });
});
