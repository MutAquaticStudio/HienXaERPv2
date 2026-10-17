import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ save: vi.fn(), cancel: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/modules/inventory/stock-count-actions", () => ({ saveStockCountSheetAction: m.save, cancelStockCountAction: m.cancel }));

import { StockCountSheet } from "./stock-count-sheet";
import type { SheetRow } from "@/modules/inventory/stock-count-sheet";

const COUNT = "99999999-9999-4999-8999-999999999999";
const rows: SheetRow[] = [
  { materialId: "a", code: "XM40", name: "Xi măng PCB40", symbol: "kg", book: "100", recorded: null, averageCost: "1500" },
  { materialId: "b", code: "CAT", name: "Cát vàng", symbol: "m³", book: "10", recorded: { counted: "10.000000", reason: null, unitCost: null }, averageCost: "300000" },
  { materialId: "c", code: "DA", name: "Đá 1x2", symbol: "m³", book: "0", recorded: null, averageCost: null },
];
const sheet = (patch: Partial<Parameters<typeof StockCountSheet>[0]> = {}) => render(<StockCountSheet countId={COUNT} version={4} open rows={rows}
  extraMaterials={[{ id: "d", code: "GACH", name: "Gạch đặc", symbol: "viên" }]} can={{ count: true, approve: true, cost: true }} {...patch} />);
beforeEach(() => { vi.clearAllMocks(); m.save.mockResolvedValue({ status: "SUCCESS", version: 5, message: "Đã lưu 1 dòng kiểm. Phiếu vẫn đang kiểm." }); });
afterEach(cleanup);

it("shows the variance as counts are typed and saves only new or changed lines", async () => {
  sheet();
  fireEvent.change(screen.getByLabelText("Thực tế Xi măng PCB40"), { target: { value: "98,5" } });
  const cement = screen.getByText("Xi măng PCB40").closest("tr")!;
  expect(within(cement).getByText("−1,5")).toBeInTheDocument();
  expect(within(cement).getByText("−2.250 ₫")).toBeInTheDocument();
  expect(screen.getByText(/Đã đếm/)).toHaveTextContent("Đã đếm 2/3 · Lệch tăng 0 · Lệch giảm 1 (2.250 ₫) · Khớp 1");
  fireEvent.change(screen.getByLabelText("Lý do chung cho dòng lệch"), { target: { value: "Kiểm cuối tháng" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu tạm (1 dòng)" }));
  await waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
  expect(m.save.mock.calls[0][0]).toMatchObject({ stockCountId: COUNT, version: 4, approveOperationId: null,
    lines: [{ materialId: "a", counted: "98.5", reason: "Kiểm cuối tháng", unitCost: null }] });
  await waitFor(() => expect(m.refresh).toHaveBeenCalled());
  expect(screen.getByRole("status")).toHaveTextContent("Đã lưu 1 dòng kiểm.");
});

it("marks rows that need a reason or a cost before anything is sent", async () => {
  sheet();
  fireEvent.change(screen.getByLabelText("Thực tế Đá 1x2"), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText("Lý do Đá 1x2"), { target: { value: "Tìm thấy ở bãi" } });
  expect(screen.getByLabelText("Giá vốn Đá 1x2")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Lưu tạm/ }));
  expect(m.save).not.toHaveBeenCalled();
  expect(screen.getAllByRole("alert").map((node) => node.textContent)).toEqual(expect.arrayContaining(["Chưa có giá vốn: nhập giá vốn mỗi m³ cho phần tăng.", "Còn 1 dòng cần sửa (được đánh dấu đỏ)."]));
});

it("adds a material found on the floor and filters the sheet", () => {
  sheet();
  fireEvent.change(screen.getByLabelText("Thêm vật tư khác"), { target: { value: "d" } });
  expect(screen.getByLabelText("Thực tế Gạch đặc")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Khớp/ }));
  expect(screen.getByText("Cát vàng")).toBeInTheDocument();
  expect(screen.queryByText("Xi măng PCB40")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Tất cả/ }));
  fireEvent.change(screen.getByLabelText("Tìm trong phiếu"), { target: { value: "xi" } });
  expect(screen.getByText("Xi măng PCB40")).toBeInTheDocument();
  expect(screen.queryByText("Cát vàng")).not.toBeInTheDocument();
});

it("completes after a review and keeps the same command when the outcome is unknown", async () => {
  m.save.mockResolvedValueOnce({ status: "UNKNOWN", message: "Chưa xác định được kết quả." });
  sheet();
  fireEvent.change(screen.getByLabelText("Thực tế Xi măng PCB40"), { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: "Hoàn thành & cân bằng kho" }));
  const dialog = screen.getByRole("dialog", { name: "Hoàn thành phiếu kiểm" });
  expect(within(dialog).getByText("2/3 vật tư")).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cân bằng kho" }));
  await waitFor(() => expect(m.save).toHaveBeenCalledTimes(1));
  const first = m.save.mock.calls[0][0];
  expect(first.approveOperationId).toEqual(expect.any(String));
  m.save.mockResolvedValueOnce({ status: "SUCCESS", version: 6, approved: true, message: "Đã hoàn thành phiếu kiểm và cân bằng kho." });
  fireEvent.click(await within(dialog).findByRole("button", { name: "Cân bằng lại đúng thao tác" }));
  await waitFor(() => expect(m.save).toHaveBeenCalledTimes(2));
  expect(m.save.mock.calls[1][0]).toEqual(first);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("lets an approver who does not count complete the saved count", async () => {
  m.save.mockResolvedValue({ status: "SUCCESS", version: 5, approved: true, message: "Đã hoàn thành phiếu kiểm và cân bằng kho." });
  sheet({ can: { count: false, approve: true, cost: false } });
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: /Lưu tạm|Hủy phiếu/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Hoàn thành & cân bằng kho" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cân bằng kho" }));
  await waitFor(() => expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ lines: [], version: 4, approveOperationId: expect.any(String) })));
});

it("cancels with a reason and is read-only once closed", async () => {
  m.cancel.mockResolvedValue({ status: "SUCCESS", message: "Đã hủy phiếu kiểm. Tồn kho không thay đổi." });
  sheet();
  fireEvent.click(screen.getByRole("button", { name: "Hủy phiếu" }));
  const dialog = screen.getByRole("dialog", { name: "Hủy phiếu kiểm" });
  expect(within(dialog).getByRole("button", { name: "Hủy phiếu" })).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("Lý do hủy *"), { target: { value: "Chọn nhầm kho" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Hủy phiếu" }));
  await waitFor(() => expect(m.cancel).toHaveBeenCalledWith(expect.objectContaining({ stockCountId: COUNT, version: 4, reason: "Chọn nhầm kho" })));
  cleanup();
  sheet({ open: false });
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: /Lưu tạm/ })).not.toBeInTheDocument();
  expect(screen.getByText("10 m³", { selector: "span" })).toBeInTheDocument();
});
