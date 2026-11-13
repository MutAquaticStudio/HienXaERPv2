import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DeleteSalesOrderForm } from "./delete-sales-order-form";

afterEach(cleanup);

const mount = () => render(<DeleteSalesOrderForm entityId="order-id" operationId="intent" orderNumber="SO-2026-000123" action={vi.fn()} />);

it("sends the order, the stable operation and both confirmations, but stays disabled until they are given", () => {
  const { container } = mount();
  expect(container.querySelector('input[name="entityId"]')).toHaveValue("order-id");
  expect(container.querySelector('input[name="operationId"]')).toHaveValue("intent");
  const button = screen.getByRole("button", { name: "Xóa đơn bán" });
  expect(button).toBeDisabled();
  expect(screen.getByLabelText("Lý do xóa")).toBeRequired();
  expect(screen.getByLabelText("Lý do xóa")).toHaveAttribute("maxLength", "300");
});

it("enables the delete only with a reason and the exact order number", () => {
  mount();
  const button = screen.getByRole("button", { name: "Xóa đơn bán" });
  const reason = screen.getByLabelText("Lý do xóa");
  const number = screen.getByLabelText(/Gõ mã đơn/);
  fireEvent.change(reason, { target: { value: "Nhập nhầm khách" } });
  expect(button).toBeDisabled();
  fireEvent.change(number, { target: { value: "SO-2026-000124" } });
  expect(button).toBeDisabled();
  fireEvent.change(number, { target: { value: " so-2026-000123 " } });
  expect(button).toBeEnabled();
  fireEvent.change(reason, { target: { value: "ab" } });
  expect(button).toBeDisabled();
});

it("shows what is already known to block the delete, and keeps the delete available", () => {
  render(<DeleteSalesOrderForm entityId="order-id" operationId="intent" orderNumber="SO-2026-000123" action={vi.fn()} blockedNote="Đơn này đã có phiếu giao." />);
  expect(screen.getByRole("note")).toHaveTextContent("Đơn này đã có phiếu giao.");
  fireEvent.change(screen.getByLabelText("Lý do xóa"), { target: { value: "Nhập nhầm khách" } });
  fireEvent.change(screen.getByLabelText(/Gõ mã đơn/), { target: { value: "SO-2026-000123" } });
  expect(screen.getByRole("button", { name: "Xóa đơn bán" })).toBeEnabled();
});

it("says in Vietnamese that the delete is permanent and points to cancelling to keep history", () => {
  mount();
  expect(screen.getByText(/Không khôi phục được/)).toBeInTheDocument();
  expect(screen.getByText(/dùng “Hủy đơn”/)).toBeInTheDocument();
});
