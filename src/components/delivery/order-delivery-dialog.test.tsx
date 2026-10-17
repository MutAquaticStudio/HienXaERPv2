import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ create: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push, refresh: vi.fn() }) }));
vi.mock("@/modules/delivery/order-delivery-actions", () => ({ createDeliveryForOrderAction: m.create }));
import { deliverableBase, OrderDeliveryButton, type OrderDeliveryLine } from "./order-delivery-dialog";

const cement: OrderDeliveryLine = {
  salesOrderLineId: "line-xm", lineNumber: 1, name: "Xi măng PCB40", materialId: "xm", symbol: "bao", baseSymbol: "kg",
  ratio: { numerator: "50", denominator: "1" }, requiredBase: "500",
  allocations: [{ id: "a1", mode: "WAREHOUSE", warehouseId: "w1", allocatedBase: "200", consumedBase: "100" }],
};
const sand: OrderDeliveryLine = { salesOrderLineId: "line-cat", lineNumber: 2, name: "Cát vàng", materialId: "cat", symbol: "m³", baseSymbol: "m³",
  ratio: { numerator: "1", denominator: "1" }, requiredBase: "6", allocations: [{ id: "a2", mode: "SUPPLIER_DIRECT", warehouseId: null, allocatedBase: "6", consumedBase: "0" }] };
const availability = { incomplete: false, warehouses: [{ id: "w1", name: "Kho chính" }, { id: "w2", name: "Kho phụ" }], positions: [
  { warehouse_id: "w1", material_id: "xm", base_uom_id: "kg", baseSymbol: "kg", on_hand_base_quantity: "1000", reserved_base_quantity: "100", available_base_quantity: "900" },
] };
const props = { orderId: "11111111-1111-4111-8111-111111111111", lines: [cement, sand], warehouses: availability.warehouses, availability, defaultScheduledAt: "2026-10-17T08:00", stopMinutes: 45,
  resources: { employees: [{ id: "e1", name: "Tài xế A" }], vehicles: [{ id: "v1", label: "XE1 · 29C-123" }] } };
beforeEach(() => { vi.clearAllMocks(); m.create.mockResolvedValue({ success: true, deliveryId: "d1", message: "Đã lập phiếu giao." }); });
afterEach(cleanup);

it("computes what a warehouse can still deliver after other sources", () => {
  expect(deliverableBase(cement, "w1").toFixed()).toBe("400");
  expect(deliverableBase(cement, "w2").toFixed()).toBe("300");
  expect(deliverableBase(sand, "w1").toFixed()).toBe("0");
});

it("pre-fills what is left in the sold unit and delivers now with driver and vehicle chosen", async () => {
  render(<OrderDeliveryButton {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Lập phiếu giao" }));
  const dialog = screen.getByRole("dialog", { name: "Lập phiếu giao" });
  expect(within(dialog).getByLabelText("Số lượng giao Xi măng PCB40")).toHaveValue("8");
  expect(within(dialog).getByLabelText("Số lượng giao Cát vàng")).toBeDisabled();
  expect(within(dialog).getByText("400 kg")).toBeInTheDocument();
  // "Giao ngay" by default; the only driver and truck are already picked; no end time to type.
  expect(within(dialog).getByLabelText("Giao ngay")).toBeChecked();
  expect(within(dialog).queryByLabelText("Giao lúc *")).not.toBeInTheDocument();
  expect(within(dialog).getByLabelText("Người giao *")).toHaveValue("e1");
  expect(within(dialog).getByLabelText("Xe *")).toHaveValue("v1");
  expect(within(dialog).getByText(/Mỗi điểm giao tính 45 phút; người hoặc xe đang bận thì tự xếp/)).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText("Số lượng giao Xi măng PCB40"), { target: { value: "20" } });
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Vượt phần còn phải giao");
  expect(within(dialog).getByRole("button", { name: /Lập phiếu giao \(/ })).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("Số lượng giao Xi măng PCB40"), { target: { value: "3" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Lập phiếu giao (1 dòng)" }));
  await waitFor(() => expect(m.create).toHaveBeenCalledOnce());
  expect(m.create.mock.calls[0][0]).toMatchObject({ orderId: props.orderId, warehouseId: "w1", scheduleMode: "NOW",
    lines: [{ salesOrderLineId: "line-xm", quantity: "3" }], assignment: { employeeId: "e1", vehicleId: "v1" } });
  expect(m.create.mock.calls[0][0].scheduledAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  await waitFor(() => expect(m.push).toHaveBeenCalledWith("/admin/deliveries/d1?notice=delivery-planned"));
});

it("starts on the customer's requested time and offers the nearest free time after a clash", async () => {
  m.create.mockResolvedValueOnce({ success: false, message: "Người giao hoặc xe đã có việc trong khung giờ này.", nextFreeAt: "2026-10-18T10:30" });
  render(<OrderDeliveryButton {...props} requestedAt="2026-10-18T09:00" />);
  fireEvent.click(screen.getByRole("button", { name: "Lập phiếu giao" }));
  const dialog = screen.getByRole("dialog", { name: "Lập phiếu giao" });
  expect(within(dialog).getByLabelText("Hẹn ngày giờ")).toBeChecked();
  expect(within(dialog).getByLabelText("Giao lúc *")).toHaveValue("2026-10-18T09:00");
  fireEvent.click(within(dialog).getByRole("button", { name: "Lập phiếu giao (1 dòng)" }));
  await waitFor(() => expect(m.create).toHaveBeenCalledOnce());
  expect(m.create.mock.calls[0][0]).toMatchObject({ scheduleMode: "AT", scheduledAt: "2026-10-18T09:00" });
  fireEvent.click(await within(dialog).findByRole("button", { name: "Hẹn lúc 10:30 18/10/2026" }));
  expect(within(dialog).getByLabelText("Giao lúc *")).toHaveValue("2026-10-18T10:30");
});

it("blocks a line the chosen warehouse cannot cover and points to a direct supplier order", () => {
  render(<OrderDeliveryButton {...props} canOrderDirect />);
  fireEvent.click(screen.getByRole("button", { name: "Lập phiếu giao" }));
  const dialog = screen.getByRole("dialog", { name: "Lập phiếu giao" });
  fireEvent.change(within(dialog).getByLabelText("Kho xuất *"), { target: { value: "w2" } });
  expect(within(dialog).getByLabelText("Số lượng giao Xi măng PCB40")).toHaveValue("6");
  expect(within(dialog).getByText(/Kho này không đủ hàng cho: Xi măng PCB40/)).toBeInTheDocument();
  expect(within(dialog).getByRole("link", { name: "Đặt NCC giao thẳng · Xi măng PCB40" })).toHaveAttribute("href", "/admin/purchase-orders/new?salesLineId=line-xm");
  expect(within(dialog).getByRole("button", { name: "Lập phiếu giao (1 dòng)" })).toBeDisabled();
});

it("keeps the dialog open with the reason when the database refuses", async () => {
  m.create.mockResolvedValueOnce({ success: false, message: "Tồn khả dụng hoặc lượng hàng đã giữ không còn đủ." });
  render(<OrderDeliveryButton {...props} resources={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Lập phiếu giao" }));
  const dialog = screen.getByRole("dialog", { name: "Lập phiếu giao" });
  expect(within(dialog).queryByText(/Phân xe và người giao/)).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Lập phiếu giao (1 dòng)" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Tồn khả dụng");
  expect(m.push).not.toHaveBeenCalled();
  expect(m.create.mock.calls[0][0]).toMatchObject({ assignment: null, scheduleMode: "NOW" });
});
