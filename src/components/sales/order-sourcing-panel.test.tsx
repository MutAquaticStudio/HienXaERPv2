import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/modules/sales/actions", () => ({ autoSourceOrderAction: vi.fn() }));
import { OrderSourcingPanel, sourcingRun } from "./order-sourcing-panel";

afterEach(cleanup);
const lines = [
  { id: "l1", name: "Xi măng", required: "1500", baseSymbol: "kg" },
  { id: "l2", name: "Cát", required: "5", baseSymbol: "m³" },
];
const allocations = [
  { lineId: "l1", mode: "WAREHOUSE", quantity: "500", warehouseName: "Kho chính", purchaseOrder: null },
  { lineId: "l1", mode: "SUPPLIER_DIRECT", quantity: "1000", warehouseName: null, purchaseOrder: { id: "po1", number: "PO-2026-000012", state: "DRAFT" } },
];
const run = sourcingRun({ created_at: "2026-10-18T03:00:00Z", plan: { lines: [
  { line_id: "l1", reason: "Kho Kho chính có 500 kg; mua NCC A phần còn lại 1000 kg (dùng tồn kho trước)." },
  { line_id: "l2", reason: "Thiếu nguồn 5 m³: kho hết hàng và chưa có NCC/giá mua." }] } });

it("shows each line's sources, the purchase order waiting for approval and the reason the system chose", () => {
  render(<OrderSourcingPanel orderId="o1" confirmed canSource lines={lines} allocations={allocations} run={run} />);
  const cement = screen.getByText("Xi măng").closest("li")!;
  expect(within(cement).getByText("Đủ nguồn")).toBeInTheDocument();
  expect(cement).toHaveTextContent("Kho chính · 500 kg");
  expect(within(cement).getByRole("link", { name: "PO-2026-000012" })).toHaveAttribute("href", "/admin/purchase-orders/po1");
  expect(cement).toHaveTextContent("(nháp chờ duyệt)");
  expect(cement).toHaveTextContent("dùng tồn kho trước");
  const sand = screen.getByText("Cát").closest("li")!;
  expect(within(sand).getByText("Thiếu 5 m³")).toBeInTheDocument();
  expect(sand).toHaveTextContent("chưa có NCC/giá mua");
  expect(screen.getByRole("button", { name: "Tự phân nguồn" })).toBeInTheDocument();
});

it("explains auto-sourcing before confirmation and hides the button without permission or when all is sourced", () => {
  const { rerender } = render(<OrderSourcingPanel orderId="o1" confirmed={false} canSource lines={lines} allocations={[]} run={null} />);
  expect(screen.getByText(/Xác nhận đơn để hệ thống tự phân nguồn/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Tự phân nguồn" })).not.toBeInTheDocument();
  rerender(<OrderSourcingPanel orderId="o1" confirmed canSource={false} lines={lines} allocations={[]} run={null} />);
  expect(screen.queryByRole("button", { name: "Tự phân nguồn" })).not.toBeInTheDocument();
  rerender(<OrderSourcingPanel orderId="o1" confirmed canSource lines={[lines[0]]} allocations={allocations} run={null} />);
  expect(screen.queryByRole("button", { name: "Tự phân nguồn" })).not.toBeInTheDocument();
});
