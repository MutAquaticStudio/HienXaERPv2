import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ path: "/customer", seen: vi.fn(async () => true) }));
vi.mock("next/navigation", () => ({ usePathname: () => m.path }));
vi.mock("@/modules/announcements/actions", () => ({ markAnnouncementsSeenAction: m.seen }));

import { UpdatePopup } from "./update-popup";
import type { Announcement } from "@/modules/announcements/presentation";

const price: Announcement = {
  id: "10000000-0000-4000-8000-000000000001", audience: "CUSTOMER", kind: "PRICE", label: null,
  title: "Giá mới từ thứ Hai, 16/11/2026", body: "Cửa hàng điều chỉnh giá 5 mặt hàng của bạn. Đơn đã chốt trước đó giữ nguyên giá cũ.", link: null,
  effective_at: "2026-11-15T17:00:00Z", created_at: "2026-11-15T02:12:00Z", updated_at: "2026-11-15T02:12:00Z", seen_at: null,
  lines: [
    { code: "XM40", name: "Xi măng Hà Tiên PCB40", unit: "Bao", old: "95000", old_kind: "VND", new: "98000", new_kind: "VND" },
    { code: "THEP10", name: "Thép Hòa Phát D10", unit: "Cây", old: "120000", old_kind: "VND", new: "116000", new_kind: "VND" },
    { code: "CVBT", name: "Cát vàng bê tông", unit: "Khối", old: "520000", old_kind: "VND", new: "540000", new_kind: "VND" },
    { code: "DA", name: "Đá 1x2", unit: "Khối", old: "470000", old_kind: "VND", new: "480000", new_kind: "VND" },
    { code: "GACH", name: "Gạch đặc A1", unit: "Viên", old: "1600", old_kind: "VND", new: "1650", new_kind: "VND" },
  ],
};
const news: Announcement = {
  id: "10000000-0000-4000-8000-000000000002", audience: "CUSTOMER", kind: "MANUAL", label: "FEATURE", title: "Mới: đặt dịch vụ ngay trên app",
  body: "Bấm nút Đặt ở giữa thanh dưới, chọn Dịch vụ.", link: "/customer/services/new", effective_at: null,
  created_at: "2026-11-14T10:05:00Z", updated_at: "2026-11-14T10:05:00Z", seen_at: null, lines: [],
};
const rule: Announcement = { ...news, id: "10000000-0000-4000-8000-000000000003", label: "RULE", title: "Quy định mới khi nhận hàng", link: null };

beforeEach(() => { m.path = "/customer"; m.seen.mockClear(); });
afterEach(cleanup);

