import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ submit: vi.fn(), push: vi.fn() }));
vi.mock("@/modules/portal/service-actions", () => ({ submitServiceRequestAction: m.submit }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));
import { PortalServiceForm } from "./portal-service-form";
import type { PortalServiceCatalog } from "@/modules/portal/service-request";

const catalog: PortalServiceCatalog = {
  customer: { id: "11111111-1111-4111-8111-111111111111", code: "KH01", display_name: "Khách A" },
  contact: { name: "Anh Tuấn", phone: "0901 234 567" },
  sites: [{ id: "22222222-2222-4222-8222-222222222222", name: "Công trình Q.7", address_text: "12 Nguyễn Văn Linh, Quận 7", receiver_name: null, receiver_phone: null }],
  groups: [
    { name: "Chạc", services: [
      { name: "Chạc gạch", options: [{ id: "44444444-4444-4444-8444-444444444441", unit_label: "xe cn nhỏ", unit_price_vnd: "170000" }, { id: "44444444-4444-4444-8444-444444444442", unit_label: "xe cn to", unit_price_vnd: "340000" }] },
    ] },
    { name: "Máy", services: [
      { name: "Máy xúc", options: [{ id: "44444444-4444-4444-8444-444444444443", unit_label: "ca", unit_price_vnd: null }] },
      { name: "Máy nâng", options: [{ id: "44444444-4444-4444-8444-444444444444", unit_label: "ca", unit_price_vnd: "2500000" }] },
    ] },
  ],
};
const operation = "33333333-3333-4333-8333-333333333333";
beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn() as never;
  // 10:00 on 14/11/2026 in Ho Chi Minh City.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-14T03:00:00Z"));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const next = () => screen.getByRole("button", { name: /Tiếp tục|Chọn một dịch vụ/ });
function toDetails(service = /^Chạc gạch/) {
  fireEvent.click(screen.getByRole("button", { name: service }));
  fireEvent.click(next());
}

it("lists services under their group with the price line, and only continues once one is chosen", () => {
  render(<PortalServiceForm catalog={catalog} operationId={operation} />);
  expect(screen.getByText(/Bước 1 \/ 3/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Chạc" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Máy" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Chạc gạch/ })).toHaveTextContent(/Theo xe cn nhỏ · xe cn to.*từ 170\.000/);
  expect(screen.getByRole("button", { name: /^Máy xúc/ })).toHaveTextContent("Cửa hàng báo giá");
  expect(screen.getByRole("button", { name: /^Máy nâng/ })).toHaveTextContent("2.500.000");
  expect(next()).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /^Chạc gạch/ }));
  expect(screen.getByRole("button", { name: /^Chạc gạch/ })).toHaveAttribute("aria-pressed", "true");
  expect(next()).toBeEnabled();
  expect(next()).toHaveTextContent("Tiếp tục · Chạc gạch");
});

it("finds a service without accents and says so when nothing matches", () => {
  render(<PortalServiceForm catalog={catalog} operationId={operation} />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "may xuc" } });
  expect(screen.getByRole("button", { name: /^Máy xúc/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Chạc gạch/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "xyz" } });
  expect(screen.getByText(/Không có dịch vụ nào khớp/)).toBeInTheDocument();
});

it("tells the customer when no service is open for ordering yet", () => {
  render(<PortalServiceForm catalog={{ ...catalog, groups: [] }} operationId={operation} />);
  expect(screen.getByRole("heading", { name: "Chưa có dịch vụ nào mở cho bạn đặt" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Nhắn tin cho cửa hàng/ })).toHaveAttribute("href", "/customer/messages");
});

