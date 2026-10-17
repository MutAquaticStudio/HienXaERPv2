import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permissions: new Set<string>(), workspace: {} as Record<string, unknown> }));
vi.mock("@/modules/routing/actions", () => ({ applyRoutePlanAction: vi.fn(), createRoutePlanAction: vi.fn() }));
vi.mock("@/modules/routing/server", () => ({
  loadRoutingWorkspace: async () => ({ access: { permissions: m.permissions }, ...m.workspace }),
  loadFleetSnapshot: async () => [],
}));

import Page from "./page";

const deliveries = [
  { id: "d1", delivery_number: "GH-001", site_name_snapshot: "Nhà anh Tâm", delivery_address_snapshot: "12 Lê Lợi", scheduled_at: null, scheduled_end_at: null, execution_state: "PLANNED", version: 1 },
  { id: "d2", delivery_number: "GH-002", site_name_snapshot: "Kho chị Lan", delivery_address_snapshot: "5 Trần Phú", scheduled_at: "2200-03-01T00:30:00.000Z", scheduled_end_at: "2200-03-01T01:30:00.000Z", execution_state: "PLANNED", version: 1 },
  { id: "d3", delivery_number: "GH-003", site_name_snapshot: "Trường học", delivery_address_snapshot: "1 Hùng Vương", scheduled_at: "2200-03-05T01:00:00.000Z", scheduled_end_at: null, execution_state: "PLANNED", version: 1 },
];

beforeEach(() => {
  m.permissions = new Set(["delivery.read", "delivery.assign"]);
  m.workspace = {
    plans: [{ id: "p1", departure_at: "2200-03-01T00:00:00.000Z", vehicle_id: "v1", driver_employee_id: "e1", provider_state: "MANUAL_FALLBACK", status: "DRAFT", version: 1 }],
    deliveries,
    vehicles: [{ id: "v1", plate_number: "29C-123.45" }],
    employees: [{ id: "e1", display_name: "Tài xế Minh" }],
    selectedPlan: null,
    stops: [],
    stopCounts: new Map([["p1", 2]]),
    stopDeliveries: [],
  };
});
afterEach(cleanup);

it("lists recent routes as a table and lays out the planner in three steps", async () => {
  render(await Page({ searchParams: Promise.resolve({}) }));
  const list = screen.getByRole("heading", { name: "Lộ trình gần đây" }).closest("section")!;
  const row = within(list).getByRole("link", { name: "01/03/2200 07:00" }).closest("tr")!;
  expect(within(row).getByText("29C-123.45 · Tài xế Minh")).toBeInTheDocument();
  expect(within(row).getByText("2")).toBeInTheDocument();
  expect(within(row).getByText("Bản đề xuất")).toBeInTheDocument();
  expect(screen.getByText("Chọn phiếu giao")).toBeInTheDocument();
  expect(screen.getByText("Xe, tài xế và giờ đi")).toBeInTheDocument();
  expect(screen.getByText("Thứ tự và giờ dự kiến")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Lộ trình đang xem" })).not.toBeInTheDocument();
});

it("shows each stop's expected time, keeps scheduled deliveries and warns about overlaps before submitting", async () => {
  render(await Page({ searchParams: Promise.resolve({}) }));
  fireEvent.change(screen.getByLabelText("Ngày giao"), { target: { value: "2200-03-01" } });
  expect(screen.queryByLabelText("Chọn GH-003")).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Chọn GH-001"));
  fireEvent.click(screen.getByLabelText("Chọn GH-002"));
  fireEvent.change(screen.getByLabelText("Giờ khởi hành thực tế (giờ địa phương)"), { target: { value: "2200-03-01T07:00" } });
  const stops = screen.getByText("Thứ tự và giờ dự kiến").closest("fieldset")!;
  expect(within(stops).getByText("Giờ dự kiến: 07:00–08:00 · 01/03")).toBeInTheDocument();
  expect(within(stops).getByText("Giữ lịch phiếu: 07:30–08:30 · 01/03")).toBeInTheDocument();
  expect(within(stops).getAllByText("Lịch chồng với điểm khác trên cùng xe; áp dụng sẽ bị từ chối.")).toHaveLength(2);
  expect((document.querySelector("input[name=departure_at_iso]") as HTMLInputElement).value).toBe("2200-03-01T00:00:00.000Z");
  // GH-002 first: it keeps 07:30–08:30, GH-001 then gets the second slot (08:00–09:00), still overlapping.
  fireEvent.change(screen.getByLabelText(/Thời gian mỗi điểm \(phút\)/), { target: { value: "90" } });
  expect(within(stops).getByText("Giờ dự kiến: 07:00–08:30 · 01/03")).toBeInTheDocument();
  fireEvent.click(within(stops).getByLabelText("Đưa GH-002 lên"));
  expect(within(stops).getByText("Giờ dự kiến: 08:30–10:00 · 01/03")).toBeInTheDocument();
  expect(within(stops).queryByText("Lịch chồng với điểm khác trên cùng xe; áp dụng sẽ bị từ chối.")).not.toBeInTheDocument();
});

it("opens a plan with the schedule each delivery will get when applied", async () => {
  m.workspace = { ...m.workspace,
    selectedPlan: { id: "p1", departure_at: "2200-03-01T00:00:00.000Z", vehicle_id: "v1", driver_employee_id: "e1", provider_state: "MANUAL_FALLBACK", provider_error_safe: null, status: "DRAFT", version: 1 },
    stops: [
      { id: "s1", stop_order: 1, delivery_id: "d1", latitude: null, longitude: null, address_snapshot: "12 Lê Lợi", time_window_snapshot: null, capacity_warning: null, time_window_warning: "Công trình chưa có khung giờ nhận hàng.", planned_start_at: "2200-03-01T00:00:00.000Z", planned_end_at: "2200-03-01T01:00:00.000Z" },
      { id: "s2", stop_order: 2, delivery_id: "d2", latitude: null, longitude: null, address_snapshot: "5 Trần Phú", time_window_snapshot: "7h–17h", capacity_warning: null, time_window_warning: null, planned_start_at: "2200-03-01T01:00:00.000Z", planned_end_at: "2200-03-01T02:00:00.000Z" },
    ],
    stopDeliveries: deliveries.slice(0, 2),
  };
  render(await Page({ searchParams: Promise.resolve({ plan: "p1" }) }));
  const plan = screen.getByRole("region", { name: "Lộ trình đang xem" });
  const first = within(plan).getByRole("link", { name: "GH-001" }).closest("tr")!;
  expect(within(first).getByText("07:00–08:00 · 01/03")).toBeInTheDocument();
  expect(within(first).getByText("Nhận giờ dự kiến")).toBeInTheDocument();
  const second = within(plan).getByRole("link", { name: "GH-002" }).closest("tr")!;
  expect(within(second).getByText("Giữ lịch phiếu: 07:30–08:30 · 01/03")).toBeInTheDocument();
  expect(within(plan).getByRole("button", { name: "Áp dụng và phân giao" })).toBeInTheDocument();
});

it("hides planning and applying from readers", async () => {
  m.permissions = new Set(["delivery.read"]);
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.queryByText("Chọn phiếu giao")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Tạo lộ trình" })).not.toBeInTheDocument();
});
