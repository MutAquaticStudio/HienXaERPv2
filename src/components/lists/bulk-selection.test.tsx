import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ bulk: vi.fn(), exportCsv: vi.fn(), refresh: vi.fn(), assign: vi.fn() }));
vi.mock("@/modules/pricing/purchase-book-actions", () => ({ assignSupplierToMaterialsAction: m.assign }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/modules/catalog/bulk-actions", () => ({ bulkCatalogAction: m.bulk, exportCatalogCsvAction: m.exportCsv }));

import { BULK_CLEAR } from "@/modules/catalog/bulk";
import { BulkActionBar, BulkPageCheckbox, BulkRowCheckbox, BulkSelection } from "./bulk-selection";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const pageIds = ["a", "b"];
const fields = [
  { field: "tier_code", label: "Nhóm giá", control: "option" as const, options: [{ value: BULK_CLEAR, label: "Giá chung" }, { value: "SI", label: "Sỉ" }] },
  { field: "payment_terms_days", label: "Hạn thanh toán (ngày)", control: "days" as const },
];
function list(matchingIds?: string[], total = 2) {
  return render(<BulkSelection>
    <BulkActionBar kind="customers" pageIds={pageIds} matchingIds={matchingIds} total={total} fields={fields} activeLabels={{ stop: "Ngừng giao dịch", restart: "Giao dịch lại" }} />
    <table><thead><tr><th><BulkPageCheckbox ids={pageIds} /></th></tr></thead>
      <tbody>{pageIds.map((id) => <tr key={id}><td><BulkRowCheckbox id={id} label={`KH ${id}`} /></td></tr>)}</tbody></table>
  </BulkSelection>);
}

describe("bulk selection on a list", () => {
  it("stays hidden until a row is chosen, then changes the chosen rows only after a second confirmation", async () => {
    m.bulk.mockResolvedValue({ status: "SUCCESS", message: "Đã cập nhật 2 khách hàng.", changed: 2, unchanged: 0, failed: [] });
    list();
    expect(screen.queryByRole("region", { name: "Thao tác với các dòng đã chọn" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Chọn tất cả trên trang này" }));
    const bar = screen.getByRole("region", { name: "Thao tác với các dòng đã chọn" });
    expect(within(bar).getByText("Đã chọn 2 khách hàng")).toBeInTheDocument();
    fireEvent.change(within(bar).getByLabelText("Thao tác"), { target: { value: "set:tier_code" } });
    fireEvent.change(within(bar).getByLabelText("Nhóm giá"), { target: { value: "SI" } });
    fireEvent.click(within(bar).getByRole("button", { name: "Áp dụng" }));
    expect(m.bulk).not.toHaveBeenCalled();
    expect(within(bar).getByRole("alertdialog")).toHaveTextContent("Đổi Nhóm giá của 2 khách hàng thành “Sỉ”?");
    fireEvent.click(within(bar).getByRole("button", { name: "Xác nhận" }));
    await waitFor(() => expect(m.bulk).toHaveBeenCalledWith({ kind: "customers", ids: ["a", "b"], operation: { type: "set", field: "tier_code", value: "SI" } }));
    expect(await screen.findByRole("status")).toHaveTextContent("Đã cập nhật 2 khách hàng.");
    expect(m.refresh).toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Chọn KH a" })).not.toBeChecked();
  });

  it("sends a cleared choice as empty and lists the rows that failed", async () => {
    m.bulk.mockResolvedValue({ status: "PARTIAL", message: "Đã cập nhật 1 khách hàng; 1 khách hàng không thực hiện được.", changed: 1, unchanged: 0,
      failed: [{ code: "KH045", reason: "vừa bị người khác sửa — tải lại rồi thử lại" }] });
    list();
    fireEvent.click(screen.getByRole("checkbox", { name: "Chọn KH a" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Chọn KH b" }));
    fireEvent.change(screen.getByLabelText("Thao tác"), { target: { value: "set:tier_code" } });
    fireEvent.change(screen.getByLabelText("Nhóm giá"), { target: { value: BULK_CLEAR } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    await waitFor(() => expect(m.bulk).toHaveBeenCalledWith(expect.objectContaining({ operation: { type: "set", field: "tier_code", value: "" } })));
    expect(await screen.findByText("KH045")).toBeInTheDocument();
  });

  it("checks a typed number of days before asking, and offers to choose every row matching the filter", () => {
    list(["a", "b", "c", "d"], 4);
    fireEvent.click(screen.getByRole("checkbox", { name: "Chọn tất cả trên trang này" }));
    fireEvent.click(screen.getByRole("button", { name: "Chọn tất cả 4 khách hàng theo bộ lọc" }));
    expect(screen.getByText("Đã chọn 4 khách hàng")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Thao tác"), { target: { value: "set:payment_terms_days" } });
    fireEvent.change(screen.getByLabelText("Hạn thanh toán (ngày)"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Nhập số ngày từ 0 đến 365.");
    fireEvent.change(screen.getByLabelText("Thao tác"), { target: { value: "delete" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Xóa hẳn 4 khách hàng?");
    fireEvent.click(screen.getByRole("button", { name: "Bỏ chọn" }));
    expect(screen.queryByRole("region", { name: "Thao tác với các dòng đã chọn" })).not.toBeInTheDocument();
  });

  it("exports the chosen rows as a file", async () => {
    m.exportCsv.mockResolvedValue({ status: "SUCCESS", csv: "a", filename: "khach-hang.csv" });
    const createObjectURL = vi.fn(() => "blob:x");
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    list();
    fireEvent.click(screen.getByRole("checkbox", { name: "Chọn KH b" }));
    fireEvent.click(screen.getByRole("button", { name: "Xuất Excel (CSV)" }));
    await waitFor(() => expect(m.exportCsv).toHaveBeenCalledWith({ kind: "customers", ids: ["b"] }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
  });
});

it("D61: assigns one supplier to the chosen materials after a confirmation, and keeps the operation when the outcome is unclear", async () => {
  m.assign.mockResolvedValueOnce({ status: "FAILED", outcomeUnknown: true, message: "Chưa xác định kết quả.", changed: 0, unchanged: 0, failed: [] })
    .mockResolvedValueOnce({ status: "PARTIAL", message: "Đã gán 1 vật tư cho Phú Thành. 1 vật tư bỏ qua.", changed: 1, unchanged: 0, failed: [{ code: "DV", reason: "không cho phép mua" }] });
  render(<BulkSelection>
    <BulkActionBar kind="materials" pageIds={pageIds} total={2} fields={[]} activeLabels={{ stop: "Ngừng dùng", restart: "Dùng lại" }} assignSuppliers={[{ id: "pt", name: "Phú Thành" }]} />
    <BulkPageCheckbox ids={pageIds} />
  </BulkSelection>);
  fireEvent.click(screen.getByRole("checkbox", { name: "Chọn tất cả trên trang này" }));
  const bar = screen.getByRole("region", { name: "Thao tác với các dòng đã chọn" });
  fireEvent.change(within(bar).getByLabelText("Thao tác"), { target: { value: "assign-supplier" } });
  fireEvent.click(within(bar).getByRole("button", { name: "Áp dụng" }));
  expect(within(bar).getByRole("alert")).toHaveTextContent("Chọn nhà cung cấp.");
  fireEvent.change(within(bar).getByLabelText("Nhà cung cấp"), { target: { value: "pt" } });
  fireEvent.click(within(bar).getByRole("button", { name: "Áp dụng" }));
  expect(within(bar).getByRole("alertdialog")).toHaveTextContent("Gán 2 vật tư cho Phú Thành?");
  fireEvent.click(within(bar).getByRole("button", { name: "Xác nhận" }));
  await waitFor(() => expect(m.assign).toHaveBeenCalledTimes(1));
  const first = m.assign.mock.calls[0][0];
  expect(first).toMatchObject({ supplierId: "pt", materialIds: ["a", "b"] });
  fireEvent.click(await within(bar).findByRole("button", { name: "Xác nhận" }));
  await waitFor(() => expect(m.assign).toHaveBeenCalledTimes(2));
  expect(m.assign.mock.calls[1][0].operationId).toBe(first.operationId);
  expect(await screen.findByText("Đã gán 1 vật tư cho Phú Thành. 1 vật tư bỏ qua.")).toBeInTheDocument();
  expect(screen.getByText("DV")).toBeInTheDocument();
  expect(m.refresh).toHaveBeenCalled();
  expect(m.bulk).not.toHaveBeenCalled();
});

it("offers no supplier assignment without the purchase price permission", () => {
  list();
  fireEvent.click(screen.getByRole("checkbox", { name: "Chọn tất cả trên trang này" }));
  expect(screen.queryByRole("option", { name: "Gán nhà cung cấp" })).not.toBeInTheDocument();
});
