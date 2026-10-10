import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PurchaseOrderForm } from "./purchase-order-form";
import { createPurchaseOrderAction, previewWarehousePurchaseAction, searchPurchaseSuppliersAction, updatePurchaseWarehouseAddressAction, updatePurchaseDraftDestinationAction } from "@/modules/purchasing/actions";
vi.mock("@/modules/purchasing/actions", () => ({
  createPurchaseOrderAction: vi.fn(async () => ({ message: "Giá đã thay đổi" })),
  updatePurchaseOrderDraftAction: vi.fn(),
  updatePurchaseWarehouseAddressAction: vi.fn(async () => ({ success: true, message: "Đã bổ sung địa chỉ kho", address: "12 Đường kho" })),
  updatePurchaseDraftDestinationAction: vi.fn(async () => ({ success: true, message: "Đã cập nhật địa chỉ PO", version: 2, warehouseId: "warehouse", address: "Địa chỉ mới" })),
  searchPurchaseSuppliersAction: vi.fn(async () => ({ suppliers: [{ id: "outside-page", name: "NCC ngoài trang đầu" }], message: "Tìm được NCC" })),
  previewWarehousePurchaseAction: vi.fn(async () => ({ success: true, message: "Đã xem giá", lines: [], totalVnd: "260000", sales: { totalVnd: "420000", lines: [{ unitPriceVnd: "120000", priceSourceType: "LIST", lineTotalVnd: "420000" }] } })),
}));
afterEach(cleanup);