it("shows the unit of each service type as the option, with its price, and an estimate that follows the quantity", () => {
  render(<PortalServiceForm catalog={catalog} operationId={operation} />);
  toDetails();
  expect(screen.getByText(/Bước 2 \/ 3/)).toBeInTheDocument();
  const options = screen.getByRole("group", { name: "Tính theo" });
  expect(within(options).getByRole("button", { name: /Xe cn nhỏ/ })).toHaveTextContent("170.000");
  expect(within(options).getByRole("button", { name: /Xe cn to/ })).toHaveTextContent("340.000");
  // The first option is chosen for the customer; a second tap changes it, the quantity buttons count.
  expect(within(options).getByRole("button", { name: /Xe cn nhỏ/ })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(within(options).getByRole("button", { name: /Xe cn to/ }));
  fireEvent.click(screen.getByRole("button", { name: "Tăng một xe cn to" }));
  expect(screen.getByLabelText(/Số lượng/)).toHaveValue("2");
  expect(screen.getByRole("button", { name: /Xem và gửi/ })).toHaveTextContent(/Tạm tính · 2 xe cn to.*680\.000/);
  fireEvent.change(screen.getByLabelText(/Số lượng/), { target: { value: "2,5" } });
  expect(screen.getByLabelText(/Số lượng/)).toHaveValue("2.5");
  expect(screen.getByRole("button", { name: /Xem và gửi/ })).toHaveTextContent("850.000");
});

it("quotes a service without a price instead of showing an estimate", () => {
  render(<PortalServiceForm catalog={catalog} operationId={operation} />);
  toDetails(/^Máy xúc/);
  expect(screen.getByRole("button", { name: /Xem và gửi/ })).toHaveTextContent("Cửa hàng báo giá");
  expect(screen.queryByRole("group", { name: "Tính theo" })).not.toBeInTheDocument();
});

it("lays out the day and the part of day as three equal choices and prefills the contact, with no photo button", () => {
  render(<PortalServiceForm catalog={catalog} operationId={operation} />);
  toDetails();
  const days = screen.getByRole("group", { name: "Ngày" });
  expect(within(days).getAllByRole("button").map((button) => button.textContent)).toEqual(["Hôm nay14/11", "Ngày mai15/11", "Chọn ngày…"]);
  expect(within(days).getByRole("button", { name: /Ngày mai/ })).toHaveAttribute("aria-pressed", "true");
  const slots = screen.getByRole("group", { name: "Buổi" });
  expect(within(slots).getAllByRole("button")).toHaveLength(3);
  expect(within(slots).getByRole("button", { name: /Sáng/ })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("Họ tên")).toHaveValue("Anh Tuấn");
  expect(screen.getByLabelText("Số điện thoại")).toHaveValue("0901 234 567");
  expect(screen.queryByText(/ảnh/i)).not.toBeInTheDocument();
  fireEvent.click(within(days).getByRole("button", { name: /Chọn ngày/ }));
  expect(screen.getByLabelText("Ngày mong muốn")).toHaveAttribute("min", "2026-11-14");
  expect(screen.getByLabelText("Ngày mong muốn")).toHaveAttribute("max", "2027-03-14");
  fireEvent.click(within(slots).getByRole("button", { name: /Giờ cụ thể/ }));
  expect(screen.getByLabelText("Giờ mong muốn")).toBeInTheDocument();
});

it("marks what is missing instead of moving on: quantity, phone and a new site", () => {
  render(<PortalServiceForm catalog={{ ...catalog, sites: [], contact: {} }} operationId={operation} />);
  toDetails();
  expect(screen.getByText(/Bạn chưa có công trình nào/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Số lượng/), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: /Xem và gửi/ }));
  expect(screen.getByText(/Bước 2 \/ 3/)).toBeInTheDocument();
  expect(screen.getByText(/Nhập số lượng lớn hơn 0/)).toBeInTheDocument();
  expect(screen.getByText(/Nhập tên công trình/)).toBeInTheDocument();
  expect(screen.getByText(/Nhập địa chỉ công trình/)).toBeInTheDocument();
  expect(screen.getByText(/Nhập họ tên người liên hệ/)).toBeInTheDocument();
  expect(screen.getByText(/Nhập số điện thoại người liên hệ/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Số lượng/)).toHaveAttribute("aria-invalid", "true");
});

