import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CommercialDocumentForm } from "./commercial-document-form";

const mocks = vi.hoisted(() => ({ save: vi.fn(), preview: vi.fn(), sites: vi.fn() }));
vi.mock("@/modules/sales/actions", () => ({
  createQuotationAction: mocks.save, createSalesOrderAction: mocks.save,
  updateQuotationDraftAction: mocks.save, updateSalesOrderDraftAction: mocks.save,
  previewCommercialDocumentAction: mocks.preview,
}));
vi.mock("@/modules/sales/form-lookup-actions", () => ({ searchSalesCustomersAction: vi.fn(), searchSalesSitesAction: mocks.sites }));
vi.mock("@/modules/customers/actions", () => ({ createCustomerQuickAction: vi.fn(), createSiteQuickAction: vi.fn() }));
const props = {
  kind: "order" as const, operationId: "10000000-0000-4000-8000-000000000001", canManagePrice: true, canManageCustomers: false,
  options: { customers: [
    { id: "customer-a", name: "Khách A", sites: [{ id: "site-a", name: "Công trình A", address: "Địa chỉ A" }] },
    { id: "customer-b", name: "Khách B", sites: [{ id: "site-b", name: "Công trình B", address: "Địa chỉ B" }] },
  ], materials: [{ id: "material", name: "Vật tư", uoms: [{ id: "uom-a", symbol: "bao" }, { id: "uom-b", symbol: "tấn" }] }] },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({ message: "Không thể lưu: kiểm tra dữ liệu." });
  mocks.preview.mockResolvedValue({ success: true, message: "Đã xem giá", totalVnd: "120000", lines: [{ unitPriceVnd: "120000", priceSourceType: "LIST", lineTotalVnd: "120000" }] });
  mocks.sites.mockResolvedValue(props.options.customers[1].sites);
});
afterEach(cleanup);
async function previewAndSubmit() {
  fireEvent.click(screen.getByRole("button", { name: "Tính giá và xem trước" }));
  const button = screen.getByRole("button", { name: "Lưu bản nháp" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.submit(button.closest("form")!);
}
it("preserves customer, site, all line fields, date, notes and intent after a rejected save", async () => {
  render(<CommercialDocumentForm {...props} initialCustomerId="customer-b" initialSiteId="site-b" />);
  fireEvent.change(screen.getByLabelText("Đơn vị bán *"), { target: { value: "uom-b" } });
  fireEvent.change(screen.getByLabelText("Số lượng *"), { target: { value: "2.5" } });
  fireEvent.change(screen.getByLabelText("Giá thủ công (VND, nếu cần)"), { target: { value: "120000" } });
  fireEvent.change(screen.getByLabelText("Lý do giá thủ công"), { target: { value: "Giá đã duyệt" } });
  fireEvent.change(screen.getByLabelText("Ngày giao dự kiến"), { target: { value: "2026-10-28T09:00" } });
  fireEvent.change(screen.getByLabelText("Điều khoản / ghi chú"), { target: { value: "Giữ nguyên ghi chú" } });
  await previewAndSubmit(); await screen.findByText("Không thể lưu: kiểm tra dữ liệu.");
  expect(screen.getByLabelText("Khách hàng")).toHaveValue("customer-b");
  expect(screen.getByLabelText("Công trình / điểm giao")).toHaveValue("site-b");
  expect(screen.getByLabelText("Đơn vị bán *")).toHaveValue("uom-b");
  expect(screen.getByLabelText("Số lượng *")).toHaveValue("2.5");
  expect(screen.getByLabelText("Ngày giao dự kiến")).toHaveValue("2026-10-28T09:00");
  expect(screen.getByLabelText("Điều khoản / ghi chú")).toHaveValue("Giữ nguyên ghi chú");
  fireEvent.change(screen.getByLabelText("Số lượng *"), { target: { value: "3" } });
  await previewAndSubmit(); await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
  expect(mocks.save.mock.calls.map(call => call[1].get("operationId"))).toEqual([props.operationId, props.operationId]);
  expect(mocks.save.mock.calls[1][1].get("quantity")).toBe("3");
});
it.each(["", "0", "-1", "NaN", "Infinity", "0.0000001"])("blocks invalid quantity %s with a line error", (value) => {
  render(<CommercialDocumentForm {...props} />);
  fireEvent.change(screen.getByLabelText("Số lượng *"), { target: { value } });
  expect(screen.getByRole("button", { name: "Tính giá và xem trước" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Lưu bản nháp" })).toBeDisabled();
  expect(screen.getByLabelText("Số lượng *")).toHaveAttribute("aria-invalid", "true");
});
it("does not silently save the valid subset of a multiline draft", () => {
  render(<CommercialDocumentForm {...props} />);
  fireEvent.change(screen.getByLabelText("Số lượng *"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Thêm dòng" }));
  fireEvent.change(screen.getAllByLabelText("Số lượng *")[1], { target: { value: "0" } });
  expect(screen.getByRole("button", { name: "Tính giá và xem trước" })).toBeDisabled();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("does not auto-select the first site when the user changes customer", async () => {
  render(<CommercialDocumentForm {...props} />);
  fireEvent.change(screen.getByLabelText("Khách hàng"), { target: { value: "customer-b" } });
  await waitFor(() => expect(mocks.sites).toHaveBeenCalled());
  await act(async () => {});
  expect(screen.getByLabelText("Công trình / điểm giao")).toHaveValue("");
});
it("retries an unknown outcome with the exact captured payload and operation ID", async () => {
  mocks.save.mockRejectedValueOnce(new Error("QA transport disconnected"));
  render(<CommercialDocumentForm {...props} />);
  fireEvent.change(screen.getByLabelText("Số lượng *"), { target: { value: "2" } });
  await previewAndSubmit();
  const retry = await screen.findByRole("button", { name: "Thử lại đúng thao tác" });
  fireEvent.change(screen.getByLabelText("Số lượng *"), { target: { value: "3" } });
  fireEvent.click(retry);
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
  expect(mocks.save.mock.calls.map(call => call[1].get("quantity"))).toEqual(["2", "2"]);
  expect(mocks.save.mock.calls.map(call => call[1].get("operationId"))).toEqual([props.operationId, props.operationId]);
});
