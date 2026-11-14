import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/modules/portal/service-actions", () => ({ getCustomerServiceRequest: m.request }));
vi.mock("@/components/portal/cancel-service-request-button", () => ({ CancelServiceRequestButton: () => <button type="button">Hủy yêu cầu</button> }));

import Page from "./page";
import type { CustomerServiceRequest } from "@/modules/portal/service-request";

const base: CustomerServiceRequest = {
  id: "r1", number: "YC-202611-000001", member_role: "OWNER", state: "SUBMITTED", stage: "SUBMITTED", service_name: "Chạc gạch", unit_label: "xe cn to", quantity: "2",
  site_name: "Công trình Q.7", site_address: "12 Nguyễn Văn Linh, Quận 7", preferred_date: "2026-11-15", preferred_slot: "MORNING", contact_name: "Anh Tuấn", contact_phone: "0901 234 567",
  submitted_at: "2026-11-14T10:20:00Z", can_cancel: true, unit_price_vnd: "340000", estimate_vnd: "680000",
};
const render_ = async (request: Partial<CustomerServiceRequest>, notice?: string) => {
  m.request.mockResolvedValue({ ...base, ...request });
  render(await Page({ params: Promise.resolve({ id: "r1" }), searchParams: Promise.resolve({ notice }) }));
};
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("shows a waiting request with its five steps, the estimate and the cancel button (D75)", async () => {
  await render_({}, "submitted");
  expect(screen.getByRole("status")).toHaveTextContent("Đã gửi yêu cầu. Cửa hàng sẽ xác nhận lịch cho bạn.");
  expect(screen.getByRole("heading", { name: "Chạc gạch · 2 xe cn to" })).toBeInTheDocument();
  expect(screen.getByText("Chờ xác nhận")).toBeInTheDocument();
  const steps = screen.getAllByRole("listitem");
  expect(steps.map((step) => step.querySelector("span:nth-of-type(2)")?.textContent)).toEqual(["Đã gửi yêu cầu", "Cửa hàng xác nhận lịch", "Thợ thực hiện", "Xác nhận khối lượng", "Hoàn tất và ghi công nợ"]);
  expect(steps[1]).toHaveAttribute("aria-current", "step");
  expect(screen.getByText("17:20 · 14/11")).toBeInTheDocument();
  expect(screen.getByText(/Tạm tính/).closest("div")).toHaveTextContent("680.000");
  expect(screen.getByText(/Bạn chưa bị tính tiền/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Hủy yêu cầu" })).toBeInTheDocument();
  expect(screen.getByText("Hủy được khi cửa hàng chưa xếp lịch.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Nhắn tin cho cửa hàng/ })).toHaveAttribute("href", "/customer/messages");
  expect(screen.getByRole("link", { name: "Đặt lại yêu cầu này" })).toHaveAttribute("href", "/customer/services/new?from=r1");
});

it("says why a scheduled request cannot be cancelled on the portal and shows the store's schedule", async () => {
  await render_({ state: "SCHEDULED", stage: "SCHEDULED", can_cancel: false, scheduled_start: "2026-11-16T00:30:00Z", scheduled_at: "2026-11-14T11:00:00Z" });
  expect(screen.queryByRole("button", { name: "Hủy yêu cầu" })).not.toBeInTheDocument();
  expect(screen.getByText(/Cửa hàng đã xếp lịch nên không hủy được trên cổng/)).toBeInTheDocument();
  expect(screen.getByText("Lịch của cửa hàng").closest("div")).toHaveTextContent("16/11 lúc 07:30");
});

it("shows the verified amount once the request is done, and the debt it went to", async () => {
  await render_({ state: "SCHEDULED", stage: "DONE", can_cancel: false, verified_at: "2026-11-16T05:00:00Z", billable_quantity: "2", final_amount_vnd: "680000" });
  expect(screen.getByText("Thành tiền").closest("div")).toHaveTextContent("680.000");
  expect(screen.getByText("Thành tiền").closest("div")).toHaveTextContent("đã ghi vào Công nợ");
  expect(screen.getByText("Khối lượng tính").closest("div")).toHaveTextContent("2 xe cn to");
  expect(screen.queryByText(/Bạn chưa bị tính tiền/)).not.toBeInTheDocument();
});

it("shows the receiver no money, no cancel and no order again", async () => {
  await render_({ member_role: "RECEIVER", can_cancel: false, unit_price_vnd: undefined, estimate_vnd: undefined });
  expect(screen.queryByText(/Tạm tính/)).not.toBeInTheDocument();
  expect(screen.queryByText(/340\.000|680\.000/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Hủy yêu cầu" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Đặt lại yêu cầu này" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Nhắn tin cho cửa hàng/ })).toBeInTheDocument();
});

it("ends a rejected request in one stopped step that gives the store's reason, with no cancel or order again", async () => {
  await render_({ state: "REJECTED", stage: "REJECTED", can_cancel: false, decision_reason: "Hết máy trong ngày" });
  const steps = within(screen.getByRole("list")).getAllByRole("listitem");
  expect(steps).toHaveLength(2);
  expect(steps[1]).toHaveAttribute("data-state", "stopped");
  expect(steps[1]).toHaveTextContent("Lý do: Hết máy trong ngày");
  expect(screen.getByText("Cửa hàng chưa nhận")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Đặt lại yêu cầu này" })).not.toBeInTheDocument();
});
