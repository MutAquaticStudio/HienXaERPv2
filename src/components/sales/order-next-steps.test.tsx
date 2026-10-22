import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { OrderNextSteps } from "./order-next-steps";

afterEach(cleanup);
const all = { collect: true, createOrder: true, createDelivery: true, purchases: true };

it("says what the system already did after confirming and offers the next moves", () => {
  render(<OrderNextSteps orderId="o1" orderNumber="SO-000123" customerId="c1" siteId="s1" remainingVnd="700000" can={all} justConfirmed
    deliveries={[
      { id: "d1", number: "GH-1", state: "ASSIGNED", scheduledAt: "2026-10-18T03:00:00Z", vehicle: "29C-12345", driver: "Anh Tài", assigned: true },
      { id: "d2", number: "GH-2", state: "PLANNED", scheduledAt: null, vehicle: null, driver: null, assigned: false },
    ]}
    purchases={[{ id: "p1", number: "PO-1", state: "DRAFT" }, { id: "p2", number: "PO-2", state: "CONFIRMED" }]} />);
  const card = screen.getByRole("region", { name: "Đã xác nhận SO-000123 — bước tiếp theo" });
  expect(within(card).getByText(/xe 29C-12345 · tài xế Anh Tài · 18\/10\/2026 10:00 — đã giao việc qua cổng thợ, chờ thợ lấy hàng lên xe/)).toBeInTheDocument();
  expect(within(card).getByRole("link", { name: "Phân xe" })).toHaveAttribute("href", "/admin/deliveries/d2");
  expect(within(card).getByRole("link", { name: "Duyệt đơn mua" })).toHaveAttribute("href", "/admin/purchase-orders/p1");
  expect(within(card).queryByText("PO-2")).not.toBeInTheDocument();
  expect(within(card).getByText("700.000 ₫")).toBeInTheDocument();
  expect(within(card).getByRole("link", { name: "Thu tiền" })).toHaveAttribute("href", "/admin/receivables?customer=c1");
  expect(within(card).getByRole("link", { name: "In đơn" })).toHaveAttribute("href", "/api/orders/o1/pdf");
  expect(within(card).getByRole("link", { name: "Tạo đơn mới cho khách này" })).toHaveAttribute("href", "/admin/orders/new?customer=c1&site=s1");
});

it("points to the delivery dialog when nothing was made, and hides moves the user cannot take", () => {
  render(<OrderNextSteps orderId="o1" orderNumber="SO-1" customerId="c1" siteId="s1" remainingVnd={null} deliveries={[]} purchases={[]}
    can={{ collect: false, createOrder: false, createDelivery: true, purchases: false }} />);
  expect(screen.getByText(/Chưa có phiếu giao. Bấm “Lập phiếu giao”/)).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Thu tiền" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Tạo đơn mới cho khách này" })).not.toBeInTheDocument();
});

it("stays on later visits and follows the worker: on the way, delivered (FB7)", () => {
  const delivery = { scheduledAt: null, vehicle: "29C-12345", driver: "Anh Tài", assigned: true };
  const { rerender } = render(<OrderNextSteps orderId="o1" orderNumber="SO-7" customerId="c1" siteId="s1" remainingVnd="0" can={all} purchases={[]}
    deliveries={[{ ...delivery, id: "d1", number: "GH-1", state: "DISPATCHED" }]} />);
  expect(screen.getByRole("region", { name: "Tiến độ đơn SO-7" })).toHaveTextContent("xe 29C-12345 · tài xế Anh Tài — thợ đang giao");
  expect(screen.getByRole("link", { name: "In đơn" })).toBeInTheDocument();
  rerender(<OrderNextSteps orderId="o1" orderNumber="SO-7" customerId="c1" siteId="s1" remainingVnd="0" can={all} purchases={[]} delivered
    deliveries={[{ ...delivery, id: "d1", number: "GH-1", state: "VERIFIED" }]} />);
  expect(screen.getByRole("region", { name: "SO-7 đã giao xong" })).toHaveTextContent("đã giao xong");
  expect(screen.queryByRole("link", { name: "Thu tiền" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Tạo đơn mới cho khách này" })).toBeInTheDocument();
});
