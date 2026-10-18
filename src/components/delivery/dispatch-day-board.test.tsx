import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/modules/delivery/dispatch-actions", () => ({ autoDispatchDayAction: vi.fn(), applyDispatchProposalAction: vi.fn() }));
import { DispatchDayBoard, type DispatchDay } from "./dispatch-day-board";

afterEach(cleanup);
const board: DispatchDay = {
  mode: "SUGGEST",
  drivers: [
    { employee_id: "e1", name: "Tài xế A", vehicles: [{ id: "v1", code: "XE1", plate: "29C-111.11" }],
      deliveries: [{ id: "d1", number: "DL-2026-000001", customer: "Khách 1", site: "Công trình 1", state: "ASSIGNED", start: "2026-10-20T02:00:00Z", end: "2026-10-20T03:00:00Z", vehicle: "29C-111.11" }] },
    { employee_id: "e2", name: "Tài xế B", vehicles: [{ id: "v2", code: "XE2", plate: "29C-222.22" }], deliveries: [] },
  ],
  waiting: [{ id: "d2", number: "DL-2026-000002", customer: "Khách 2", site: "Công trình 2", start: null,
    proposal: { reason: "XE2 / Tài xế B — rảnh lúc 09:00 20/10, 0 phiếu khác trong ngày", start: "2026-10-20T02:00:00Z" }, declined: "Tài xế C: Xe hỏng lốp" }],
};

it("shows each driver's day by time, the waiting deliveries with proposals and the decline reason", () => {
  render(<DispatchDayBoard day="2026-10-20" board={board} canAssign />);
  const a = screen.getByText("Tài xế A").closest("article")!;
  expect(a).toHaveTextContent("09:00–10:00");
  expect(within(a).getByRole("link", { name: "DL-2026-000001" })).toHaveAttribute("href", "/admin/deliveries/d1");
  expect(screen.getByText("Tài xế B").closest("article")).toHaveTextContent("Rảnh cả ngày.");
  expect(screen.getByText(/Chờ điều phối \(1\)/)).toBeInTheDocument();
  expect(screen.getByText(/Gợi ý: XE2 \/ Tài xế B/)).toBeInTheDocument();
  expect(screen.getByText("Thợ đã từ chối: Tài xế C: Xe hỏng lốp")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Tự chia việc" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Áp dụng" })).toBeInTheDocument();
  expect(screen.getByText("Gợi ý")).toBeInTheDocument();
});

it("hides dispatch buttons without the right to assign", () => {
  render(<DispatchDayBoard day="2026-10-20" board={board} canAssign={false} />);
  expect(screen.queryByRole("button", { name: "Tự chia việc" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Áp dụng" })).not.toBeInTheDocument();
});
