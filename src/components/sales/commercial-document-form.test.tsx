import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CommercialDocumentForm } from "./commercial-document-form";

const mocks = vi.hoisted(() => ({ save: vi.fn(), preview: vi.fn(), sites: vi.fn(), customers: vi.fn() }));
vi.mock("@/modules/sales/actions", () => ({
  createQuotationAction: mocks.save, createSalesOrderAction: mocks.save,
  updateQuotationDraftAction: mocks.save, updateSalesOrderDraftAction: mocks.save,
  previewCommercialDocumentAction: mocks.preview,
}));
vi.mock("@/modules/sales/form-lookup-actions", () => ({ searchSalesCustomersAction: mocks.customers, searchSalesSitesAction: mocks.sites }));
vi.mock("@/modules/customers/actions", () => ({ createCustomerQuickAction: vi.fn(), createSiteQuickAction: vi.fn() }));

const props = {
  kind: "order" as const, operationId: "10000000-0000-4000-8000-000000000001", canManagePrice: true, canManageCustomers: false,
  options: { customers: [
    { id: "customer-a", name: "Khách A", sites: [{ id: "site-a", name: "Công trình A", address: "Địa chỉ A" }] },
    { id: "customer-b", name: "Khách B", sites: [{ id: "site-b", name: "Công trình B", address: "Địa chỉ B" }] },
  ], materials: [
    { id: "material", code: "XM01", name: "Xi măng", uoms: [{ id: "uom-a", symbol: "bao" }, { id: "uom-b", symbol: "tấn" }] },
    { id: "stone", code: "DA12", name: "Đá 1x2", uoms: [{ id: "uom-m3", symbol: "m3" }] },
  ] },
};
const ready = { ...props, initialCustomerId: "customer-a", initialSiteId: "site-a", initialMaterialId: "material" };
const confirmId = "20000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({ message: "Không thể lưu: kiểm tra dữ liệu." });
  mocks.preview.mockResolvedValue({ success: true, message: "Đã xem giá", totalVnd: "120000", lines: [{ unitPriceVnd: "120000", priceSourceType: "LIST", lineTotalVnd: "120000" }] });
  mocks.sites.mockResolvedValue(props.options.customers[1].sites);
  mocks.customers.mockResolvedValue([]);
});
afterEach(cleanup);

const quantity = (row = 1) => screen.getByLabelText(`Số lượng dòng ${row}`);
const draftButton = () => screen.getByRole("button", { name: "Lưu nháp" });
async function waitForPrice() { await waitFor(() => expect(draftButton()).toBeEnabled()); }
function pickCustomer(name: string) {
  const input = screen.getByRole("combobox", { name: "Khách hàng" });
  fireEvent.focus(input);
  fireEvent.mouseDown(screen.getByRole("option", { name }));
}
function searchMaterial(text: string) {
  const input = screen.getByRole("combobox", { name: "Tìm vật tư" });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
}

it("automatically previews valid new input without writing a document", async () => {
  render(<CommercialDocumentForm {...ready} />);
  fireEvent.change(quantity(), { target: { value: "2" } });
  await waitFor(() => expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ lines: [expect.objectContaining({ quantity: "2", orderedUomId: "uom-a" })] })));
  expect(mocks.save).not.toHaveBeenCalled();
  expect(await screen.findByText("120.000 ₫", { selector: ".doc-editor-total dd" })).toBeInTheDocument();
});

it("adds a line from the search box by code or accent-free name, and adds one more on a repeat pick", async () => {
  render(<CommercialDocumentForm {...props} />);
  expect(screen.getByText(/Chưa có dòng hàng/)).toBeInTheDocument();
  searchMaterial("da 1x2");
  expect(screen.getByText("Đá 1x2")).toBeInTheDocument();
  expect(quantity()).toHaveValue("1");
  await waitFor(() => expect(quantity()).toHaveFocus());
  searchMaterial("xm01");
  searchMaterial("XM01");
  expect(screen.getAllByRole("row")).toHaveLength(3);
  expect(quantity(2)).toHaveValue("2");
});

