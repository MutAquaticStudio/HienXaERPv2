import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PurchaseOrderForm } from "./purchase-order-form";
import { createPurchaseOrderAction, createSupplierQuickAction, previewWarehousePurchaseAction, searchPurchaseSuppliersAction, updatePurchaseWarehouseAddressAction, updatePurchaseDraftDestinationAction } from "@/modules/purchasing/actions";
vi.mock("@/modules/purchasing/actions", () => ({
  createPurchaseOrderAction: vi.fn(async () => ({ message: "Giá đã thay đổi" })),
  updatePurchaseOrderDraftAction: vi.fn(),
  createSupplierQuickAction: vi.fn(async () => ({ success: true, supplierId: "created", message: "Đã tạo nhà cung cấp." })),
  updatePurchaseWarehouseAddressAction: vi.fn(async () => ({ success: true, message: "Đã bổ sung địa chỉ kho", address: "12 Đường kho" })),
  updatePurchaseDraftDestinationAction: vi.fn(async () => ({ success: true, message: "Đã cập nhật địa chỉ PO", version: 2, warehouseId: "warehouse", address: "Địa chỉ mới" })),
  searchPurchaseSuppliersAction: vi.fn(async () => ({ suppliers: [{ id: "outside-page", name: "NCC ngoài trang đầu" }], message: "Tìm được NCC" })),
  previewWarehousePurchaseAction: vi.fn(async () => ({ success: true, message: "Đã xem giá", lines: [{ unitCostVnd: "60000", priceSourceType: "LIST", lineTotalVnd: "180000" }], totalVnd: "180000", sales: { totalVnd: "420000", lines: [{ unitPriceVnd: "120000", priceSourceType: "LIST", lineTotalVnd: "420000" }] } })),
}));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const quantity = (row = 1) => screen.getByLabelText(`Số lượng dòng ${row}`);
const hidden = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;
function choose(label: string, option: string) {
  fireEvent.focus(screen.getByRole("combobox", { name: label }));
  fireEvent.mouseDown(screen.getByRole("option", { name: new RegExp(option) }));
}
function searchMaterial(text: string) {
  const input = screen.getByRole("combobox", { name: "Tìm vật tư" });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
}

const supplierOptions = {
  suppliers: [{ id: "supplier", name: "NCC UAT" }], warehouses: [{ id: "warehouse", name: "Kho UAT", address: "Địa chỉ kho UAT" }], customers: [],
  materials: [{ id: "a", code: "VT-A", name: "Vật tư A", uoms: [{ id: "uom", symbol: "bao" }] }],
};

