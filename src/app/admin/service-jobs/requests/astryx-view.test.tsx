import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AstryxServiceRequestsView } from "./astryx-view";

afterEach(cleanup);
const FILTERS = [{ value: "SUBMITTED", label: "Chờ xác nhận lịch" }, { value: "SCHEDULED", label: "Đã xếp lịch" }, { value: "ALL", label: "Tất cả" }];
const row = { id: "r1", number: "YC-0018", customer: "Cô Hoa · Hà Đông", site: "Số 18 ngõ 25", service: "Máy trộn bê tông", quantity: "2 ca", wish: "21/11", slot: "Buổi sáng", sentAt: "20/11/2026 08:12", stateLabel: "Chờ xác nhận lịch", stateTone: "warning" as const };

describe("yêu cầu dịch vụ của khách kiểu Astryx", () => {
  it("hiện hộp thư, nhãn trạng thái thật và bộ lọc dạng liên kết", () => {
    render(<AstryxServiceRequestsView rows={[row]} state="SUBMITTED" filters={FILTERS} />);
    expect(screen.getByRole("heading", { name: "Yêu cầu từ khách" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "YC-0018" })).toHaveAttribute("href", "/admin/service-jobs/requests/r1");
    expect(screen.getByRole("radio", { name: /Đã xếp lịch/ })).toHaveAttribute("href", "/admin/service-jobs/requests?state=SCHEDULED");
    expect(screen.getByRole("radio", { name: /Chờ xác nhận lịch/ })).toHaveAttribute("aria-checked", "true");
  });

  it("trạng thái trống theo mục đang xem", () => {
    render(<AstryxServiceRequestsView rows={[]} state="SUBMITTED" filters={FILTERS} />);
    expect(screen.getByText("Không có yêu cầu nào đang chờ xác nhận lịch.")).toBeInTheDocument();
  });
});