async function fillAndReview() {
  render(<PortalServiceForm catalog={catalog} operationId={operation} />);
  toDetails();
  fireEvent.click(within(screen.getByRole("group", { name: "Tính theo" })).getByRole("button", { name: /Xe cn to/ }));
  fireEvent.change(screen.getByLabelText(/Số lượng/), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Ghi chú"), { target: { value: "Hẻm nhỏ" } });
  fireEvent.click(screen.getByRole("button", { name: /Xem và gửi/ }));
}

it("reviews the request, says nothing is charged, and sends it with the chosen service type and the wish", async () => {
  m.submit.mockResolvedValue({ status: "SUCCESS", message: "ok", resultId: "req-1" });
  await fillAndReview();
  expect(screen.getByText(/Bước 3 \/ 3/)).toBeInTheDocument();
  const summary = screen.getByRole("heading", { name: "Yêu cầu của bạn" }).closest("section") as HTMLElement;
  expect(summary).toHaveTextContent("Chạc gạch");
  expect(summary).toHaveTextContent("Công trình Q.7");
  expect(summary).toHaveTextContent(/Ngày mai 15\/11.*Buổi sáng 7–11h/);
  expect(summary).toHaveTextContent("2 xe cn to");
  expect(summary).toHaveTextContent("Hẻm nhỏ");
  expect(summary).toHaveTextContent(/2 × 340\.000.*680\.000/);
  expect(screen.getByText(/Bạn chưa bị tính tiền/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
  await waitFor(() => expect(m.push).toHaveBeenCalledWith("/customer/services/req-1?notice=submitted"));
  expect(m.submit).toHaveBeenCalledWith({
    customerId: catalog.customer.id, siteId: catalog.sites[0].id, newSite: null, serviceTypeId: "44444444-4444-4444-8444-444444444442", quantity: "2", date: "2026-11-15",
    slot: "MORNING", time: null, contactName: "Anh Tuấn", contactPhone: "0901 234 567", note: "Hẻm nhỏ", operationId: operation,
  });
});

it("goes back to edit from the review, keeping what was typed", async () => {
  await fillAndReview();
  fireEvent.click(screen.getByRole("button", { name: "Quay lại sửa" }));
  expect(screen.getByText(/Bước 2 \/ 3/)).toBeInTheDocument();
  expect(screen.getByLabelText("Ghi chú")).toHaveValue("Hẻm nhỏ");
  fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
  expect(screen.getByText(/Bước 1 \/ 3/)).toBeInTheDocument();
});

it("keeps the same operation when the result is unknown so sending again never creates a second request, and takes a new one after a rejection", async () => {
  m.submit.mockResolvedValueOnce({ status: "UNKNOWN", message: "Chưa rõ yêu cầu đã gửi chưa. Bấm “Gửi yêu cầu” lần nữa — hệ thống không tạo yêu cầu trùng." });
  await fillAndReview();
  fireEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
  expect(await screen.findByText(/Chưa rõ yêu cầu đã gửi chưa/)).toBeInTheDocument();
  expect(m.push).not.toHaveBeenCalled();
  m.submit.mockRejectedValueOnce(new Error("network"));
  fireEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
  expect(await screen.findByText(/mất kết nối/)).toBeInTheDocument();
  m.submit.mockResolvedValueOnce({ status: "FAILED", message: "Dịch vụ này không còn nhận đặt trên cổng." });
  fireEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
  expect(await screen.findByText(/không còn nhận đặt/)).toBeInTheDocument();
  m.submit.mockResolvedValueOnce({ status: "SUCCESS", message: "ok", resultId: "req-2" });
  fireEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
  await waitFor(() => expect(m.push).toHaveBeenCalled());
  const operations = m.submit.mock.calls.map(([input]) => input.operationId);
  expect(operations[0]).toBe(operation);
  expect(operations[1]).toBe(operation);
  expect(operations[2]).toBe(operation);
  expect(operations[3]).not.toBe(operation);
});

it("opens at the details when repeating an earlier request, with its service, unit and quantity", () => {
  render(<PortalServiceForm catalog={catalog} operationId={operation} initial={{ serviceName: "Chạc gạch", optionId: "44444444-4444-4444-8444-444444444442", siteId: catalog.sites[0].id, quantity: "3" }} />);
  expect(screen.getByText(/Bước 2 \/ 3/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Số lượng/)).toHaveValue("3");
  expect(screen.getByRole("button", { name: /Xe cn to/ })).toHaveAttribute("aria-pressed", "true");
});
