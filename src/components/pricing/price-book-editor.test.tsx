import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PriceBookEditor, type PriceBookRow } from "./price-book-editor";

const m = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/modules/pricing/price-book-actions", () => ({ savePriceBookAction: m.save }));

const rows: PriceBookRow[] = [
  { materialId: "m1", code: "XM01", name: "Xi măng", group: "Xi măng", uomId: "bao", uom: "bao", currentVnd: "95000", costVnd: "80000", target: { ruleId: "r1", version: 3 } },
  { materialId: "m2", code: "DA12", name: "Đá 1x2", group: "Cát đá", uomId: "m3", uom: "m³", currentVnd: "450000", costVnd: null, target: { ruleId: "r2", version: 1 } },
  { materialId: "m3", code: "CAT", name: "Cát vàng", group: "Cát đá", uomId: "m3", uom: "m³", currentVnd: null, costVnd: null, target: null },
];
const props = { rows, operationId: "10000000-0000-4000-8000-000000000001", today: "2026-10-16", canManage: true, showCost: true };
beforeEach(() => { vi.clearAllMocks(); m.save.mockResolvedValue({ success: true, count: 2, message: "Đã lưu 2 giá mới." }); });
afterEach(cleanup);

const saveButton = () => screen.getByRole("button", { name: /Lưu bảng giá/ });

it("raises selected prices by a percentage with rounding, previews the change and saves them in one call", async () => {
  render(<PriceBookEditor {...props} />);
  fireEvent.click(screen.getByLabelText("Chọn tất cả"));
  fireEvent.change(screen.getByLabelText("Phần trăm (âm để giảm)"), { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: "Áp dụng cho dòng đã chọn" }));
  expect(screen.getByLabelText("Giá mới Xi măng")).toHaveValue("105.000");
  expect(screen.getByLabelText("Giá mới Đá 1x2")).toHaveValue("495.000");
  expect(screen.getByLabelText("Giá mới Cát vàng")).toHaveValue("");
  expect(screen.getByRole("status")).toHaveTextContent("bỏ qua 1 dòng chưa có giá hiện tại");
  const row = screen.getByLabelText("Giá mới Xi măng").closest("tr")!;
  expect(within(row).getByText("+10.000 ₫")).toBeInTheDocument();
  expect(saveButton()).toHaveTextContent("Lưu bảng giá (2 thay đổi)");
  expect(saveButton()).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Lý do thay đổi *"), { target: { value: "NCC tăng giá" } });
  fireEvent.click(saveButton());
  await waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
  expect(m.save).toHaveBeenCalledWith({ operationId: props.operationId, reason: "NCC tăng giá", effectiveDate: "2026-10-16", items: [
    { materialId: "m1", uomId: "bao", priceVnd: "105000", supersedesId: "r1", expectedVersion: 3 },
    { materialId: "m2", uomId: "m3", priceVnd: "495000", supersedesId: "r2", expectedVersion: 1 },
  ] });
  await waitFor(() => expect(m.refresh).toHaveBeenCalled());
});

it("creates a first price for a material without one and ignores unchanged rows", async () => {
  render(<PriceBookEditor {...props} />);
  fireEvent.change(screen.getByLabelText("Giá mới Cát vàng"), { target: { value: "320.000 ₫" } });
  fireEvent.change(screen.getByLabelText("Giá mới Xi măng"), { target: { value: "95000" } });
  fireEvent.change(screen.getByLabelText("Lý do thay đổi *"), { target: { value: "Giá mở bán" } });
  expect(saveButton()).toHaveTextContent("(1 thay đổi)");
  fireEvent.click(saveButton());
  await waitFor(() => expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ items: [{ materialId: "m3", uomId: "m3", priceVnd: "320000" }] })));
});

it("keeps every edit and the same operation when the save outcome is unknown", async () => {
  m.save.mockRejectedValueOnce(new Error("network"));
  render(<PriceBookEditor {...props} />);
  fireEvent.change(screen.getByLabelText("Giá mới Xi măng"), { target: { value: "99000" } });
  fireEvent.change(screen.getByLabelText("Lý do thay đổi *"), { target: { value: "Điều chỉnh" } });
  fireEvent.click(saveButton());
  expect(await screen.findByText(/Chưa xác định kết quả lưu/)).toBeInTheDocument();
  expect(screen.getByLabelText("Giá mới Xi măng")).toHaveValue("99.000");
  // The message can render a beat before the transition settles; retry only once the button is back.
  await waitFor(() => expect(saveButton()).toBeEnabled());
  fireEvent.click(saveButton());
  await waitFor(() => expect(m.save).toHaveBeenCalledTimes(2));
  expect(m.save.mock.calls[1][0]).toEqual(m.save.mock.calls[0][0]);
  expect(m.refresh).toHaveBeenCalledTimes(1);
});

it("is read-only without pricing.manage and hides cost without cost permission", () => {
  render(<PriceBookEditor {...props} canManage={false} showCost={false} />);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Lưu bảng giá/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Giá vốn" })).not.toBeInTheDocument();
  expect(screen.getByText("95.000 ₫")).toBeInTheDocument();
});
