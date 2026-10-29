import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import { ProfitLineChart } from "./profit-line-chart";
import type { ProfitSeries } from "@/modules/reports/profit-series";

afterEach(cleanup);

const ready = (value: string) => ({ value_vnd: value, quality: "READY" as const });
const series: ProfitSeries = {
  granularity: "DAY", from: "2026-10-01T00:00:00+07:00", to: "2026-10-04T00:00:00+07:00",
  points: [
    { start: "2026-10-01T00:00:00+07:00", end: "2026-10-02T00:00:00+07:00", revenue: ready("1000000"), total_cost: ready("400000"), net_profit: ready("600000") },
    { start: "2026-10-02T00:00:00+07:00", end: "2026-10-03T00:00:00+07:00", revenue: ready("0"), total_cost: { quality: "INCOMPLETE" }, net_profit: { quality: "INCOMPLETE" } },
    { start: "2026-10-03T00:00:00+07:00", end: "2026-10-04T00:00:00+07:00", revenue: ready("2000000"), total_cost: ready("2500000"), net_profit: ready("-500000") },
  ],
};

it("draws one line per series with a gap where data is incomplete", () => {
  const { container } = render(<ProfitLineChart series={series} />);
  const paths = container.querySelectorAll("svg path");
  expect(paths).toHaveLength(3);
  // Chi and Lợi nhuận skip the INCOMPLETE middle day: two move commands, no zero point drawn.
  expect(paths[1].getAttribute("d")?.match(/M/g)).toHaveLength(2);
  expect(paths[0].getAttribute("d")?.match(/M/g)).toHaveLength(1);
  expect(screen.getByRole("list", { name: "Chú giải" })).toHaveTextContent("Thu");
});

it("shows every series at the focused day, with the reason instead of a zero", () => {
  render(<ProfitLineChart series={series} />);
  const chart = screen.getByRole("img");
  fireEvent.focus(chart);
  fireEvent.keyDown(chart, { key: "ArrowLeft" });
  const tooltip = screen.getByRole("status");
  expect(tooltip).toHaveTextContent("Ngày 02/10/2026");
  expect(tooltip).toHaveTextContent("Thu: 0");
  expect(tooltip).toHaveTextContent("Chi: — (Chưa đủ hoặc chưa khớp giá vốn)");
});

it("hides a series that is never applicable and says why", () => {
  const na = { quality: "NOT_APPLICABLE" as const };
  render(<ProfitLineChart series={{ ...series, points: series.points.map((item) => ({ ...item, total_cost: na, net_profit: na })) }} />);
  expect(screen.getByText("Không vẽ “Chi”: Chi phí chung chưa phân bổ theo bộ lọc này.")).toBeInTheDocument();
  expect(screen.getByText("Không vẽ “Lợi nhuận”: Chi phí chung chưa phân bổ theo bộ lọc này.")).toBeInTheDocument();
});

it("offers the same numbers as a table", () => {
  render(<ProfitLineChart series={series} />);
  const table = screen.getByRole("table");
  const rows = within(table).getAllByRole("row");
  expect(rows).toHaveLength(4);
  expect(rows[3]).toHaveTextContent("-500.000");
});

it("server-renders the chart title text, so hydration matches the browser", () => {
  const html = renderToString(<ProfitLineChart series={series} />);
  expect(html).toMatch(/<title id="[^"]+">Biểu đồ đường Thu, Chi và Lợi nhuận theo ngày\. Dùng phím mũi tên để xem từng kỳ\.<\/title>/);
});

it("explains an empty period instead of drawing", () => {
  render(<ProfitLineChart series={{ ...series, points: [] }} />);
  expect(screen.getByText("Kỳ đã chọn chưa bắt đầu nên chưa có số liệu để vẽ.")).toBeInTheDocument();
});

it("lists only the periods with figures, with the whole period first (FB18)", () => {
  const quiet: ProfitSeries = { ...series, points: [series.points[0], { ...series.points[0], start: "2026-10-05T00:00:00+07:00", end: "2026-10-06T00:00:00+07:00",
    revenue: ready("0"), total_cost: ready("0"), net_profit: ready("0") }, series.points[2]] };
  render(<ProfitLineChart series={quiet} />);
  expect(screen.getByText("Xem bảng số liệu · 2 ngày có phát sinh")).toBeInTheDocument();
  const rows = screen.getAllByRole("row").slice(1);
  expect(rows.map((row) => (row as HTMLTableRowElement).cells[0].textContent)).toEqual(["Cả kỳ", "Ngày 01/10/2026", "Ngày 03/10/2026"]);
  expect(rows[0]).toHaveTextContent("3.000.000");
});
