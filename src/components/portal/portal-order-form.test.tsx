import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ submit: vi.fn(), push: vi.fn() }));
vi.mock("@/modules/portal/order-actions", () => ({ submitPortalOrderAction: m.submit }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));
import { lineTotalVnd, PortalOrderForm } from "./portal-order-form";
import type { PortalCatalog } from "@/modules/portal/types";

const catalog: PortalCatalog = {
  customer: { id: "11111111-1111-4111-8111-111111111111", code: "KH01", display_name: "Khách sỉ" },
  sites: [{ id: "22222222-2222-4222-8222-222222222222", name: "Công trình A", address_text: "1 Lê Lợi", receiver_name: null, receiver_phone: null }],
  items: [
    { material_id: "m1", code: "XM", name: "Xi măng PCB40", specification: null, group_name: "Xi măng", uom_id: "bao", uom_name: "Bao", uom_symbol: "bao",
      decimal_scale: 0, base_symbol: "kg", conversion_numerator: "50", conversion_denominator: "1", unit_price_vnd: "85000", in_stock: true },
    { material_id: "m2", code: "GA", name: "Gạch đỏ", specification: null, group_name: "Gạch", uom_id: "vien", uom_name: "Viên", uom_symbol: "viên",
      decimal_scale: 0, base_symbol: "viên", conversion_numerator: "1", conversion_denominator: "1", unit_price_vnd: "1300", in_stock: false },
  ],
};
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("rounds line totals like the stored order", () => {
  expect(lineTotalVnd("2.5", "85000")).toBe(212500n);
  expect(lineTotalVnd("0.333333", "1000")).toBe(333n);
  expect(lineTotalVnd("abc", "1000")).toBe(0n);
});

it("shows this customer's prices, stock only as a flag, and totals the cart", () => {
  render(<PortalOrderForm catalog={catalog} operationId="33333333-3333-4333-8333-333333333333" />);
  expect(screen.getByText(/85\.000.*\/ bao \(50 kg\)/)).toBeInTheDocument();
  expect(screen.getByText("Còn hàng")).toBeInTheDocument();
  expect(screen.getByText("Đặt trước")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Xem lại đơn" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Thêm Xi măng PCB40" }));
  fireEvent.click(screen.getByRole("button", { name: "Thêm Xi măng PCB40" }));
  fireEvent.change(screen.getByLabelText("Số lượng Gạch đỏ (viên)"), { target: { value: "500" } });
  expect(screen.getByText(/2 mặt hàng/)).toHaveTextContent("820.000");
  fireEvent.change(screen.getByLabelText("Tìm hàng"), { target: { value: "gạch" } });
  expect(screen.queryByText("Xi măng PCB40")).not.toBeInTheDocument();
});

it("sends the order once reviewed and keeps the operation for an unknown result", async () => {
  m.submit.mockResolvedValueOnce({ status: "UNKNOWN", message: "Chưa rõ" }).mockResolvedValueOnce({ status: "SUCCESS", message: "ok", resultId: "o1" });
  render(<PortalOrderForm catalog={catalog} operationId="33333333-3333-4333-8333-333333333333" />);
  fireEvent.change(screen.getByLabelText("Số lượng Xi măng PCB40 (bao)"), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("Ghi chú cho cửa hàng"), { target: { value: "Giao sáng" } });
  fireEvent.click(screen.getByRole("button", { name: "Xem lại đơn" }));
  expect(screen.getByText("Công trình A — 1 Lê Lợi")).toBeInTheDocument();
  expect(screen.getByText("Sớm nhất có thể")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Gửi đơn" }));
  await screen.findByText("Chưa rõ");
  fireEvent.click(screen.getByRole("button", { name: "Gửi đơn" }));
  await waitFor(() => expect(m.push).toHaveBeenCalledWith("/customer/orders/o1?notice=submitted"));
  expect(m.submit.mock.calls.map((call) => call[0].operationId)).toEqual(["33333333-3333-4333-8333-333333333333", "33333333-3333-4333-8333-333333333333"]);
  expect(m.submit.mock.calls[0][0]).toMatchObject({ siteId: "22222222-2222-4222-8222-222222222222", newSite: null, note: "Giao sáng",
    lines: [{ materialId: "m1", uomId: "bao", quantity: "10" }] });
});

it("asks for a new address when there is no site and tells the customer when nothing is offered", () => {
  render(<PortalOrderForm catalog={{ ...catalog, sites: [] }} operationId="33333333-3333-4333-8333-333333333333" />);
  fireEvent.click(screen.getByRole("button", { name: "Thêm Gạch đỏ" }));
  expect(screen.getByRole("button", { name: "Xem lại đơn" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Tên công trình / nơi nhận"), { target: { value: "Nhà mới" } });
  fireEvent.change(screen.getByLabelText("Địa chỉ"), { target: { value: "9 Nguyễn Trãi" } });
  expect(screen.getByRole("button", { name: "Xem lại đơn" })).toBeEnabled();
  cleanup();
  render(<PortalOrderForm catalog={{ ...catalog, items: [] }} operationId="33333333-3333-4333-8333-333333333333" />);
  expect(screen.getByText(/chưa mở bán mặt hàng nào/)).toBeInTheDocument();
});