it("preserves destination, customer, materials, date and terms after a failed save", async () => {
  render(<PurchaseOrderForm operationId="operation" canCreateSales canManagePrice canReadPrice options={{
    suppliers: [{ id: "supplier", name: "NCC UAT" }], warehouses: [{ id: "warehouse", name: "Kho UAT", address: "Địa chỉ kho UAT" }],
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
  suppliers: [{ id: "supplier", name: "NCC UAT" }], warehouses: [{ id: "warehouse", name: "Kho UAT", address: "Địa chỉ kho UAT" }], customers: [],
  materials: [{ id: "a", name: "Vật tư A", uoms: [{ id: "uom", symbol: "bao" }] }],
};

it("auto-previews a valid purchase without creating PO/SO", async () => {
  vi.mocked(previewWarehousePurchaseAction).mockClear();vi.mocked(createPurchaseOrderAction).mockClear();
  render(<PurchaseOrderForm operationId="auto-preview" canCreateSales={false} canManagePrice canReadPrice options={supplierOptions} />);
  fireEvent.change(screen.getByLabelText("Số lượng *"), { target: { value: "3" } });
  await waitFor(() => expect(previewWarehousePurchaseAction).toHaveBeenCalledWith(expect.objectContaining({ supplierId: "supplier", lines: [expect.objectContaining({ quantity: "3" })] })));
  expect(createPurchaseOrderAction).not.toHaveBeenCalled();
});
it("never requests cost preview for an actor without cost read", async () => {
  vi.mocked(previewWarehousePurchaseAction).mockClear();
  render(<PurchaseOrderForm operationId="hidden-cost" canCreateSales={false} canManagePrice={false} canReadPrice={false} options={supplierOptions} />);
  fireEvent.change(screen.getByLabelText("Số lượng *"), { target: { value: "3" } });
  await new Promise(resolve => setTimeout(resolve, 350));
  expect(previewWarehousePurchaseAction).not.toHaveBeenCalled();
  expect(screen.getByText("Giá mua được giữ ẩn theo quyền. Hệ thống vẫn kiểm tra giá khi lưu.")).toBeInTheDocument();
});

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


const addressOptions = { suppliers: [{ id: "supplier", name: "NCC" }], warehouses: [{ id: "warehouse", name: "Kho thiếu địa chỉ", address: null }], customers: [], materials: [{ id: "material", name: "Cát", uoms: [{ id: "uom", symbol: "m³" }] }] };
it("blocks missing warehouse addresses without clearing the draft or offering unauthorized edits", () => {
  render(<PurchaseOrderForm operationId="operation" canCreateSales={false} canManagePrice={false} canReadPrice={false} options={addressOptions} />);
  fireEvent.change(screen.getByLabelText("Số lượng *"), { target: { value: "2" } });
  expect(screen.getByRole("alert")).toHaveTextContent("Kho nhận hàng chưa có địa chỉ");
  expect(screen.getByRole("button", { name: "Lưu nháp đơn mua" })).toBeDisabled();
  expect(screen.queryByText("Bổ sung địa chỉ kho")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Số lượng *")).toHaveValue("2");
});
it("completes the warehouse address in context and preserves supplier, lines, price, date and terms", async () => {
  vi.mocked(updatePurchaseWarehouseAddressAction).mockClear();
  render(<PurchaseOrderForm operationId="operation" canCreateSales={false} canManageWarehouse canManagePrice canReadPrice={false} options={addressOptions} />);
  fireEvent.change(screen.getByLabelText("Số lượng *"), { target: { value: "2.5" } });
  fireEvent.change(screen.getByLabelText("Giá mua thủ công (VND)"), { target: { value: "3000" } });
  fireEvent.change(screen.getByLabelText("Ngày dự kiến"), { target: { value: "2026-10-10T10:00" } });
  fireEvent.change(screen.getByLabelText("Điều khoản mua"), { target: { value: "Giữ ghi chú" } });
  fireEvent.click(screen.getByText("Bổ sung địa chỉ kho"));
  fireEvent.change(screen.getByLabelText("Địa chỉ kho"), { target: { value: "12 Đường kho" } });
  fireEvent.change(screen.getByLabelText("Lý do bổ sung địa chỉ"), { target: { value: "Bổ sung thông tin" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu địa chỉ kho" }));
  await screen.findByText("Địa chỉ kho: 12 Đường kho");
  expect(screen.getByLabelText("Nhà cung cấp")).toHaveValue("supplier");
  expect(screen.getByLabelText("Kho nhận")).toHaveValue("warehouse");
  expect(screen.getByLabelText("Số lượng *")).toHaveValue("2.5");
  expect(screen.getByLabelText("Giá mua thủ công (VND)")).toHaveValue("3000");
  expect(screen.getByLabelText("Ngày dự kiến")).toHaveValue("2026-10-10T10:00");
  expect(screen.getByLabelText("Điều khoản mua")).toHaveValue("Giữ ghi chú");
  expect(screen.getByRole("button", { name: "Lưu nháp đơn mua" })).toBeEnabled();
  expect(updatePurchaseWarehouseAddressAction).toHaveBeenCalledWith(expect.objectContaining({ warehouseId: "warehouse", expectedAddress: null, address: "12 Đường kho" }));
});
it("refreshes a legacy draft snapshot only by explicit action and advances its expected version", async () => {
  vi.mocked(updatePurchaseDraftDestinationAction).mockClear();
  render(<PurchaseOrderForm operationId="operation" canCreateSales={false} canManagePrice={false} canReadPrice={false} options={{ ...addressOptions, warehouses: [{ id: "warehouse", name: "Kho", address: "Địa chỉ mới" }] }} existing={{ id: "po", version: 1, supplierId: "supplier", warehouseId: "warehouse", destinationType: "WAREHOUSE", destinationAddress: "", sourceSalesOrderId: null, expectedAt: null, terms: "Giữ điều khoản", lines: [{ sourceLineId: "line", salesLineId: "", materialId: "material", uomId: "uom", quantity: "2", manualCostVnd: "", manualCostReason: "" }] }} />);
  fireEvent.change(screen.getByLabelText("Số lượng *"), { target: { value: "3" } });
  expect(updatePurchaseDraftDestinationAction).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Lý do cập nhật kho nhận"), { target: { value: "Bổ sung snapshot" } });
  fireEvent.click(screen.getByRole("button", { name: "Cập nhật địa chỉ từ kho" }));
  await screen.findByText("Địa chỉ nhận đã lưu trên đơn mua: Địa chỉ mới");
  expect(screen.getByLabelText("Số lượng *")).toHaveValue("3");
  expect(document.querySelector('input[name="expectedVersion"]')).toHaveValue("2");
});

const businessOptions = {
  suppliers: [{ id: 'business-supplier', name: 'NCC nghiệm thu' }],
  warehouses: [{ id: 'business-warehouse', name: 'Kho đang chọn', address: null as string | null }], customers: [],
  materials: [{ id: 'bags', name: 'Vật tư A', uoms: [{ id: 'bag', symbol: 'bao' }] }, { id: 'volume', name: 'Vật tư B', uoms: [{ id: 'm3', symbol: 'm³' }] }],
};
function enterBusinessDraft() {
  fireEvent.change(screen.getByLabelText('Số lượng *'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Giá mua thủ công (VND)'), { target: { value: '60000' } });
  fireEvent.change(screen.getByLabelText('Lý do giá thủ công'), { target: { value: 'Giá fixture được duyệt' } });
  fireEvent.click(screen.getByRole('button', { name: '+ Thêm dòng' }));
  fireEvent.change(screen.getAllByLabelText('Vật tư *')[1], { target: { value: 'volume' } });
  fireEvent.change(screen.getAllByLabelText('Số lượng *')[1], { target: { value: '2' } });
  fireEvent.change(screen.getAllByLabelText('Giá mua thủ công (VND)')[1], { target: { value: '200000' } });
  fireEvent.change(screen.getAllByLabelText('Lý do giá thủ công')[1], { target: { value: 'Giá fixture được duyệt' } });
  fireEvent.change(screen.getByLabelText('Ngày dự kiến'), { target: { value: '2026-10-20T09:30' } });
  fireEvent.change(screen.getByLabelText('Điều khoản mua'), { target: { value: 'Ghi chú nghiệm thu giữ nguyên' } });
}
function expectBusinessDraft() {
  expect(screen.getByLabelText('Nhà cung cấp')).toHaveValue('business-supplier');
  expect(screen.getByLabelText('Kho nhận')).toHaveValue('business-warehouse');
  expect(screen.getAllByLabelText('Số lượng *').map(x=>(x as HTMLInputElement).value)).toEqual(['10','2']);
  expect(screen.getAllByLabelText('Giá mua thủ công (VND)').map(x=>(x as HTMLInputElement).value)).toEqual(['60000','200000']);
  expect(screen.getByLabelText('Ngày dự kiến')).toHaveValue('2026-10-20T09:30');
  expect(screen.getByLabelText('Điều khoản mua')).toHaveValue('Ghi chú nghiệm thu giữ nguyên');
  expect(screen.getAllByLabelText('Đơn vị mua *').map(x=>(x as HTMLSelectElement).value)).toEqual(['bag','m3']);
}
it.each([null,'',' \t\n '])('NV-01 component rejects blank address %j and preserves two lines', address => {
  vi.mocked(createPurchaseOrderAction).mockClear();
  render(<PurchaseOrderForm operationId="business-intent" canCreateSales={false} canManagePrice canReadPrice={false} options={{...businessOptions,warehouses:[{...businessOptions.warehouses[0],address}]}} />);
  enterBusinessDraft();const save=screen.getByRole('button',{name:'Lưu nháp đơn mua'});expect(save).toBeDisabled();fireEvent.submit(save.closest('form')!);
  expect(createPurchaseOrderAction).not.toHaveBeenCalled();expectBusinessDraft();expect(screen.getByRole('alert')).toHaveTextContent('Kho nhận hàng chưa có địa chỉ');
});
it('NV-02 component retains the full business draft after warehouse update fails and succeeds',async()=>{
  vi.mocked(updatePurchaseWarehouseAddressAction).mockResolvedValueOnce({success:false,message:'Địa chỉ kho đã được người khác sửa'}).mockResolvedValueOnce({success:true,message:'Đã bổ sung địa chỉ kho',address:'Địa chỉ kho nghiệm thu'});
  render(<PurchaseOrderForm operationId="business-intent" canCreateSales={false} canManageWarehouse canManagePrice canReadPrice={false} options={businessOptions} />);enterBusinessDraft();
  fireEvent.click(screen.getByText('Bổ sung địa chỉ kho'));fireEvent.change(screen.getByLabelText('Địa chỉ kho'),{target:{value:'Địa chỉ kho nghiệm thu'}});fireEvent.change(screen.getByLabelText('Lý do bổ sung địa chỉ'),{target:{value:'Bổ sung cho nghiệm thu'}});
  fireEvent.click(screen.getByRole('button',{name:'Lưu địa chỉ kho'}));await screen.findByText('Địa chỉ kho đã được người khác sửa');expectBusinessDraft();
  fireEvent.click(screen.getByRole('button',{name:'Lưu địa chỉ kho'}));await screen.findByText('Địa chỉ kho: Địa chỉ kho nghiệm thu');expectBusinessDraft();expect(screen.getByRole('button',{name:'Lưu nháp đơn mua'})).toBeEnabled();expect(screen.queryByRole('button',{name:/Xác nhận/})).not.toBeInTheDocument();
});
it('NV-01 server rejection preserves business input and the creation operation ID',async()=>{
  vi.mocked(createPurchaseOrderAction).mockResolvedValueOnce({message:'Kho nhận hàng chưa có địa chỉ. Vui lòng bổ sung địa chỉ kho trước khi lưu đơn mua.'});
  render(<PurchaseOrderForm operationId="business-stable-intent" canCreateSales={false} canManagePrice canReadPrice={false} options={{...businessOptions,warehouses:[{...businessOptions.warehouses[0],address:'Địa chỉ lúc mở form'}]}} />);enterBusinessDraft();
  fireEvent.submit(screen.getByRole('button',{name:'Lưu nháp đơn mua'}).closest('form')!);await screen.findByText('Kho nhận hàng chưa có địa chỉ. Vui lòng bổ sung địa chỉ kho trước khi lưu đơn mua.');expectBusinessDraft();expect(document.querySelector('input[name="operationId"]')).toHaveValue('business-stable-intent');
});
