import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ confirm: vi.fn(), dismiss: vi.fn(), submit: vi.fn(), load: vi.fn(), finish: vi.fn() }));
vi.mock("./actions", () => ({ confirmAiActionAction: m.confirm, dismissAiActionAction: m.dismiss, submitAiActionFormAction: m.submit, loadAiCatalogFormAction: m.load, finishAiCatalogActionAction: m.finish }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/catalog/actions", () => ({}));
vi.mock("@/components/catalog/material-units-editor", () => ({ MaterialUnitsEditor: () => null }));
import { AiActionCardView } from "./action-card";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const card = { id: "11111111-1111-4111-8111-111111111111", title: "Tạo 2 khách hàng", state: "PENDING" as const, link: null, message: null,
  summary: [{ label: "Sẽ tạo", value: "2 khách" }, { label: "Bỏ qua", value: "1 dòng (trùng hoặc thiếu tên)" }],
  list: { columns: ["Khách hàng", "Điện thoại", "Địa chỉ"], verb: "tạo", noun: "khách", okLabel: "Tạo", rows: [
    { n: 1, cells: ["Công ty An Phát", "0912345678", "12 Lê Lợi"], status: "CREATE" as const },
    { n: 2, cells: ["Chị Lan", "0905111222", "—"], status: "SKIP" as const, reason: "Đã có: KH0012 · Anh Tư" },
    { n: 3, cells: ["Anh Bốn", "—", "—"], status: "CREATE" as const }] } };

it("D63: lists every row, lets the person untick rows, and confirms only the ticked ones", async () => {
  const onChange = vi.fn();
  m.confirm.mockResolvedValue({ ok: true, message: "Đã tạo 1 khách hàng, bỏ qua 2 dòng.", card: { ...card, state: "DONE", link: "/admin/customers", message: "Đã tạo 1 khách hàng, bỏ qua 2 dòng." } });
  render(<AiActionCardView card={card} onChange={onChange} />);
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("row")).toHaveLength(4);
  expect(within(table).getByText("Bỏ qua: Đã có: KH0012 · Anh Tư")).toBeInTheDocument();
  expect(within(table).queryByRole("checkbox", { name: "Tạo Chị Lan" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Xác nhận tạo 2 khách" })).toBeEnabled();
  fireEvent.click(within(table).getByRole("checkbox", { name: "Tạo Anh Bốn" }));
  expect(within(table).getByText("Không làm")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận tạo 1 khách" }));
  await waitFor(() => expect(m.confirm).toHaveBeenCalledWith({ actionId: card.id, exclude: [3] }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ state: "DONE" }));
});

it("cannot confirm when every row is unticked, and an ordinary card confirms without rows", async () => {
  render(<AiActionCardView card={card} onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Tạo Công ty An Phát" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Tạo Anh Bốn" }));
  expect(screen.getByRole("button", { name: "Chọn khách để tạo" })).toBeDisabled();
  cleanup();
  m.confirm.mockResolvedValue({ ok: true, message: "Đã chi." });
  render(<AiActionCardView card={{ ...card, title: "Ghi chi phí", list: undefined }} onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
  await waitFor(() => expect(m.confirm).toHaveBeenCalledWith({ actionId: card.id }));
});

const expense = { id: "22222222-2222-4222-8222-222222222222", title: "Ghi chi phí xăng xe", state: "PENDING" as const, link: null, message: null, summary: [{ label: "Số tiền", value: "500.000 ₫" }],
  form: { fields: [
    { key: "loai_chi", label: "Loại chi", kind: "text" as const }, { key: "so_tien", label: "Số tiền (₫)", kind: "money" as const },
    { key: "ghi_chu", label: "Ghi chú", kind: "textarea" as const }], values: { loai_chi: "Xăng xe", so_tien: "500000", ghi_chu: "" } } };

it("D65: Xem và sửa opens the form filled in, sends the edited values, and shows a refusal inside the form", async () => {
  const onChange = vi.fn();
  m.submit.mockResolvedValueOnce({ ok: false, message: "Không tìm thấy loại chi “Xăng xe”." });
  m.submit.mockResolvedValueOnce({ ok: true, message: "Đã ghi chi phí.", card: { ...expense, state: "DONE", form: undefined, message: "Đã ghi chi phí." } });
  render(<AiActionCardView card={expense} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Xem và sửa" }));
  const amount = await screen.findByLabelText("Số tiền (₫)");
  expect(amount).toHaveValue("500000");
  expect(screen.getByLabelText("Loại chi")).toHaveValue("Xăng xe");
  fireEvent.change(amount, { target: { value: "450000" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Không tìm thấy loại chi");
  expect(m.submit).toHaveBeenLastCalledWith({ actionId: expense.id, values: { loai_chi: "Xăng xe", so_tien: "450000", ghi_chu: "" } });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ state: "DONE" })));
  await waitFor(() => expect(screen.queryByLabelText("Số tiền (₫)")).not.toBeInTheDocument());
});

it("D65: a card without a form keeps only Xác nhận and Bỏ qua; the quick Xác nhận stays beside Xem và sửa", () => {
  render(<AiActionCardView card={{ ...card, list: undefined }} onChange={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Xem và sửa" })).not.toBeInTheDocument();
  cleanup();
  render(<AiActionCardView card={expense} onChange={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Xác nhận" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Bỏ qua" })).toBeInTheDocument();
});
