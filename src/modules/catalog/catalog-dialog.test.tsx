import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./editor", () => ({
  CatalogEditor: ({ kind, record, initial, scope, onSaved }: { kind: string; record?: { id: string }; initial?: Record<string, string>; scope: string; onSaved: (saved: { id: string; message: string }) => void }) =>
    <div><p>Biểu mẫu {kind} {record?.id ?? "mới"} {initial?.customer_id ?? ""} · {scope}</p><button type="button" onClick={() => onSaved({ id: "x", message: "Đã lưu danh mục." })}>Giả lập lưu</button></div>,
}));

const refresh = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const actions = vi.hoisted(() => ({ setCatalogActiveAction: vi.fn(), deleteCatalogRecordAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock("./actions", () => actions);
vi.mock("@/components/catalog/material-units-editor", () => ({ MaterialUnitsEditor: ({ materialId }: { materialId: string }) => <p>Đơn vị của {materialId}</p> }));

import { CatalogCreateButton, CatalogEditButton, CatalogTable } from "./catalog-dialog";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const options = { groups: [{ id: "g1", name: "Xi măng" }], units: [{ id: "kg", name: "Kilôgam" }] };
const rows = [
  { id: "m1", code: "BS30", name: "Xi măng Bút Sơn PCB30", group_id: "g1", base_uom_id: "kg", sale_enabled: true, purchase_enabled: false, active: true },
  { id: "m2", code: "BS40", name: "Xi măng Bút Sơn PCB40", group_id: "g1", base_uom_id: "kg", sale_enabled: true, purchase_enabled: true, active: false },
];

it("lists records with readable values and edits one in a popup that closes after saving", () => {
  render(<CatalogTable kind="materials" rows={rows} options={options} permissions={["catalog.manage"]} scopePrefix="u:b:CATALOG" />);
  const row = screen.getByRole("button", { name: "Xi măng Bút Sơn PCB30" }).closest("tr")!;
  expect(within(row).getByText("Xi măng")).toBeInTheDocument();
  expect(within(row).getByText("Kilôgam")).toBeInTheDocument();
  expect(within(row).getByText("Không")).toBeInTheDocument();
  expect(screen.getByText("Đã ngừng")).toBeInTheDocument();

  fireEvent.click(within(row).getByRole("button", { name: "Sửa BS30" }));
  const dialog = screen.getByRole("dialog", { name: "Vật tư · Xi măng Bút Sơn PCB30" });
  expect(within(dialog).getByText(/Biểu mẫu materials m1/)).toHaveTextContent("u:b:CATALOG:materials:m1");
  fireEvent.click(within(dialog).getByRole("button", { name: "Giả lập lưu" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Đã lưu danh mục.");
});

it("opens the record from ?id= and a new site for a given customer", () => {
  const { unmount } = render(<CatalogTable kind="materials" rows={rows} options={options} permissions={[]} scopePrefix="s" openId="m2" />);
  expect(screen.getByRole("dialog", { name: "Vật tư · Xi măng Bút Sơn PCB40" })).toBeInTheDocument();
  unmount();
  render(<CatalogTable kind="sites" rows={[]} options={{ customers: [] }} permissions={[]} scopePrefix="s" openNew initial={{ customer_id: "c1" }} />);
  expect(screen.getByRole("dialog", { name: "Thêm công trình" })).toHaveTextContent("Biểu mẫu sites mới c1");
});

it("creates from a list page without leaving it", () => {
  render(<CatalogCreateButton kind="suppliers" label="+ Nhà cung cấp" options={{}} permissions={[]} scope="u:b:CATALOG:suppliers:NEW" />);
  fireEvent.click(screen.getByRole("button", { name: "+ Nhà cung cấp" }));
  expect(screen.getByRole("dialog", { name: "Thêm nhà cung cấp" })).toHaveTextContent("u:b:CATALOG:suppliers:NEW");
  fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("moves a new material to its units tab after creating it, and opens an existing one on the units tab", () => {
  const { unmount } = render(<CatalogCreateButton kind="materials" label="+ Vật tư" options={options} permissions={["catalog.manage"]} scope="u:b:CATALOG:materials:NEW" />);
  fireEvent.click(screen.getByRole("button", { name: "+ Vật tư" }));
  expect(screen.getByRole("tab", { name: "Đơn vị tính & giá" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Giả lập lưu" }));
  const dialog = screen.getByRole("dialog", { name: "Thêm vật tư" });
  expect(within(dialog).getByRole("tab", { name: "Đơn vị tính & giá" })).toHaveAttribute("aria-selected", "true");
  expect(within(dialog).getByText("Đơn vị của x")).toBeVisible();
  expect(within(dialog).getByRole("status")).toHaveTextContent("Thêm đơn vị bán và giá bên dưới");
  unmount();
  render(<CatalogTable kind="materials" rows={rows} options={options} permissions={[]} scopePrefix="s" openId="m1" openTab="units" />);
  expect(screen.getByText("Đơn vị của m1")).toBeVisible();
});

it("edits a record from its own page and refreshes it after saving", () => {
  refresh.mockClear();
  render(<CatalogEditButton kind="customers" record={{ id: "c1", code: "KH01", display_name: "Khách A", active: true }} options={{}} permissions={[]} scope="s:customers:c1" label="Sửa" />);
  fireEvent.click(screen.getByRole("button", { name: "Sửa" }));
  const dialog = screen.getByRole("dialog", { name: /Khách A/ });
  expect(within(dialog).getByText(/Biểu mẫu customers c1/)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Giả lập lưu" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Đã lưu danh mục.");
  expect(refresh).toHaveBeenCalled();
});

it("stops a record in one click and keeps the operation when the result is unclear", async () => {
  actions.setCatalogActiveAction.mockResolvedValueOnce({ status: "UNKNOWN", message: "Chưa xác định được kết quả." })
    .mockResolvedValueOnce({ status: "SUCCESS", resultId: "m1", message: "Đã ngừng sử dụng." });
  render(<CatalogTable kind="materials" rows={rows} options={options} permissions={["catalog.manage"]} scopePrefix="u:b:CATALOG" />);
  fireEvent.click(screen.getByRole("button", { name: "Sửa BS30" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Ngừng dùng" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Chưa xác định");
  fireEvent.click(within(dialog).getByRole("button", { name: "Ngừng dùng" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("status")).toHaveTextContent("Đã ngừng sử dụng.");
  const [first, second] = actions.setCatalogActiveAction.mock.calls.map(([input]) => input);
  expect(first).toMatchObject({ kind: "materials", id: "m1", active: false });
  expect(second.operationId).toBe(first.operationId);
});

it("deletes only after a second confirmation and explains when the record is in use", async () => {
  actions.deleteCatalogRecordAction.mockResolvedValueOnce({ status: "FAILED", inUse: true, message: "Đã có chứng từ hoặc dữ liệu liên quan nên không xóa được." });
  render(<CatalogTable kind="materials" rows={rows} options={options} permissions={["catalog.manage"]} scopePrefix="u:b:CATALOG" />);
  fireEvent.click(screen.getByRole("button", { name: "Sửa BS40" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByRole("button", { name: "Dùng lại" })).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Xóa" }));
  expect(actions.deleteCatalogRecordAction).not.toHaveBeenCalled();
  expect(within(dialog).getByRole("group", { name: /Xác nhận xóa/ })).toHaveTextContent("Xi măng Bút Sơn PCB40");
  fireEvent.click(within(dialog).getByRole("button", { name: "Xóa hẳn" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("không xóa được");
  expect(within(dialog).queryByRole("group", { name: /Xác nhận xóa/ })).toBeNull();
});

it("leaves a deleted record's own page for its list", async () => {
  actions.deleteCatalogRecordAction.mockResolvedValueOnce({ status: "SUCCESS", resultId: "m1", message: "Đã xóa vật tư." });
  render(<CatalogEditButton kind="materials" label="Sửa" record={rows[0]} options={options} permissions={["catalog.manage"]} scope="u:b:CATALOG:materials:m1" />);
  fireEvent.click(screen.getByRole("button", { name: "Sửa" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa hẳn" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/products"));
});
