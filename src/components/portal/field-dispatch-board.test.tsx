import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ refresh: vi.fn(), assign: vi.fn(), options: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh, push: vi.fn() }) }));
vi.mock("@/modules/portal/field-dispatch-actions", () => ({ fieldDispatchAction: m.assign, fieldDispatchOptionsAction: m.options }));
import { FieldDispatchBoardView } from "./field-dispatch-board";
import type { FieldDispatchBoard } from "@/modules/portal/field-dispatch";

const ME = "11111111-1111-4111-8111-000000000001";
const HUNG = "11111111-1111-4111-8111-000000000002";
const SON = "11111111-1111-4111-8111-000000000003";
const V1 = "22222222-2222-4222-8222-000000000001";
const V2 = "22222222-2222-4222-8222-000000000002";
const D41 = "33333333-3333-4333-8333-000000000041";
const D38 = "33333333-3333-4333-8333-000000000038";
const W12 = "33333333-3333-4333-8333-000000000012";
const G36 = "33333333-3333-4333-8333-000000000036";
const G34 = "33333333-3333-4333-8333-000000000034";
const G35 = "33333333-3333-4333-8333-000000000035";
// 16/11, Vietnam time: 09:30 = 02:30Z.
const at = (hhmm: string) => new Date(`2026-11-16T${hhmm}:00+07:00`).toISOString();

