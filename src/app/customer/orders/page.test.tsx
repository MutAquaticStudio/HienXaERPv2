import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ snapshot: vi.fn(), requests: vi.fn() }));
vi.mock("@/modules/portal/actions", () => ({ getCustomerPortalSnapshot: m.snapshot }));
vi.mock("@/modules/portal/service-actions", () => ({ getCustomerServiceRequests: m.requests }));
vi.mock("@/components/portal/order-progress", () => ({ OrderProgress: () => null }));

import Page from "./page";
import type { CustomerServiceRequest } from "@/modules/portal/service-request";

const request = (fields: Partial<CustomerServiceRequest>): CustomerServiceRequest => ({
  id: "r1", number: "YC-1", member_role: "OWNER", state: "SUBMITTED", stage: "SUBMITTED", service_name: "Chạc gạch", unit_label: "xe cn to", quantity: "2",
  site_name: "Công trình Q.7", site_address: "12 Nguyễn Văn Linh", preferred_date: "2026-11-15", preferred_slot: "MORNING", contact_name: "Anh Tuấn", contact_phone: "0901234567",
  submitted_at: "2026-11-14T10:20:00Z", can_cancel: true, unit_price_vnd: "340000", estimate_vnd: "680000", ...fields,
});
const requests = [
  request({}),
  request({ id: "r2", service_name: "Máy xúc", unit_label: "ca", quantity: "1", state: "SCHEDULED", stage: "SCHEDULED", can_cancel: false, scheduled_start: "2026-11-16T00:30:00Z", unit_price_vnd: undefined, estimate_vnd: undefined }),
  request({ id: "r3", quantity: "1", state: "SCHEDULED", stage: "DONE", can_cancel: false, verified_at: "2026-11-08T05:00:00Z", final_amount_vnd: "340000" }),
];
const open = async (query: { kind?: string; show?: string; notice?: string } = {}, role = "OWNER") => {
  m.snapshot.mockResolvedValue({ membership_role: role, orders: [] });
  m.requests.mockResolvedValue({ customer_id: "c", membership_role: role, requests });
  render(await Page({ searchParams: Promise.resolve(query) }));
};
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("keeps goods as the first tab and switches to services with the Hàng hóa / Dịch vụ switch (D75)", async () => {
  await open();
  const tabs = screen.getByRole("navigation", { name: "Loại đơn" });
  expect(within(tabs).getByRole("link", { name: "Hàng hóa" })).toHaveAttribute("aria-current", "page");
  expect(within(tabs).getByRole("link", { name: "Dịch vụ" })).toHaveAttribute("href", "/customer/orders?kind=services");
  expect(screen.getByText("Chưa có đơn hàng.")).toBeInTheDocument();
  expect(m.requests).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "Đặt hàng" })).toHaveAttribute("href", "/customer/orders/new");
});

it("lists the requests in progress first, with the filter counts and what each one is worth (D75)", async () => {
  await open({ kind: "services" });
  expect(within(screen.getByRole("navigation", { name: "Loại đơn" })).getByRole("link", { name: "Dịch vụ" })).toHaveAttribute("aria-current", "page");
  const filter = screen.getByRole("navigation", { name: "Lọc theo trạng thái" });
  expect(within(filter).getByRole("link", { name: "Đang xử lý · 2" })).toHaveAttribute("aria-current", "true");
  const cards = screen.getAllByRole("listitem");
  expect(cards).toHaveLength(2);
  expect(cards[0]).toHaveTextContent("Chạc gạch · 2 xe cn to");
  expect(cards[0]).toHaveTextContent("Mong muốn 15/11, buổi sáng · Công trình Q.7");
  expect(cards[0]).toHaveTextContent(/Chờ xác nhận.*Gửi 17:20 · 14\/11 · Tạm tính 680\.000/);
  expect(cards[1]).toHaveTextContent("Đã xếp lịch");
  expect(cards[1]).toHaveTextContent("16/11 lúc 07:30 · giá do cửa hàng báo");
  expect(within(cards[0]).getByRole("link")).toHaveAttribute("href", "/customer/services/r1");
  expect(screen.getByRole("link", { name: "Đặt dịch vụ" })).toHaveAttribute("href", "/customer/services/new");
});

it("shows finished requests with the final amount and the debt, and all of them on demand", async () => {
  await open({ kind: "services", show: "done" });
  const cards = screen.getAllByRole("listitem");
  expect(cards).toHaveLength(1);
  expect(cards[0]).toHaveTextContent(/Hoàn tất.*08\/11 · Thành tiền 340\.000.* · đã ghi vào Công nợ/);
  cleanup();
  await open({ kind: "services", show: "all" });
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
});

it("tells the customer when nothing is in progress and offers the full list", async () => {
  m.snapshot.mockResolvedValue({ membership_role: "OWNER", orders: [] });
  m.requests.mockResolvedValue({ customer_id: "c", membership_role: "OWNER", requests: [requests[2]] });
  render(await Page({ searchParams: Promise.resolve({ kind: "services" }) }));
  expect(screen.getByText("Không có yêu cầu nào đang xử lý.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Xem tất cả yêu cầu" })).toHaveAttribute("href", "/customer/orders?kind=services&show=all");
});

it("invites the owner to place a first request and shows an accountant no order button", async () => {
  m.snapshot.mockResolvedValue({ membership_role: "OWNER", orders: [] });
  m.requests.mockResolvedValue({ customer_id: "c", membership_role: "OWNER", requests: [] });
  render(await Page({ searchParams: Promise.resolve({ kind: "services" }) }));
  expect(screen.getByText("Chưa có yêu cầu dịch vụ nào.")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Đặt dịch vụ" })).toHaveLength(2);
  cleanup();
  await open({ kind: "services" }, "FINANCE_CONTACT");
  expect(screen.queryByRole("link", { name: "Đặt dịch vụ" })).not.toBeInTheDocument();
  cleanup();
  await open({}, "RECEIVER");
  expect(screen.queryByRole("link", { name: "Đặt hàng" })).not.toBeInTheDocument();
});