it("keeps Enter inside a line from submitting and returns to the material search", async () => {
  render(<CommercialDocumentForm {...ready} />);
  await waitForPrice();
  fireEvent.keyDown(quantity(), { key: "Enter" });
  expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.getByRole("combobox", { name: "Tìm vật tư" })).toHaveFocus();
});

it("does not passively reprice a stored draft when it first opens", async () => {
  render(<CommercialDocumentForm {...props} existing={{ id: "draft", version: 1, customerId: "customer-a", siteId: "site-a", effectiveAt: null, terms: "Original", lines: [{ sourceLineId: "old-line", materialId: "material", uomId: "uom-a", quantity: "2", manualPriceVnd: "90000", manualReason: "Old approved reason" }] }} />);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Đơn giá thủ công dòng 1")).toHaveValue("90000");
  expect(screen.getByLabelText("Lý do giá thủ công dòng 1")).toHaveValue("Old approved reason");
  expect(screen.getByText("Khách A")).toBeInTheDocument();
});

it("discards an older asynchronous result after UOM changes", async () => {
  let finishOld: (value: Awaited<ReturnType<typeof mocks.preview>>) => void = () => {};
  mocks.preview.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
  render(<CommercialDocumentForm {...ready} />);
  fireEvent.change(quantity(), { target: { value: "2" } });
  await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText("ĐVT bán dòng 1"), { target: { value: "uom-b" } });
  await act(async () => finishOld({ success: false, message: "Giá cũ không còn đúng", lines: [], totalVnd: "999" }));
  expect(screen.queryByText("Giá cũ không còn đúng")).not.toBeInTheDocument();
  await waitFor(() => expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ lines: [expect.objectContaining({ orderedUomId: "uom-b" })] })));
});

it("preserves customer, site, all line fields, date, notes and intent after a rejected save", async () => {
  const { container } = render(<CommercialDocumentForm {...ready} initialCustomerId="customer-b" initialSiteId="site-b" />);
  fireEvent.change(screen.getByLabelText("ĐVT bán dòng 1"), { target: { value: "uom-b" } });
  fireEvent.change(quantity(), { target: { value: "2.5" } });
  fireEvent.change(screen.getByLabelText("Đơn giá thủ công dòng 1"), { target: { value: "120000" } });
  fireEvent.change(screen.getByLabelText("Lý do giá thủ công dòng 1"), { target: { value: "Giá đã duyệt" } });
  fireEvent.change(screen.getByLabelText("Ngày giao dự kiến"), { target: { value: "2026-10-28T09:00" } });
  fireEvent.change(screen.getByLabelText("Điều khoản / ghi chú"), { target: { value: "Giữ nguyên ghi chú" } });
  await waitForPrice();
  fireEvent.click(draftButton());
  await screen.findByText("Không thể lưu: kiểm tra dữ liệu.");
  expect(container.querySelector<HTMLInputElement>("input[name=customerId]")?.value).toBe("customer-b");
  expect(container.querySelector<HTMLInputElement>("input[name=siteId]")?.value).toBe("site-b");
  expect(screen.getByLabelText("ĐVT bán dòng 1")).toHaveValue("uom-b");
  expect(quantity()).toHaveValue("2.5");
  expect(screen.getByLabelText("Lý do giá thủ công dòng 1")).toHaveValue("Giá đã duyệt");
  expect(screen.getByLabelText("Ngày giao dự kiến")).toHaveValue("2026-10-28T09:00");
  expect(screen.getByLabelText("Điều khoản / ghi chú")).toHaveValue("Giữ nguyên ghi chú");
  const first = mocks.save.mock.calls[0][1] as FormData;
  expect(first.getAll("manualReason")).toEqual(["Giá đã duyệt"]);
  expect(first.get("intent")).toBe("draft");
  fireEvent.change(quantity(), { target: { value: "3" } });
  await waitForPrice();
  fireEvent.click(draftButton());
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
  expect(mocks.save.mock.calls.map(call => call[1].get("operationId"))).toEqual([props.operationId, props.operationId]);
  expect(mocks.save.mock.calls[1][1].get("quantity")).toBe("3");
});