const board: FieldDispatchBoard = {
  branch_id: "b1", now: at("08:20"), me: ME, stop_minutes: 60,
  workers: [
    { id: ME, name: "Tuấn", me: true, clocked_in_at: at("06:50"), free_from: at("10:00") },
    { id: HUNG, name: "Hùng", clocked_in_at: at("07:02"), free_from: at("09:30") },
    { id: SON, name: "Sơn", free_from: at("08:20") },
  ],
  vehicles: [{ id: V1, code: "Xe cn nhỏ", plate_number: "29C-123.45" }, { id: V2, code: "Xe cn to", plate_number: "29C-678.90" }],
  waiting: [
    { kind: "DELIVERY", id: D41, number: "DL-2026-000041", version: 3, requested_at: at("09:30"), site_name: "Nhà anh Bình – Đại Mỗ", address: "Ngõ 12 Đại Mỗ",
      lines: [{ material_name: "Xi măng PCB40", quantity: "60", unit: "bao" }],
      pairs: [
        { employee_id: HUNG, vehicle_id: V1, start_at: at("09:30"), end_at: at("10:30"), default_driver: true },
        { employee_id: SON, vehicle_id: V1, start_at: at("09:30"), end_at: at("10:30") },
        { employee_id: SON, vehicle_id: V2, start_at: at("10:15"), end_at: at("11:15") },
        { employee_id: ME, vehicle_id: V1, start_at: at("10:00"), end_at: at("11:00") },
      ],
      suggestion: { employee_id: HUNG, vehicle_id: V1, start_at: at("09:30"), end_at: at("10:30"), default_driver: true, from_proposal: true } },
    { kind: "SERVICE_JOB", id: W12, number: "SRV-202611-000012", version: 1, requested_at: at("13:30"), duration_minutes: 120, title: "Bốc hàng lên tầng 3",
      site_name: "Nhà chị Hoa", description: "Cầu thang bộ", quantity: "120", unit: "bao",
      candidates: [{ employee_id: ME, start_at: at("13:30") }, { employee_id: HUNG, start_at: at("13:30") }, { employee_id: SON, start_at: at("13:30") }] },
    { kind: "DELIVERY", id: D38, number: "DL-2026-000038", version: 5, requested_at: at("09:00"), site_name: "Nhà anh Lâm", address: "Ngõ 45 Xuân Phương",
      lines: [{ material_name: "Gạch đặc A1", quantity: "2000", unit: "viên" }],
      declined: [{ employee_id: SON, name: "Sơn", reason: "Ngõ hẹp, xe to không vào được", at: at("08:05") }],
      pairs: [{ employee_id: HUNG, vehicle_id: V1, start_at: at("10:30"), end_at: at("11:30") }, { employee_id: ME, vehicle_id: V2, start_at: at("10:00"), end_at: at("11:00") }],
      suggestion: null },
  ],
  given: [
    { kind: "DELIVERY", id: G36, work_item_id: "w36", number: "DL-2026-000036", version: 4, employee_id: HUNG, vehicle_id: V1, start_at: at("08:30"),
      site_name: "Nhà chị Hà", state: "ASSIGNED", can_change: true },
    { kind: "DELIVERY", id: G34, work_item_id: "w34", number: "DL-2026-000034", version: 6, employee_id: SON, vehicle_id: V2, start_at: at("08:10"),
      site_name: "Nhà anh Lực", state: "DISPATCHED", can_change: false },
    { kind: "DELIVERY", id: G35, work_item_id: "w35", number: "DL-2026-000035", version: 7, employee_id: SON, vehicle_id: V2, start_at: at("07:00"),
      site_name: "Nhà chị Mai", state: "RESULT_SUBMITTED", result_kind: "PARTIAL", can_change: false, receiver_phone: "0901 234 567", shortfall: "Xi măng 50/60 bao" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  m.assign.mockResolvedValue({ ok: true, startAt: at("09:30") });
});
afterEach(cleanup);

it("puts a refused delivery first and gives the suggestion with one tap", async () => {
  render(<FieldDispatchBoardView board={board} />);
  const cards = screen.getAllByRole("article");
  expect(cards[0]).toHaveAccessibleName(/DL-2026-000038/);
  expect(within(cards[0]).getByText(/Sơn từ chối lúc 08:05/)).toBeTruthy();
  expect(screen.getByText("Cần chú ý:")).toBeTruthy();
  expect(screen.getByRole("button", { name: "1 thợ từ chối" })).toBeTruthy();
  const card = screen.getByRole("article", { name: /DL-2026-000041/ });
  expect(within(card).getByText("Gợi ý: Hùng · Xe cn nhỏ · đi 09:30")).toBeTruthy();
  fireEvent.click(within(card).getByRole("button", { name: "Giao cho Hùng" }));
  await waitFor(() => expect(m.refresh).toHaveBeenCalled());
  expect(m.assign.mock.calls[0][0]).toMatchObject({ kind: "DELIVERY", mode: "ASSIGN", targetId: D41, employeeId: HUNG, vehicleId: V1, chosenStart: null, version: 3 });
  expect(screen.getByRole("status").textContent).toContain("Đã giao DL-2026-000041 cho Hùng · Xe cn nhỏ · 09:30");
});

it("blocks the worker who refused and orders the rest: suggestion, on shift, free soonest", () => {
  render(<FieldDispatchBoardView board={board} />);
  fireEvent.click(within(screen.getByRole("article", { name: /DL-2026-000038/ })).getByRole("button", { name: "Giao người khác" }));
  const sheet = screen.getByRole("dialog", { name: "Giao lại DL-2026-000038" });
  const son = within(sheet).getByRole("radio", { name: /Sơn/ });
  expect(son).toBeDisabled();
  expect(within(sheet).getByText(/Đã từ chối phiếu này lúc 08:05/)).toBeTruthy();
  const names = within(sheet).getAllByRole("radio").filter((radio) => radio.getAttribute("name") === "fd-worker")
    .map((radio) => radio.closest("label")?.querySelector("strong")?.textContent);
  expect(names).toEqual(["Tuấn (bạn)", "Hùng", "Sơn"]);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("gives a delivery to another worker, not clocked in, at a time the lead picks", async () => {
  render(<FieldDispatchBoardView board={board} />);
  fireEvent.click(within(screen.getByRole("article", { name: /DL-2026-000041/ })).getByRole("button", { name: "Chọn người khác" }));
  const sheet = screen.getByRole("dialog", { name: "Giao DL-2026-000041" });
  fireEvent.click(within(sheet).getByRole("radio", { name: /Sơn/ }));
  expect(within(sheet).getByText("Chưa vào ca", { selector: "span" })).toBeTruthy();
  expect(within(sheet).getByRole("radio", { name: /Xe cn to/ })).toBeTruthy();
  expect(within(sheet).getByText(/trễ 45 phút so với hẹn/)).toBeTruthy();
  fireEvent.click(within(sheet).getByRole("radio", { name: /Chọn giờ khác/ }));
  fireEvent.change(within(sheet).getByLabelText("Giờ đi"), { target: { value: "2026-11-16T14:00" } });
  const confirm = within(sheet).getByRole("button", { name: "Giao cho Sơn · Xe cn nhỏ · đi 14:00" });
  expect(within(sheet).getByText(/Sơn chưa vào ca: vào ca là thấy việc ở Hôm nay/)).toBeTruthy();
  fireEvent.click(confirm);
  await waitFor(() => expect(m.assign).toHaveBeenCalled());
  expect(m.assign.mock.calls[0][0]).toMatchObject({ mode: "ASSIGN", targetId: D41, employeeId: SON, vehicleId: V1, chosenStart: "2026-11-16T07:00:00.000Z" });
});

it("says when the picked time is taken, offers the free time and retries an unclear outcome with the same operation", async () => {
  m.assign.mockResolvedValueOnce({ ok: false, message: "Người hoặc xe đã có việc lúc đó. Rảnh từ 11:00.", nextFreeAt: at("11:00") })
    .mockResolvedValueOnce({ ok: false, unknown: true, message: "Chưa giao được. Kiểm tra kết nối rồi bấm lại; hệ thống không ghi hai lần." })
    .mockResolvedValueOnce({ ok: true, startAt: at("11:00") });
  render(<FieldDispatchBoardView board={board} />);
  fireEvent.click(within(screen.getByRole("article", { name: /DL-2026-000041/ })).getByRole("button", { name: "Chọn người khác" }));
  const sheet = screen.getByRole("dialog");
  fireEvent.click(within(sheet).getByRole("radio", { name: /Chọn giờ khác/ }));
  fireEvent.change(within(sheet).getByLabelText("Giờ đi"), { target: { value: "2026-11-16T10:00" } });
  fireEvent.click(within(sheet).getByRole("button", { name: /Giao cho Hùng/ }));
  expect((await within(sheet).findByRole("alert")).textContent).toContain("Rảnh từ 11:00");
  fireEvent.click(within(sheet).getByRole("button", { name: "Chọn 11:00" }));
  fireEvent.click(within(sheet).getByRole("button", { name: "Giao cho Hùng · Xe cn nhỏ · đi 11:00" }));
  await within(sheet).findByText(/hệ thống không ghi hai lần/);
  fireEvent.click(within(sheet).getByRole("button", { name: "Giao cho Hùng · Xe cn nhỏ · đi 11:00" }));
  await waitFor(() => expect(m.assign).toHaveBeenCalledTimes(3));
  const ids = m.assign.mock.calls.map((call) => call[0].operationId);
  expect(ids[1]).toBe(ids[2]);
  expect(ids[0]).not.toBe(ids[1]);
  expect(m.assign.mock.calls[2][0].chosenStart).toBe(at("11:00"));
});

it("gives a service job by picking only the worker", async () => {
  render(<FieldDispatchBoardView board={board} />);
  fireEvent.click(within(screen.getByRole("article", { name: /SRV-202611-000012/ })).getByRole("button", { name: "Chọn người" }));
  const sheet = screen.getByRole("dialog", { name: "Giao SRV-202611-000012" });
  expect(within(sheet).queryByText("2. Chọn xe")).toBeNull();
  fireEvent.click(within(sheet).getByRole("radio", { name: /Tuấn/ }));
  fireEvent.click(within(sheet).getByRole("button", { name: "Tự nhận · lúc 13:30" }));
  await waitFor(() => expect(m.assign).toHaveBeenCalled());
  expect(m.assign.mock.calls[0][0]).toMatchObject({ kind: "SERVICE_JOB", mode: "ASSIGN", targetId: W12, employeeId: ME, vehicleId: null, version: 1 });
});

it("changes the person before loading; a loaded job is locked and a short one can be called", async () => {
  m.options.mockResolvedValue({ ok: true, pairs: [{ employee_id: SON, vehicle_id: V1, start_at: at("08:30"), end_at: at("09:30") }], declined: [] });
  render(<FieldDispatchBoardView board={board} />);
  fireEvent.click(screen.getByRole("tab", { name: /Đã giao hôm nay · 3/ }));
  expect(screen.getAllByRole("button", { name: /Đổi người/ })).toHaveLength(1);
  expect(screen.getByText("Đã bắt đầu")).toBeTruthy();
  expect(screen.getByText(/Khách nhận Xi măng 50\/60 bao/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Gọi người nhận DL-2026-000035" }).getAttribute("href")).toContain("0901234567");
  fireEvent.click(screen.getByRole("button", { name: "Đổi người DL-2026-000036" }));
  const sheet = screen.getByRole("dialog", { name: "Đổi người · DL-2026-000036" });
  await within(sheet).findByRole("radio", { name: /Sơn/ });
  expect(m.options).toHaveBeenCalledWith("DELIVERY", G36);
  expect(within(sheet).getByRole("radio", { name: /Hùng/ })).toBeDisabled();
  fireEvent.click(within(sheet).getByRole("button", { name: "Chuyển cho Sơn · Xe cn nhỏ · đi 08:30" }));
  await waitFor(() => expect(m.assign).toHaveBeenCalled());
  expect(m.assign.mock.calls[0][0]).toMatchObject({ kind: "DELIVERY", mode: "REASSIGN", targetId: G36, employeeId: SON, vehicleId: V1, version: 4 });
  expect((await screen.findByRole("status")).textContent).toContain("Đã chuyển DL-2026-000036 từ Hùng sang Sơn.");
});

it("explains in Vietnamese when someone else took it first, and reloads the list", async () => {
  m.assign.mockResolvedValueOnce({ ok: false, reload: true, message: "Việc này vừa có người nhận (văn phòng, thợ chính khác hoặc thợ tự nhận). Danh sách đã tải lại." });
  render(<FieldDispatchBoardView board={board} />);
  fireEvent.click(within(screen.getByRole("article", { name: /DL-2026-000041/ })).getByRole("button", { name: "Giao cho Hùng" }));
  expect((await screen.findByRole("alert")).textContent).toContain("vừa có người nhận");
  expect(m.refresh).toHaveBeenCalled();
});

it("shows an empty list when nothing waits", () => {
  render(<FieldDispatchBoardView board={{ ...board, waiting: [], given: [] }} />);
  expect(screen.getByText("Không còn việc chờ người")).toBeTruthy();
  expect(screen.queryByText("Cần chú ý:")).toBeNull();
});
