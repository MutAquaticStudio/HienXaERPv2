import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FillRemainingButton } from "./fill-remaining-button";
import { PurchaseNextSteps } from "./purchase-next-steps";

afterEach(cleanup);

it("after confirming a warehouse order, leads to sending it to the supplier, receiving it and a new order", () => {
  render(<PurchaseNextSteps number="PO-1" supplierId="s1" toWarehouse sent={false} deliveryCreated={false} justConfirmed can={{ send: true, receive: true, create: true }} />);
  const card = screen.getByRole("region", { name: "Đã xác nhận PO-1 — bước tiếp theo" });
  expect(within(card).getByRole("link", { name: "Gửi NCC" })).toHaveAttribute("href", "#gui-ncc");
  expect(within(card).getByRole("link", { name: "Nhận hàng" })).toHaveAttribute("href", "#nhan-hang");
  expect(within(card).getByRole("link", { name: "Tạo đơn mua mới cùng NCC" })).toHaveAttribute("href", "/admin/purchase-orders/new?supplier=s1");
});

it("tells a supplier-direct order that the delivery note is made, without a receive step", () => {
  render(<PurchaseNextSteps number="PO-2" supplierId="s1" toWarehouse={false} sent deliveryCreated can={{ send: true, receive: true, create: false }} />);
  expect(screen.getByText(/Đã lập phiếu NCC giao thẳng/)).toBeInTheDocument();
  expect(screen.getByText("Đã gửi đơn cho NCC.")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Nhận hàng" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Tạo đơn mua mới cùng NCC" })).not.toBeInTheDocument();
});

it("'Nhận đủ' fills every open line with what is still due and posts nothing", () => {
  render(<form><input id="q1" name="quantity" /><input id="q2" name="quantity" defaultValue="1" />
    <FillRemainingButton lines={[{ inputId: "q1", remaining: "20" }, { inputId: "q2", remaining: "2.5" }]} /></form>);
  fireEvent.click(screen.getByRole("button", { name: "Nhận đủ (điền số còn lại)" }));
  expect((document.getElementById("q1") as HTMLInputElement).value).toBe("20");
  expect((document.getElementById("q2") as HTMLInputElement).value).toBe("2.5");
});