it("preserves destination, customer, site, materials, date and terms after a failed save", async () => {
  render(<PurchaseOrderForm operationId="operation" canCreateSales canManagePrice canReadPrice initialSupplierId="supplier" options={{
    suppliers: [{ id: "supplier", name: "NCC UAT" }], warehouses: [{ id: "warehouse", name: "Kho UAT", address: "Địa chỉ kho UAT" }],
    customers: [{ id: "real", name: "Khách khác", sites: [{ id: "real-site", name: "CT khác", address: "A" }] }, { id: "uat", name: "Khách UAT", sites: [{ id: "uat-site", name: "CT UAT", address: "B" }] }],
    materials: [{ id: "a", code: "VT-A", name: "Vật tư A", uoms: [{ id: "uom", symbol: "bao" }] }, { id: "b", code: "VT-B", name: "Vật tư B", uoms: [{ id: "uom", symbol: "bao" }] }],
  }} />);
  fireEvent.change(screen.getByLabelText("Giao đến"), { target: { value: "LINKED_DIRECT" } });
  choose("Khách hàng", "Khách UAT");
  choose("Công trình", "CT UAT");
  searchMaterial("vt-b");
  fireEvent.change(quantity(), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Ngày dự kiến"), { target: { value: "2026-10-28T03:19" } });
  fireEvent.change(screen.getByLabelText("Điều khoản mua"), { target: { value: "UAT giữ nội dung" } });
  await screen.findByText("Tổng giá bán khách");
  const save = screen.getByRole("button", { name: "Lưu đơn mua và bản nháp bán" });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  await screen.findByText("Giá đã thay đổi");
  expect(createPurchaseOrderAction).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Giao đến")).toHaveValue("LINKED_DIRECT");
  expect(hidden("customerId")).toBe("uat");
  expect(hidden("siteId")).toBe("uat-site");
  expect(hidden("materialId")).toBe("b");
  expect(screen.getByLabelText("Ngày dự kiến")).toHaveValue("2026-10-28T03:19");
  expect(screen.getByLabelText("Điều khoản mua")).toHaveValue("UAT giữ nội dung");
});

it("does not pick a site by itself for a linked sales draft", () => {
  render(<PurchaseOrderForm operationId="operation" canCreateSales canManagePrice canReadPrice initialSupplierId="supplier" options={{ ...supplierOptions,
    customers: [{ id: "uat", name: "Khách UAT", sites: [{ id: "uat-site", name: "CT UAT", address: "B" }] }] }} />);
  fireEvent.change(screen.getByLabelText("Giao đến"), { target: { value: "LINKED_DIRECT" } });
  choose("Khách hàng", "Khách UAT");
  expect(hidden("siteId")).toBe("");
});

it("auto-previews a valid purchase without creating PO/SO", async () => {
  render(<PurchaseOrderForm operationId="auto-preview" canCreateSales={false} canManagePrice canReadPrice initialSupplierId="supplier" options={supplierOptions} initialMaterialId="a" />);
  fireEvent.change(quantity(), { target: { value: "3" } });
  await waitFor(() => expect(previewWarehousePurchaseAction).toHaveBeenCalledWith(expect.objectContaining({ supplierId: "supplier", lines: [expect.objectContaining({ quantity: "3" })] })));
  expect(createPurchaseOrderAction).not.toHaveBeenCalled();
  expect(await screen.findByText("180.000 ₫", { selector: ".doc-editor-total dd" })).toBeInTheDocument();
});

it("never requests cost preview for an actor without cost read", async () => {
  render(<PurchaseOrderForm operationId="hidden-cost" canCreateSales={false} canManagePrice={false} canReadPrice={false} initialSupplierId="supplier" options={supplierOptions} initialMaterialId="a" />);
  fireEvent.change(quantity(), { target: { value: "3" } });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
  expect(previewWarehousePurchaseAction).not.toHaveBeenCalled();
  expect(screen.getByText("Giá mua được giữ ẩn theo quyền. Hệ thống vẫn kiểm tra giá khi lưu.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Lưu nháp" })).toBeEnabled();
});

it("does not choose a supplier by itself, including when the requested supplier is missing", () => {
  render(<PurchaseOrderForm operationId="operation" canCreateSales canManagePrice canReadPrice initialSupplierId="missing" options={supplierOptions} initialMaterialId="a" />);
  expect(hidden("supplierId")).toBe("");
  expect(screen.getByRole("button", { name: "Lưu nháp" })).toBeDisabled();
});

