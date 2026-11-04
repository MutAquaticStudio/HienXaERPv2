import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PurchasePriceBookEditor, type PurchaseBookRow } from "./purchase-price-book-editor";

const m = vi.hoisted(() => ({ save: vi.fn(), assign: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/modules/pricing/purchase-book-actions", () => ({ savePurchasePriceBookAction: m.save, setSupplierMaterialsAction: m.assign }));

const row = (patch: Partial<PurchaseBookRow>): PurchaseBookRow => ({ key: "pt:x", supplierId: "pt", supplierName: "Phú Thành", materialId: "x", code: "XM40", name: "Xi măng PCB40",
  group: "Xi măng", uomId: "bao", uom: "Bao", currentVnd: "86000", since: "03/11", otherUnits: [], saleVnd: "95000", cheapest: false, target: { ruleId: "r1", version: 2 }, ...patch });
const rows = [row({}), row({ key: "pt:t", materialId: "t", code: "THEP10", name: "Thép D10", uom: "Cây", currentVnd: null, since: null, saleVnd: "120000", target: null })];
const props = { rows, operationId: "10000000-0000-4000-8000-000000000001", today: "2026-11-04", canManage: true, showSale: true, candidates: [] };
beforeEach(() => { vi.clearAllMocks(); m.save.mockResolvedValue({ success: true, count: 2, message: "Đã lưu 2 giá mua." }); m.assign.mockResolvedValue({ success: true, message: "Đã gán 1." }); });
afterEach(cleanup);

it("raises a supplier's prices, shows the margin, and saves new and changed prices in one call (D61)", async () => {
  render(<PurchasePriceBookEditor {...props} supplier={{ id: "pt", name: "Phú Thành", assigned: 2, missing: 1 }} />);
  expect(screen.getByText("2 vật tư đã gán")).toBeInTheDocument();
  expect(screen.getByText("1 chưa có giá")).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Nhà cung cấp" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Chọn tất cả"));
  fireEvent.change(screen.getByLabelText("Phần trăm (âm để giảm)"), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Áp dụng cho dòng đã chọn" }));
  expect(screen.getByLabelText("Giá mới Xi măng PCB40")).toHaveValue("90.000");
  const cement = screen.getByLabelText("Giá mới Xi măng PCB40").closest("tr")!;
  // A cost going up reads as a warning; the margin follows the new price.
  expect(within(cement).getByText("+4.000 ₫")).toHaveClass("price-up");
  expect(within(cement).getByText("5,3%")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Giá mới Thép D10"), { target: { value: "98000" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu bảng giá mua (2 thay đổi)" }));
  await waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
  expect(m.save).toHaveBeenCalledWith({ operationId: props.operationId, effectiveDate: "2026-11-04", items: [
    { supplierId: "pt", materialId: "x", uomId: "bao", costVnd: "90000", supersedesId: "r1", expectedVersion: 2 },
    { supplierId: "pt", materialId: "t", uomId: "bao", costVnd: "98000" },
  ] });
  expect(m.refresh).toHaveBeenCalled();
});

it("shows every supplier in the overview with the cheapest marked, and keeps the operation on an unknown outcome", async () => {
  m.save.mockResolvedValue({ success: false, outcomeUnknown: true, message: "Chưa xác định kết quả lưu." });
  render(<PurchasePriceBookEditor {...props} rows={[row({ cheapest: true }), row({ key: "sh:x", supplierId: "sh", supplierName: "Sông Hồng", currentVnd: "90000" })]} />);
  expect(screen.getByRole("columnheader", { name: "Nhà cung cấp" })).toBeInTheDocument();
  expect(screen.getAllByText("Rẻ nhất")).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Giá mới Xi măng PCB40 của Sông Hồng"), { target: { value: "88000" } });
  fireEvent.click(screen.getByRole("button", { name: /Lưu bảng giá mua/ }));
  expect(await screen.findByRole("button", { name: "Lưu lại đúng thao tác" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Lưu lại đúng thao tác" }));
  await waitFor(() => expect(m.save).toHaveBeenCalledTimes(2));
  expect(m.save.mock.calls[0][0].operationId).toBe(m.save.mock.calls[1][0].operationId);
});

it("assigns materials to the chosen supplier with their purchase unit", async () => {
  render(<PurchasePriceBookEditor {...props} supplier={{ id: "pt", name: "Phú Thành", assigned: 2, missing: 1 }}
    candidates={[{ materialId: "c1", code: "CAT-DEN", name: "Cát đen", units: [{ id: "khoi", symbol: "Khối" }, { id: "xe", symbol: "Xe cn nhỏ" }] }]} />);
  fireEvent.click(screen.getByRole("button", { name: "+ Gán vật tư cho NCC này" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("checkbox"));
  fireEvent.change(within(dialog).getByLabelText("Đơn vị mua Cát đen"), { target: { value: "xe" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Gán 1 vật tư" }));
  await waitFor(() => expect(m.assign).toHaveBeenCalledWith({ operationId: expect.any(String), items: [{ supplierId: "pt", materialId: "c1", uomId: "xe", active: true }] }));
  expect(m.refresh).toHaveBeenCalled();
});

it("is read-only without the right to enter purchase prices", () => {
  render(<PurchasePriceBookEditor {...props} canManage={false} supplier={{ id: "pt", name: "Phú Thành", assigned: 2, missing: 1 }} />);
  expect(screen.queryByRole("button", { name: /Lưu bảng giá mua/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "+ Gán vật tư cho NCC này" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Chọn tất cả")).not.toBeInTheDocument();
});
