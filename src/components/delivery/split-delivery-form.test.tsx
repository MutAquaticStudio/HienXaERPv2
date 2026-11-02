import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ split: vi.fn() }));
vi.mock("@/modules/delivery/split-actions", () => ({ splitDeliveryAction: m.split }));
import { SplitDeliveryForm } from "./split-delivery-form";

const props = {
  deliveryId: "d1", version: 2, allowAssign: true, defaultStart: "2026-11-03T08:00",
  lines: [{ id: "l1", name: "Xi măng PCB40", planned: "200", unit: "kg" }, { id: "l2", name: "Cát vàng", planned: "300", unit: "kg" }],
  employees: [{ id: "e1", label: "Thợ 01" }], vehicles: [{ id: "v1", label: "29C-123.45 · Rảnh" }],
};
beforeEach(() => { m.split.mockResolvedValue({ status: "SUCCESS", deliveries: [
  { id: "n1", number: "DL-2026-000032", state: "PLANNED" }, { id: "n2", number: "DL-2026-000033", state: "PLANNED" }, { id: "n3", number: "DL-2026-000034", state: "ASSIGNED" }] }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("chia 5 dòng/3 người: chọn số phiếu, nhập số lượng, phiếu 1 tự giữ phần còn lại, phân xe cho phiếu 3", async () => {
  render(<SplitDeliveryForm {...props} intro={<p>Phiếu gốc sẽ được hủy.</p>} />);
  expect(screen.getByText("Phiếu gốc sẽ được hủy.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "3 phiếu" }));
  fireEvent.change(screen.getByLabelText("Xi măng PCB40 cho Phiếu 2 (kg)"), { target: { value: "60" } });
  fireEvent.change(screen.getByLabelText("Xi măng PCB40 cho Phiếu 3 (kg)"), { target: { value: "40" } });
  fireEvent.change(screen.getByLabelText("Cát vàng cho Phiếu 3 (kg)"), { target: { value: "300" } });
  expect(screen.getByLabelText("Phiếu 1 giữ lại của Xi măng PCB40")).toHaveTextContent("100 kg");
  fireEvent.change(document.getElementById("split-employee-3")!, { target: { value: "e1" } });
  fireEvent.change(document.getElementById("split-vehicle-3")!, { target: { value: "v1" } });
  expect(document.getElementById("split-start-3")).toHaveValue("2026-11-03T08:00");
  fireEvent.click(screen.getByRole("button", { name: "Tách thành 3 phiếu" }));
  await waitFor(() => expect(screen.getByText("Đã tách thành 3 phiếu")).toBeInTheDocument());
  expect(screen.queryByText("Phiếu gốc sẽ được hủy.")).not.toBeInTheDocument();
  expect(m.split).toHaveBeenCalledWith({ deliveryId: "d1", version: 2, operationId: expect.any(String), parts: [
    { lines: [{ delivery_line_id: "l1", base_quantity: "100" }] },
    { lines: [{ delivery_line_id: "l1", base_quantity: "60" }] },
    { lines: [{ delivery_line_id: "l1", base_quantity: "40" }, { delivery_line_id: "l2", base_quantity: "300" }], employee_id: "e1", vehicle_id: "v1", scheduled_start: "2026-11-03T08:00" },
  ] });
  expect(screen.getByRole("link", { name: "DL-2026-000034" })).toHaveAttribute("href", "/admin/deliveries/n3");
});

it("báo lỗi ngay khi chia vượt, không gửi lệnh", () => {
  render(<SplitDeliveryForm {...props} />);
  fireEvent.change(screen.getByLabelText("Xi măng PCB40 cho Phiếu 2 (kg)"), { target: { value: "250" } });
  fireEvent.click(screen.getByRole("button", { name: "Tách thành 2 phiếu" }));
  expect(screen.getByRole("alert")).toHaveTextContent("vượt số lượng");
  expect(m.split).not.toHaveBeenCalled();
});

it("giữ mã thao tác khi kết quả chưa rõ để bấm lại không tách trùng", async () => {
  m.split.mockResolvedValueOnce({ status: "UNKNOWN", message: "Chưa xác định được kết quả." });
  render(<SplitDeliveryForm {...props} />);
  fireEvent.change(screen.getByLabelText("Cát vàng cho Phiếu 2 (kg)"), { target: { value: "300" } });
  fireEvent.click(screen.getByRole("button", { name: "Tách thành 2 phiếu" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Chưa xác định"));
  fireEvent.click(screen.getByRole("button", { name: "Tách thành 2 phiếu" }));
  await waitFor(() => expect(m.split).toHaveBeenCalledTimes(2));
  expect(m.split.mock.calls[1][0].operationId).toBe(m.split.mock.calls[0][0].operationId);
});
