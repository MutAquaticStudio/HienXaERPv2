import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PurchaseOrderForm } from "./purchase-order-form";
import { createPurchaseOrderAction } from "@/modules/purchasing/actions";
vi.mock("@/modules/purchasing/actions", () => ({
  createPurchaseOrderAction: vi.fn(async () => ({ message: "Giá đã thay đổi" })),
  updatePurchaseOrderDraftAction: vi.fn(),
  previewWarehousePurchaseAction: vi.fn(async () => ({ success: true, message: "Đã xem giá", lines: [], totalVnd: "260000", sales: { totalVnd: "420000", lines: [{ unitPriceVnd: "120000", priceSourceType: "LIST", lineTotalVnd: "420000" }] } })),
}));
afterEach(cleanup);

it("preserves destination, customer, materials, date and terms after a failed save", async () => {
  render(<PurchaseOrderForm operationId="operation" canCreateSales canManagePrice canReadPrice options={{
    suppliers: [{ id: "supplier", name: "NCC UAT" }], warehouses: [{ id: "warehouse", name: "Kho UAT" }],
    customers: [{ id: "real", name: "Khách khác", sites: [{ id: "real-site", name: "CT khác", address: "A" }] }, { id: "uat", name: "Khách UAT", sites: [{ id: "uat-site", name: "CT UAT", address: "B" }] }],
    materials: [{ id: "a", name: "Vật tư A", uoms: [{ id: "uom", symbol: "bao" }] }, { id: "b", name: "Vật tư B", uoms: [{ id: "uom", symbol: "bao" }] }],
  }} />);
  fireEvent.change(screen.getByLabelText("Giao đến"), { target: { value: "LINKED_DIRECT" } });
  fireEvent.change(screen.getByLabelText("Khách hàng"), { target: { value: "uat" } });
  fireEvent.change(screen.getByLabelText("Vật tư *"), { target: { value: "b" } });
  fireEvent.change(screen.getByLabelText("Số lượng *"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Ngày dự kiến"), { target: { value: "2026-10-28T03:19" } });
  fireEvent.change(screen.getByLabelText("Điều khoản mua"), { target: { value: "UAT giữ nội dung" } });
  fireEvent.click(screen.getByRole("button", { name: "Xem trước giá mua và giá bán" }));
  await screen.findByText("Tổng giá bán khách");
  const save = screen.getByRole("button", { name: "Lưu đơn mua và bản nháp bán" });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.submit(save.closest("form")!);
  await screen.findByText("Giá đã thay đổi");
  expect(createPurchaseOrderAction).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Giao đến")).toHaveValue("LINKED_DIRECT");
  expect(screen.getByLabelText("Khách hàng")).toHaveValue("uat");
  expect(screen.getByLabelText("Công trình")).toHaveValue("uat-site");
  expect(screen.getByLabelText("Vật tư *")).toHaveValue("b");
  expect(screen.getByLabelText("Ngày dự kiến")).toHaveValue("2026-10-28T03:19");
  expect(screen.getByLabelText("Điều khoản mua")).toHaveValue("UAT giữ nội dung");
});
