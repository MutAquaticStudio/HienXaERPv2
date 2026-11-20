import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AxBanner, AxFacts, AxFormPage, AxMeter, AxPanel, AxSum, AxTabs } from "./sales-kit";

afterEach(cleanup);

describe("bộ thành phần bố cục nhóm Bán hàng (Astryx)", () => {
  it("AxFormPage có tiêu đề, câu dẫn, nút và giữ nguyên form chức năng bên trong", () => {
    render(<AxFormPage crumbs={["Bán hàng", "Đơn bán", "Tạo mới"]} title="Tạo đơn bán" lede="Tìm vật tư (F3)." actions={<button type="button">Về danh sách</button>}><form aria-label="Form đơn" /></AxFormPage>);
    expect(screen.getByRole("heading", { name: "Tạo đơn bán" })).toBeInTheDocument();
    expect(screen.getByText("Tìm vật tư (F3).")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Form đơn" })).toBeInTheDocument();
  });

  it("AxTabs đánh dấu thẻ đang mở bằng aria-current; AxFacts bỏ mục rỗng", () => {
    render(<><AxTabs label="Nội dung" tabs={[{ id: "a", label: "Một" }, { id: "b", label: "Hai", count: 4 }]} active="b" href={(tab) => `?tab=${tab}`} />
      <AxFacts items={[{ label: "Khách", value: "Bảo Long" }, false, null]} /></>);
    expect(screen.getByRole("link", { name: /Hai/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Một" })).toHaveAttribute("href", "?tab=a");
    expect(screen.getAllByRole("term")).toHaveLength(1);
  });

  it("AxMeter giới hạn trong 0–100 và AxSum/AxPanel hiện nhãn tiếng Việt", () => {
    render(<><AxMeter percent={140} label="Đã dùng hạn mức" /><AxPanel title="Thanh toán"><AxSum big label="Tổng đơn" value="1.000 ₫" /></AxPanel><AxBanner status="warning" title="Chờ duyệt" description="Mô tả" /></>);
    expect(screen.getByRole("progressbar", { name: "Đã dùng hạn mức" })).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByRole("heading", { name: "Thanh toán" })).toBeInTheDocument();
    expect(screen.getByText("Tổng đơn")).toBeInTheDocument();
    expect(screen.getByText("Chờ duyệt")).toBeInTheDocument();
  });
});
