import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/modules/delivery/dispatch-actions", () => ({ autoDispatchDayAction: vi.fn(), applyDispatchProposalAction: vi.fn(), quickAssignDeliveryAction: vi.fn() }));
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
  expect(screen.getByRole("button", { name: "Áp dụng gợi ý" })).toBeInTheDocument();
  expect(screen.getByText("Gợi ý")).toBeInTheDocument();
});

it("hides dispatch buttons without the right to assign", () => {
  render(<DispatchDayBoard day="2026-10-20" board={board} canAssign={false} />);
  expect(screen.queryByRole("button", { name: "Tự chia việc" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Áp dụng gợi ý" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Gán" })).not.toBeInTheDocument();
});

const assign = { drivers: [{ id: "11111111-1111-4111-8111-111111111111", label: "Đại" }], vehicles: [{ id: "22222222-2222-4222-8222-222222222222", label: "29-44667 · Rảnh" }],
  versions: { d2: 3 }, stopMinutes: 45 };
const many: DispatchDay = { ...board, waiting: Array.from({ length: 8 }, (_, index) => ({ id: `w${index}`, number: `DL-2026-00010${index}`,
  customer: index === 7 ? "Anh Hoàn CT1" : `Khách ${index}`, site: `Công trình ${index}`, start: null, proposal: null, declined: null })) };

it("assigns a waiting delivery right on its row with a driver, a truck and a time from the suggestion", () => {
  render(<DispatchDayBoard day="2026-10-20" board={board} canAssign assign={assign} />);
  fireEvent.click(screen.getByRole("button", { name: "Gán" }));
  const form = screen.getByRole("form", { name: "Gán người và xe cho DL-2026-000002" });
  const hidden = Object.fromEntries([...form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')].map((input) => [input.name, input.value]));
  expect(hidden).toMatchObject({ deliveryId: "d2", version: "3", day: "2026-10-20" });
  expect(hidden.operationId).toMatch(/^[0-9a-f-]{36}$/);
  expect(within(form).getByLabelText("Bắt đầu")).toHaveValue("2026-10-20T09:00");
  expect(within(form).getByLabelText("Kết thúc")).toHaveValue("2026-10-20T09:45");
  expect(within(form).getByLabelText("Người giao")).toBeRequired();
  expect(within(form).getByRole("option", { name: "29-44667 · Rảnh" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});

it("keeps a long waiting list in one scrolling table and finds a delivery by customer without accents", () => {
  render(<DispatchDayBoard day="2026-10-20" board={many} canAssign assign={assign} />);
  expect(screen.getByText(/Chờ điều phối \(8\)/)).toBeInTheDocument();
  const table = screen.getByRole("table");
  expect(table.closest(".dispatch-waiting-scroll")).not.toBeNull();
  expect(within(table).getAllByRole("row")).toHaveLength(9);
  fireEvent.change(screen.getByPlaceholderText("Tìm mã phiếu, khách, công trình"), { target: { value: "hoan" } });
  expect(within(table).getAllByRole("row")).toHaveLength(2);
  expect(within(table).getByText("Anh Hoàn CT1")).toBeInTheDocument();
  // A delivery without its version (not loaded) cannot be assigned from the board.
  expect(screen.queryByRole("button", { name: "Gán" })).not.toBeInTheDocument();
});
