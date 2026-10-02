import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PurchaseOrderForm } from "./purchase-order-form";
import { createPurchaseOrderAction, previewWarehousePurchaseAction, searchPurchaseSuppliersAction } from "@/modules/purchasing/actions";
vi.mock("@/modules/purchasing/actions", () => ({
  createPurchaseOrderAction: vi.fn(async () => ({ message: "Giá đã thay đổi" })),
  updatePurchaseOrderDraftAction: vi.fn(),
  searchPurchaseSuppliersAction: vi.fn(async () => ({ suppliers: [{ id: "outside-page", name: "NCC ngoài trang đầu" }], message: "Tìm được NCC" })),
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

const supplierOptions = {
  suppliers: [{ id: "supplier", name: "NCC UAT" }], warehouses: [{ id: "warehouse", name: "Kho UAT" }], customers: [],
  materials: [{ id: "a", name: "Vật tư A", uoms: [{ id: "uom", symbol: "bao" }] }],
};

it("does not silently substitute another supplier when the requested supplier is missing", () => {
  render(<PurchaseOrderForm operationId="operation" canCreateSales canManagePrice canReadPrice initialSupplierId="missing" options={supplierOptions} />);
  expect(screen.getByLabelText("Nhà cung cấp")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Lưu nháp đơn mua" })).toBeDisabled();
});

it("selects a newly hydrated supplier without losing draft fields or reusing the old price preview", async () => {
  const props = { operationId: "operation", canCreateSales: true, canManagePrice: true, canReadPrice: true };
  const { rerender } = render(<PurchaseOrderForm {...props} initialSupplierId="supplier" options={supplierOptions} />);
  fireEvent.change(screen.getByLabelText("Số lượng *"), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText("Giá mua thủ công (VND)"), { target: { value: "80000" } });
  fireEvent.change(screen.getByLabelText("Lý do giá thủ công"), { target: { value: "QA reason" } });
  fireEvent.change(screen.getByLabelText("Ngày dự kiến"), { target: { value: "2026-10-02T09:00" } });
  fireEvent.change(screen.getByLabelText("Điều khoản mua"), { target: { value: "Preserve QA draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Tính giá mua và xem trước" }));
  await screen.findByText("Đã xem giá");
  rerender(<PurchaseOrderForm {...props} initialSupplierId="created" options={{ ...supplierOptions, suppliers: [...supplierOptions.suppliers, { id: "created", name: "NCC vừa tạo" }] }} />);
  expect(screen.getByLabelText("Nhà cung cấp")).toHaveValue("created");
  expect(screen.getByLabelText("Số lượng *")).toHaveValue("5");
  expect(screen.getByLabelText("Ngày dự kiến")).toHaveValue("2026-10-02T09:00");
  expect(screen.getByLabelText("Điều khoản mua")).toHaveValue("Preserve QA draft");
  expect(screen.getByRole("button", { name: "Lưu nháp đơn mua" })).toBeDisabled();
});

it("searches suppliers on the server and previews using the explicitly selected result", async () => {
  render(<PurchaseOrderForm operationId="operation" canCreateSales canManagePrice canReadPrice options={supplierOptions} />);
  fireEvent.change(screen.getByLabelText("Tìm nhà cung cấp"), { target: { value: "NCC ngoài" } });
  fireEvent.click(screen.getByRole("button", { name: "Tìm NCC" }));
  await screen.findByText("Tìm được NCC");
  expect(searchPurchaseSuppliersAction).toHaveBeenCalledWith("NCC ngoài");
  fireEvent.change(screen.getByLabelText("Nhà cung cấp"), { target: { value: "outside-page" } });
  fireEvent.change(screen.getByLabelText("Số lượng *"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Tính giá mua và xem trước" }));
  await screen.findByText("Đã xem giá");
  expect(previewWarehousePurchaseAction).toHaveBeenLastCalledWith(expect.objectContaining({ supplierId: "outside-page" }));
});
