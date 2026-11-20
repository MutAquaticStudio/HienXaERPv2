import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AstryxServiceRequestDetailView } from "./astryx-view";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
});
afterEach(cleanup);
vi.mock("@/components/sales/action-notice", () => ({ ActionNotice: () => null }));

const info = { sentAt: "20/11/2026 08:12", siteAddress: "Nhà 18 — ngõ 25, Hà Đông", wish: "21/11, Buổi sáng", contactName: "Hoa", contactPhone: "0988 765 432", note: "Đường hẹp", estimate: "2.400.000 ₫ (2 × 1.200.000 ₫)", cancelled: null, rejected: null, job: null };
const base = { title: "Máy trộn bê tông · 2 ca", number: "YC-0018", customer: "Cô Hoa", site: "Nhà 18", stateLabel: "Chờ xác nhận lịch", stateTone: "warning" as const, canSchedule: true, readOnlyOpen: false, info,
  scheduleForm: <form aria-label="Form xếp lịch"><button type="submit">Xếp lịch</button></form>, rejectForm: <form aria-label="Form từ chối"><input name="reason" aria-label="Lý do cho khách" /></form> };

describe("chi tiết yêu cầu dịch vụ kiểu Astryx", () => {
  it("yêu cầu đang chờ có băng với Xếp lịch và Từ chối; Từ chối mở hộp thoại có ô lý do", () => {
    render(<AstryxServiceRequestDetailView {...base} />);
    expect(screen.getByText("Yêu cầu đang chờ xác nhận lịch")).toBeInTheDocument();
    expect(screen.getByText("2.400.000 ₫ (2 × 1.200.000 ₫)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "0988 765 432" })).toHaveAttribute("href", "tel:0988765432");
    fireEvent.click(screen.getByRole("button", { name: "Từ chối" }));
    expect(screen.getByLabelText("Lý do cho khách")).toBeInTheDocument();
  });

  it("người chỉ xem thấy lời nhắc thiếu quyền, không có băng hay form", () => {
    render(<AstryxServiceRequestDetailView {...base} canSchedule={false} readOnlyOpen scheduleForm={null} rejectForm={null} />);
    expect(screen.getByText(/chưa có quyền xếp lịch hoặc từ chối/)).toBeInTheDocument();
    expect(screen.queryByText("Yêu cầu đang chờ xác nhận lịch")).not.toBeInTheDocument();
  });

  it("yêu cầu đã từ chối hiện lý do và liên kết đơn dịch vụ khi đã xếp lịch", () => {
    render(<AstryxServiceRequestDetailView {...base} canSchedule={false} stateLabel="Đã xếp lịch" info={{ ...info, rejected: "Hết máy", job: { id: "j1", number: "DV-0050" } }} />);
    expect(screen.getByText("Hết máy")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "DV-0050" })).toHaveAttribute("href", "/admin/service-jobs/j1");
  });
});
