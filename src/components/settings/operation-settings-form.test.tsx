import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/modules/settings/operation-actions", () => ({ saveOperationSettingsAction: vi.fn() }));
import { OperationSettingsForm } from "./operation-settings-form";

it("says what a setting that acts on its own will do before saving it, and wakes Lưu only on a change (D59)", () => {
  render(<OperationSettingsForm settings={{ stop_minutes: 60, version: 1, auto_source_enabled: false, dispatch_mode: "OFF", work_day_start: "07:00:00", work_day_end: "18:00:00" }} />);
  const save = screen.getByRole("button", { name: "Lưu cài đặt giao hàng" });
  expect(save).toBeDisabled();
  expect(screen.queryByText(/Khi bật/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: /Xác nhận đơn là hệ thống tự lấy kho/ }));
  expect(screen.getByText(/có thể tự tạo đơn mua nhà cung cấp/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Chế độ"), { target: { value: "AUTO" } });
  expect(screen.getByText(/phiếu giao mới được gán xe và tài xế ngay/)).toBeInTheDocument();
  expect(screen.getByText("Có thay đổi chưa lưu")).toBeInTheDocument();
  expect(save).toBeEnabled();
  // The day ends after it starts — on a 24-hour list, never "07:00 AM".
  fireEvent.change(screen.getByLabelText("Giờ kết thúc ngày làm"), { target: { value: "06:30" } });
  expect(screen.getByRole("alert")).toHaveTextContent("Giờ kết thúc phải sau giờ bắt đầu.");
  expect(save).toBeDisabled();
});
