import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./editor", () => ({
  CatalogEditor: ({ kind, record, initial, scope, onSaved }: { kind: string; record?: { id: string }; initial?: Record<string, string>; scope: string; onSaved: (saved: { id: string; message: string }) => void }) =>
    <div><p>Biểu mẫu {kind} {record?.id ?? "mới"} {initial?.customer_id ?? ""} · {scope}</p><button type="button" onClick={() => onSaved({ id: "x", message: "Đã lưu danh mục." })}>Giả lập lưu</button></div>,
}));

import { CatalogCreateButton, CatalogTable } from "./catalog-dialog";

afterEach(cleanup);
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