describe("portal sheet", () => {
  it("shows several pending in one popup, price first, and 'Đã hiểu' marks each seen then shows the next", () => {
    render(<UpdatePopup items={[price, news, rule]} surface="CUSTOMER" home="/customer" />);
    const dialog = screen.getByRole("dialog", { name: "Giá mới từ thứ Hai, 16/11/2026" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText("CẬP NHẬT GIÁ")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Thông báo 1 trên 3")).toHaveTextContent("1/3");
    // Old → new, and the change in words.
    expect(within(dialog).getByText("95.000 ₫")).toBeInTheDocument();
    expect(within(dialog).getByText("98.000 ₫")).toBeInTheDocument();
    expect(within(dialog).getByText("Tăng 3.000 ₫")).toBeInTheDocument();
    expect(within(dialog).getByText("Giảm 4.000 ₫")).toBeInTheDocument();
    // Three lines at first, the rest on request.
    expect(within(dialog).queryByText("Đá 1x2")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Xem thêm 2 mặt hàng" }));
    expect(within(dialog).getByText("Đá 1x2")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Thu gọn" })).toHaveAttribute("aria-expanded", "true");
    // No "open your price list" button (Owner: the customer checks the price when ordering).
    expect(within(dialog).queryByRole("link")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Còn 2 thông báo nữa")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Đã hiểu" }));
    expect(m.seen).toHaveBeenCalledWith({ ids: [price.id], operationId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    const second = screen.getByRole("dialog", { name: "Mới: đặt dịch vụ ngay trên app" });
    expect(within(second).getByText("TÍNH NĂNG MỚI")).toBeInTheDocument();
    expect(within(second).getByText("2/3")).toBeInTheDocument();
    expect(within(second).getByRole("link", { name: "Đặt dịch vụ" })).toHaveAttribute("href", "/customer/services/new");
    expect(within(second).getByText("Còn 1 thông báo: Quy định mới khi nhận hàng")).toBeInTheDocument();
    expect(within(second).getByRole("button", { name: "Đã hiểu" })).toHaveFocus();

    fireEvent.click(within(second).getByRole("button", { name: "Đã hiểu" }));
    expect(within(screen.getByRole("dialog")).getByText("Đây là thông báo cuối")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đã hiểu" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(m.seen).toHaveBeenCalledTimes(3);
  });

  it("Esc (and Đóng) marks the current one seen and leaves the rest for the next open", () => {
    render(<UpdatePopup items={[price, news]} surface="CUSTOMER" home="/customer" />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(m.seen).toHaveBeenCalledTimes(1);
    expect(m.seen).toHaveBeenCalledWith(expect.objectContaining({ ids: [price.id] }));
    cleanup();
    render(<UpdatePopup items={[news]} surface="CUSTOMER" home="/customer" />);
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(m.seen).toHaveBeenLastCalledWith(expect.objectContaining({ ids: [news.id] }));
  });

  it("gives the focus back where it was and keeps the page behind out of reach", () => {
    const view = render(<div><button type="button">Trước đó</button></div>);
    const before = screen.getByRole("button", { name: "Trước đó" });
    before.focus();
    view.rerender(<div><button type="button">Trước đó</button><UpdatePopup items={[news]} surface="CUSTOMER" home="/customer" /></div>);
    expect((before as HTMLElement & { inert: boolean }).inert).toBe(true);
    expect(screen.getByRole("button", { name: "Đã hiểu" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Đã hiểu" }));
    expect((before as HTMLElement & { inert: boolean }).inert).toBeFalsy();
    expect(before).toHaveFocus();
  });

  it("waits for the portal's home: a link that opens an order is not interrupted", () => {
    m.path = "/customer/orders/10000000-0000-4000-8000-000000000009";
    render(<UpdatePopup items={[price]} surface="CUSTOMER" home="/customer" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(m.seen).not.toHaveBeenCalled();
  });

  it("a receiver's popup (no price announcement from the database) shows no price at all", () => {
    render(<UpdatePopup items={[news]} surface="CUSTOMER" home="/customer" />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("CẬP NHẬT GIÁ")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/₫/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/^\d+\/\d+$/)).not.toBeInTheDocument();
  });

  it("pay rates for workers: 'mỗi' unit, new and stopped rates in words, percent rates", () => {
    m.path = "/work";
    render(<UpdatePopup surface="WORKER" home="/work" items={[{ ...price, audience: "WORKER", kind: "PAY_RATE", title: "Đơn giá công mới", effective_at: null,
      body: "Văn phòng đổi 3 đơn giá công lúc 09:40, 15/11/2026. Phiếu lương đã chốt giữ nguyên.", lines: [
        { code: "XM40", name: "Xi măng Hà Tiên PCB40", unit: "Bao", old: "3000", old_kind: "VND", new: "3500", new_kind: "VND" },
        { code: "CAU", name: "Xe cẩu", unit: "giờ", old: null, old_kind: null, new: "500", new_kind: "BPS" },
        { code: "CHUYEN", name: "Tiền chuyến xe nhỏ", unit: "chuyến", old: "30000", old_kind: "VND", new: null, new_kind: null },
      ] }]} />);
    const dialog = screen.getByRole("dialog", { name: "Đơn giá công mới" });
    expect(within(dialog).getByText("ĐƠN GIÁ CÔNG")).toBeInTheDocument();
    expect(within(dialog).getByText("mỗi Bao")).toBeInTheDocument();
    expect(within(dialog).getByText("Tăng 500 ₫")).toBeInTheDocument();
    expect(within(dialog).getByText("trên tiền tính khách")).toBeInTheDocument();
    expect(within(dialog).getByText("5%")).toBeInTheDocument();
    expect(within(dialog).getByText("Mới")).toBeInTheDocument();
    expect(within(dialog).getByText("Ngừng áp dụng")).toBeInTheDocument();
  });
});

describe("office dialog", () => {
  it("shows the common price table with the change in words and opens the price list", () => {
    m.path = "/admin";
    render(<UpdatePopup surface="OFFICE" home="/admin" items={[{ ...price, audience: "OFFICE", title: "Giá chung đổi 5 mặt hàng từ 16/11/2026",
      body: "Khách có giá nhóm hoặc giá riêng cho mặt hàng nào thì mặt hàng đó không đổi với họ. Đã báo 38 khách có giá thay đổi; mỗi khách chỉ thấy giá của mình." }, news]} />);
    const dialog = screen.getByRole("dialog", { name: "Giá chung đổi 5 mặt hàng từ 16/11/2026" });
    expect(within(dialog).getByText(/Cập nhật giá · 1\/2/)).toBeInTheDocument();
    expect(within(dialog).getByRole("columnheader", { name: "Từ 16/11" })).toBeInTheDocument();
    expect(within(dialog).getByText("Tăng 3.000 ₫ · 3,1%")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Mở bảng giá" })).toHaveAttribute("href", "/admin/products/pricing");
    fireEvent.click(within(dialog).getByRole("button", { name: "Đã hiểu" }));
    expect(m.seen).toHaveBeenCalledWith(expect.objectContaining({ ids: [price.id] }));
  });
});