it("posts one value per field for every line, in line order", async () => {
  render(<CommercialDocumentForm {...ready} />);
  searchMaterial("DA12");
  fireEvent.change(screen.getByLabelText("Đơn giá thủ công dòng 2"), { target: { value: "500000" } });
  fireEvent.change(screen.getByLabelText("Lý do giá thủ công dòng 2"), { target: { value: "Giá công trình" } });
  mocks.preview.mockResolvedValue({ success: true, message: "", totalVnd: "620000", lines: [
    { unitPriceVnd: "120000", priceSourceType: "LIST", lineTotalVnd: "120000" }, { unitPriceVnd: "500000", priceSourceType: "MANUAL_APPROVED", lineTotalVnd: "500000" }] });
  await waitForPrice();
  fireEvent.click(draftButton());
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  const data = mocks.save.mock.calls[0][1] as FormData;
  expect(data.getAll("materialId")).toEqual(["material", "stone"]);
  expect(data.getAll("orderedUomId")).toEqual(["uom-a", "uom-m3"]);
  expect(data.getAll("quantity")).toEqual(["1", "1"]);
  expect(data.getAll("manualPriceVnd")).toEqual(["", "500000"]);
  expect(data.getAll("manualReason")).toEqual(["", "Giá công trình"]);
  expect(data.getAll("sourceLineId")).toEqual(["", ""]);
});

it("'Tạo đơn' saves and confirms with its own operation ID; it is absent without confirm permission", async () => {
  const { unmount } = render(<CommercialDocumentForm {...ready} canConfirm confirmOperationId={confirmId} />);
  const create = screen.getByRole("button", { name: "Tạo đơn" });
  await waitFor(() => expect(create).toBeEnabled());
  fireEvent.click(create);
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  const data = mocks.save.mock.calls[0][1] as FormData;
  expect(data.get("intent")).toBe("confirm");
  expect(data.get("confirmOperationId")).toBe(confirmId);
  expect(data.get("operationId")).toBe(props.operationId);
  unmount();
  render(<CommercialDocumentForm {...ready} confirmOperationId={confirmId} />);
  expect(screen.queryByRole("button", { name: "Tạo đơn" })).not.toBeInTheDocument();
});

it.each(["", "0", "-1", "NaN", "Infinity", "0.0000001"])("blocks invalid quantity %s with a line error", (value) => {
  render(<CommercialDocumentForm {...ready} />);
  fireEvent.change(quantity(), { target: { value } });
  expect(draftButton()).toBeDisabled();
  expect(quantity()).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("alert")).toHaveTextContent("Nhập số lượng lớn hơn 0");
});

it("does not silently save the valid subset of a multiline draft", async () => {
  render(<CommercialDocumentForm {...ready} />);
  searchMaterial("DA12");
  fireEvent.change(quantity(2), { target: { value: "0" } });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
  expect(draftButton()).toBeDisabled();
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});

it("does not auto-select a site when the user changes customer (SPEC-JOURNEY-003)", async () => {
  const { container } = render(<CommercialDocumentForm {...props} />);
  expect(container.querySelector<HTMLInputElement>("input[name=customerId]")?.value).toBe("");
  pickCustomer("Khách B");
  await waitFor(() => expect(mocks.sites).toHaveBeenCalledWith("order", "customer-b", ""));
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Công trình / điểm giao" })).toHaveFocus());
  expect(container.querySelector<HTMLInputElement>("input[name=siteId]")?.value).toBe("");
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Công trình / điểm giao" }), { key: "Enter" });
  expect(container.querySelector<HTMLInputElement>("input[name=siteId]")?.value).toBe("site-b");
});

it("retries an unknown outcome with the exact captured payload and operation ID", async () => {
  mocks.save.mockRejectedValueOnce(new Error("QA transport disconnected"));
  render(<CommercialDocumentForm {...ready} />);
  fireEvent.change(quantity(), { target: { value: "2" } });
  await waitForPrice();
  fireEvent.click(draftButton());
  const retry = await screen.findByRole("button", { name: "Thử lại đúng thao tác" });
  fireEvent.change(quantity(), { target: { value: "3" } });
  fireEvent.click(retry);
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
  expect(mocks.save.mock.calls.map(call => call[1].get("quantity"))).toEqual(["2", "2"]);
  expect(mocks.save.mock.calls.map(call => call[1].get("operationId"))).toEqual([props.operationId, props.operationId]);
});