it("creates a supplier in place, selects it and keeps the draft", async () => {
  render(<PurchaseOrderForm operationId="operation" canCreateSales canManagePrice canReadPrice options={supplierOptions} initialMaterialId="a" />);
  fireEvent.change(quantity(), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText("Điều khoản mua"), { target: { value: "Preserve QA draft" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Thêm NCC" }));
  fireEvent.change(screen.getByLabelText("Mã NCC *"), { target: { value: "QA_NEW" } });
  fireEvent.change(screen.getByLabelText("Tên NCC *"), { target: { value: "NCC vừa tạo" } });
  fireEvent.click(screen.getByRole("button", { name: "Tạo nhà cung cấp" }));
  await waitFor(() => expect(hidden("supplierId")).toBe("created"));
  const data = vi.mocked(createSupplierQuickAction).mock.calls[0][1] as FormData;
  expect(data.get("code")).toBe("QA_NEW");
  expect(String(data.get("operationId"))).toMatch(/^[0-9a-f-]{36}$/);
  expect(quantity()).toHaveValue("5");
  expect(screen.getByLabelText("Điều khoản mua")).toHaveValue("Preserve QA draft");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("searches suppliers on the server and previews using the explicitly selected result", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  render(<PurchaseOrderForm operationId="operation" canCreateSales canManagePrice canReadPrice options={supplierOptions} initialMaterialId="a" />);
  const input = screen.getByRole("combobox", { name: "Nhà cung cấp" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "NCC ngoài" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  vi.useRealTimers();
  expect(searchPurchaseSuppliersAction).toHaveBeenCalledWith("NCC ngoài");
  fireEvent.mouseDown(await screen.findByRole("option", { name: "NCC ngoài trang đầu" }));
  fireEvent.change(quantity(), { target: { value: "2" } });
  await waitFor(() => expect(previewWarehousePurchaseAction).toHaveBeenLastCalledWith(expect.objectContaining({ supplierId: "outside-page" })));
});

it("'Tạo đơn mua' posts the confirm intent with its own operation ID; absent without permission or for direct delivery", async () => {
  const { unmount } = render(<PurchaseOrderForm operationId="20000000-0000-4000-8000-000000000001" confirmOperationId="20000000-0000-4000-8000-000000000002" canConfirm canCreateSales canManagePrice canReadPrice initialSupplierId="supplier" options={supplierOptions} initialMaterialId="a" />);
  const create = screen.getByRole("button", { name: "Tạo đơn mua" });
  await waitFor(() => expect(create).toBeEnabled());
  fireEvent.click(create);
  await waitFor(() => expect(createPurchaseOrderAction).toHaveBeenCalledTimes(1));
  const data = vi.mocked(createPurchaseOrderAction).mock.calls[0][1] as FormData;
  expect(data.get("intent")).toBe("confirm");
  expect(data.get("confirmOperationId")).toBe("20000000-0000-4000-8000-000000000002");
  fireEvent.change(screen.getByLabelText("Giao đến"), { target: { value: "LINKED_DIRECT" } });
  expect(screen.queryByRole("button", { name: "Tạo đơn mua" })).not.toBeInTheDocument();
  unmount();
  render(<PurchaseOrderForm operationId="operation" confirmOperationId="x" canCreateSales canManagePrice canReadPrice initialSupplierId="supplier" options={supplierOptions} initialMaterialId="a" />);
  expect(screen.queryByRole("button", { name: "Tạo đơn mua" })).not.toBeInTheDocument();
});

it("adds direct-delivery lines only from the sales order's remaining lines", () => {
  const salesLine = { id: "sl-1", orderId: "so", orderNumber: "DB-1", customerName: "Khách", siteName: "CT", materialName: "Vật tư A", orderedUomSymbol: "bao", remainingOrderedQuantity: "4",
    availableLines: [{ id: "sl-1", materialId: "a", materialName: "Vật tư A", uomId: "uom", uomSymbol: "bao", remainingOrderedQuantity: "4" },
      { id: "sl-2", materialId: "a", materialName: "Vật tư A loại 2", uomId: "uom", uomSymbol: "bao", remainingOrderedQuantity: "1.5" }] };
  render(<PurchaseOrderForm operationId="operation" canCreateSales canManagePrice canReadPrice initialSupplierId="supplier" salesLine={salesLine} options={supplierOptions} />);
  expect(screen.queryByRole("combobox", { name: "Tìm vật tư" })).not.toBeInTheDocument();
  expect(quantity()).toHaveValue("4");
  choose("Thêm dòng từ đơn bán", "Vật tư A loại 2");
  expect(quantity(2)).toHaveValue("1,5");
  expect([...document.querySelectorAll<HTMLInputElement>('input[name="quantity"]')].map((input) => input.value)).toEqual(["4", "1.5"]);
  expect([...document.querySelectorAll<HTMLInputElement>('input[name="salesLineId"]')].map((input) => input.value)).toEqual(["sl-1", "sl-2"]);
  expect(screen.getByRole("combobox", { name: "Thêm dòng từ đơn bán" })).toBeDisabled();
});

const addressOptions = { suppliers: [{ id: "supplier", name: "NCC" }], warehouses: [{ id: "warehouse", name: "Kho thiếu địa chỉ", address: null }], customers: [], materials: [{ id: "material", code: "CAT", name: "Cát", uoms: [{ id: "uom", symbol: "m³" }] }] };
it("blocks missing warehouse addresses without clearing the draft or offering unauthorized edits", () => {
  render(<PurchaseOrderForm operationId="operation" canCreateSales={false} canManagePrice={false} canReadPrice={false} initialSupplierId="supplier" initialMaterialId="material" options={addressOptions} />);
  fireEvent.change(quantity(), { target: { value: "2" } });
  expect(screen.getByRole("alert")).toHaveTextContent("Kho nhận hàng chưa có địa chỉ");
  expect(screen.getByRole("button", { name: "Lưu nháp" })).toBeDisabled();
  expect(screen.queryByText("Bổ sung địa chỉ kho")).not.toBeInTheDocument();
  expect(quantity()).toHaveValue("2");
});

it("completes the warehouse address in context and preserves supplier, lines, price, date and terms", async () => {
  render(<PurchaseOrderForm operationId="operation" canCreateSales={false} canManageWarehouse canManagePrice canReadPrice={false} initialSupplierId="supplier" initialMaterialId="material" options={addressOptions} />);
  fireEvent.change(quantity(), { target: { value: "2.5" } });
  fireEvent.change(screen.getByLabelText("Giá mua thủ công dòng 1"), { target: { value: "3000" } });
  fireEvent.change(screen.getByLabelText("Lý do giá thủ công dòng 1"), { target: { value: "Giá đã duyệt" } });
  fireEvent.change(screen.getByLabelText("Ngày dự kiến"), { target: { value: "2026-10-10T10:00" } });
  fireEvent.change(screen.getByLabelText("Điều khoản mua"), { target: { value: "Giữ ghi chú" } });
  fireEvent.click(screen.getByText("Bổ sung địa chỉ kho"));
  fireEvent.change(screen.getByLabelText("Địa chỉ kho"), { target: { value: "12 Đường kho" } });
  fireEvent.change(screen.getByLabelText("Lý do bổ sung địa chỉ"), { target: { value: "Bổ sung thông tin" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu địa chỉ kho" }));
  await screen.findByText("Địa chỉ kho: 12 Đường kho");
  expect(hidden("supplierId")).toBe("supplier");
  expect(screen.getByLabelText("Kho nhận")).toHaveValue("warehouse");
  expect(quantity()).toHaveValue("2.5");
  expect(screen.getByLabelText("Giá mua thủ công dòng 1")).toHaveValue("3.000");
  expect(screen.getByLabelText("Ngày dự kiến")).toHaveValue("2026-10-10T10:00");
  expect(screen.getByLabelText("Điều khoản mua")).toHaveValue("Giữ ghi chú");
  expect(screen.getByRole("button", { name: "Lưu nháp" })).toBeEnabled();
  expect(updatePurchaseWarehouseAddressAction).toHaveBeenCalledWith(expect.objectContaining({ warehouseId: "warehouse", expectedAddress: null, address: "12 Đường kho" }));
});

it("refreshes a legacy draft snapshot only by explicit action and advances its expected version", async () => {
  render(<PurchaseOrderForm operationId="operation" canCreateSales={false} canManagePrice={false} canReadPrice={false} options={{ ...addressOptions, warehouses: [{ id: "warehouse", name: "Kho", address: "Địa chỉ mới" }] }}
    existing={{ id: "po", version: 1, supplierId: "supplier", warehouseId: "warehouse", destinationType: "WAREHOUSE", sourceSalesOrderId: null, expectedAt: null, terms: null, destinationAddress: "",
      lines: [{ sourceLineId: "line", salesLineId: "", materialId: "material", uomId: "uom", quantity: "2", manualCostVnd: "", manualCostReason: "" }] }} />);
  fireEvent.change(quantity(), { target: { value: "3" } });
  expect(updatePurchaseDraftDestinationAction).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Lý do cập nhật kho nhận"), { target: { value: "Bổ sung snapshot" } });
  fireEvent.click(screen.getByRole("button", { name: "Cập nhật địa chỉ từ kho" }));
  await screen.findByText("Địa chỉ nhận đã lưu trên đơn mua: Địa chỉ mới");
  expect(quantity()).toHaveValue("3");
  expect(document.querySelector('input[name="expectedVersion"]')).toHaveValue("2");
  expect(screen.getByText("NCC")).toBeInTheDocument();
});

const businessOptions = {
  suppliers: [{ id: "business-supplier", name: "NCC nghiệm thu" }],
  warehouses: [{ id: "business-warehouse", name: "Kho đang chọn", address: null as string | null }], customers: [],
  materials: [{ id: "bags", code: "VT-A", name: "Vật tư A", uoms: [{ id: "bag", symbol: "bao" }] }, { id: "volume", code: "VT-B", name: "Vật tư B", uoms: [{ id: "m3", symbol: "m³" }] }],
};
function enterBusinessDraft() {
  searchMaterial("VT-A");
  fireEvent.change(quantity(1), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("Giá mua thủ công dòng 1"), { target: { value: "60000" } });
  fireEvent.change(screen.getByLabelText("Lý do giá thủ công dòng 1"), { target: { value: "Giá fixture được duyệt" } });
  searchMaterial("VT-B");
  fireEvent.change(quantity(2), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Giá mua thủ công dòng 2"), { target: { value: "200000" } });
  fireEvent.change(screen.getByLabelText("Lý do giá thủ công dòng 2"), { target: { value: "Giá fixture được duyệt" } });
  fireEvent.change(screen.getByLabelText("Ngày dự kiến"), { target: { value: "2026-10-20T09:30" } });
  fireEvent.change(screen.getByLabelText("Điều khoản mua"), { target: { value: "Ghi chú nghiệm thu giữ nguyên" } });
}
function expectBusinessDraft() {
  expect(hidden("supplierId")).toBe("business-supplier");
  expect(screen.getByLabelText("Kho nhận")).toHaveValue("business-warehouse");
  expect([quantity(1), quantity(2)].map((input) => (input as HTMLInputElement).value)).toEqual(["10", "2"]);
  expect([1, 2].map((row) => (screen.getByLabelText(`Giá mua thủ công dòng ${row}`) as HTMLInputElement).value)).toEqual(["60.000", "200.000"]);
  expect(screen.getByLabelText("Ngày dự kiến")).toHaveValue("2026-10-20T09:30");
  expect(screen.getByLabelText("Điều khoản mua")).toHaveValue("Ghi chú nghiệm thu giữ nguyên");
  expect([1, 2].map((row) => (screen.getByLabelText(`ĐVT mua dòng ${row}`) as HTMLSelectElement).value)).toEqual(["bag", "m3"]);
}
it.each([null, "", " \t\n "])("NV-01 component rejects blank address %j and preserves two lines", (address) => {
  render(<PurchaseOrderForm operationId="business-intent" canCreateSales={false} canManagePrice canReadPrice={false} initialSupplierId="business-supplier" options={{ ...businessOptions, warehouses: [{ ...businessOptions.warehouses[0], address }] }} />);
  enterBusinessDraft();
  const save = screen.getByRole("button", { name: "Lưu nháp" });
  expect(save).toBeDisabled();
  fireEvent.submit(save.closest("form")!);
  expect(createPurchaseOrderAction).not.toHaveBeenCalled();
  expectBusinessDraft();
  expect(screen.getByRole("alert")).toHaveTextContent("Kho nhận hàng chưa có địa chỉ");
});
it("NV-02 component retains the full business draft after warehouse update fails and succeeds", async () => {
  vi.mocked(updatePurchaseWarehouseAddressAction).mockResolvedValueOnce({ success: false, message: "Địa chỉ kho đã được người khác sửa" }).mockResolvedValueOnce({ success: true, message: "Đã bổ sung địa chỉ kho", address: "Địa chỉ kho nghiệm thu" });
  render(<PurchaseOrderForm operationId="business-intent" canCreateSales={false} canManageWarehouse canManagePrice canReadPrice={false} initialSupplierId="business-supplier" options={businessOptions} />);
  enterBusinessDraft();
  fireEvent.click(screen.getByText("Bổ sung địa chỉ kho"));
  fireEvent.change(screen.getByLabelText("Địa chỉ kho"), { target: { value: "Địa chỉ kho nghiệm thu" } });
  fireEvent.change(screen.getByLabelText("Lý do bổ sung địa chỉ"), { target: { value: "Bổ sung cho nghiệm thu" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu địa chỉ kho" }));
  await screen.findByText("Địa chỉ kho đã được người khác sửa");
  expectBusinessDraft();
  fireEvent.click(screen.getByRole("button", { name: "Lưu địa chỉ kho" }));
  await screen.findByText("Địa chỉ kho: Địa chỉ kho nghiệm thu");
  expectBusinessDraft();
  expect(screen.getByRole("button", { name: "Lưu nháp" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: /Xác nhận|Tạo đơn mua/ })).not.toBeInTheDocument();
});
it("NV-01 server rejection preserves business input and the creation operation ID", async () => {
  vi.mocked(createPurchaseOrderAction).mockResolvedValueOnce({ message: "Kho nhận hàng chưa có địa chỉ. Vui lòng bổ sung địa chỉ kho trước khi lưu đơn mua." });
  render(<PurchaseOrderForm operationId="business-stable-intent" canCreateSales={false} canManagePrice canReadPrice={false} initialSupplierId="business-supplier" options={{ ...businessOptions, warehouses: [{ ...businessOptions.warehouses[0], address: "Địa chỉ lúc mở form" }] }} />);
  enterBusinessDraft();
  fireEvent.click(screen.getByRole("button", { name: "Lưu nháp" }));
  await screen.findByText("Kho nhận hàng chưa có địa chỉ. Vui lòng bổ sung địa chỉ kho trước khi lưu đơn mua.");
  expectBusinessDraft();
  expect(document.querySelector('input[name="operationId"]')).toHaveValue("business-stable-intent");
  const data = vi.mocked(createPurchaseOrderAction).mock.calls[0][1] as FormData;
  expect(data.getAll("manualCostVnd")).toEqual(["60000", "200000"]);
  expect(data.getAll("manualCostReason")).toEqual(["Giá fixture được duyệt", "Giá fixture được duyệt"]);
  expect(data.getAll("salesLineId")).toEqual(["", ""]);
});
