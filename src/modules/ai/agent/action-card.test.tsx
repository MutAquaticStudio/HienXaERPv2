import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ confirm: vi.fn(), dismiss: vi.fn() }));
vi.mock("./actions", () => ({ confirmAiActionAction: m.confirm, dismissAiActionAction: m.dismiss }));
import { AiActionCardView } from "./action-card";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const card = { id: "11111111-1111-4111-8111-111111111111", title: "Tạo 2 khách hàng", state: "PENDING" as const, link: null, message: null,
  summary: [{ label: "Sẽ tạo", value: "2 khách" }, { label: "Bỏ qua", value: "1 dòng (trùng hoặc thiếu tên)" }],
  rows: [{ n: 1, ten: "Công ty An Phát", dien_thoai: "0912345678", dia_chi_giao: "12 Lê Lợi", status: "CREATE" as const },
    { n: 2, ten: "Chị Lan", dien_thoai: "0905111222", dia_chi_giao: "", status: "SKIP" as const, reason: "Đã có: KH0012 · Anh Tư" },
    { n: 3, ten: "Anh Bốn", dien_thoai: "", dia_chi_giao: "", status: "CREATE" as const }] };

it("D63: lists every row, lets the person untick rows, and confirms only the ticked ones", async () => {
  const onChange = vi.fn();
  m.confirm.mockResolvedValue({ ok: true, message: "Đã tạo 1 khách hàng, bỏ qua 2 dòng.", card: { ...card, state: "DONE", link: "/admin/customers", message: "Đã tạo 1 khách hàng, bỏ qua 2 dòng." } });
  render(<AiActionCardView card={card} onChange={onChange} />);
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("row")).toHaveLength(4);
  expect(within(table).getByText("Bỏ qua: Đã có: KH0012 · Anh Tư")).toBeInTheDocument();
  expect(within(table).queryByRole("checkbox", { name: "Tạo khách Chị Lan" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Xác nhận tạo 2 khách" })).toBeEnabled();
  fireEvent.click(within(table).getByRole("checkbox", { name: "Tạo khách Anh Bốn" }));
  expect(within(table).getByText("Không tạo")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận tạo 1 khách" }));
  await waitFor(() => expect(m.confirm).toHaveBeenCalledWith({ actionId: card.id, exclude: [3] }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ state: "DONE" }));
});

it("cannot confirm when every row is unticked, and an ordinary card confirms without rows", async () => {
  render(<AiActionCardView card={card} onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Tạo khách Công ty An Phát" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Tạo khách Anh Bốn" }));
  expect(screen.getByRole("button", { name: "Chọn khách để tạo" })).toBeDisabled();
  cleanup();
  m.confirm.mockResolvedValue({ ok: true, message: "Đã chi." });
  render(<AiActionCardView card={{ ...card, title: "Ghi chi phí", rows: undefined }} onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
  await waitFor(() => expect(m.confirm).toHaveBeenCalledWith({ actionId: card.id }));
});
