import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ cancel: vi.fn(), refresh: vi.fn() }));
vi.mock("@/modules/portal/service-actions", () => ({ cancelServiceRequestAction: m.cancel }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
import { CancelServiceRequestButton } from "./cancel-service-request-button";

const id = "66666666-6666-4666-8666-666666666666";
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const open = () => fireEvent.click(screen.getByRole("button", { name: "Hủy yêu cầu" }));
// While the question is open the first button is gone, so this finds the confirming one.
const confirm = () => fireEvent.click(screen.getByRole("button", { name: "Hủy yêu cầu" }));

it("asks once before cancelling, can be dismissed, and reloads the page after a cancel", async () => {
  m.cancel.mockResolvedValue({ status: "SUCCESS", message: "Đã hủy yêu cầu.", resultId: id });
  render(<CancelServiceRequestButton requestId={id} />);
  open();
  expect(screen.getByRole("group", { name: "Xác nhận hủy yêu cầu" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Giữ yêu cầu" }));
  expect(screen.queryByRole("group", { name: "Xác nhận hủy yêu cầu" })).not.toBeInTheDocument();
  open();
  fireEvent.change(screen.getByLabelText(/Lý do/), { target: { value: "Đặt nhầm" } });
  confirm();
  await waitFor(() => expect(m.refresh).toHaveBeenCalled());
  expect(m.cancel).toHaveBeenCalledWith({ requestId: id, reason: "Đặt nhầm", operationId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
});

it("explains why a scheduled request cannot be cancelled and reloads to show the new state", async () => {
  m.cancel.mockResolvedValue({ status: "FAILED", message: "Cửa hàng đã xếp lịch hoặc đã xử lý yêu cầu này nên không hủy trên cổng được. Nhắn tin hoặc gọi cửa hàng để đổi hoặc hủy lịch." });
  render(<CancelServiceRequestButton requestId={id} />);
  open();
  confirm();
  expect(await screen.findByText(/Nhắn tin hoặc gọi cửa hàng/)).toBeInTheDocument();
  expect(m.refresh).toHaveBeenCalled();
});

it("sends the same operation again after an unknown result, and a new one after a rejection", async () => {
  m.cancel.mockResolvedValueOnce({ status: "UNKNOWN", message: "Chưa rõ yêu cầu đã hủy chưa. Bấm “Hủy yêu cầu” lần nữa." });
  render(<CancelServiceRequestButton requestId={id} />);
  open();
  confirm();
  expect(await screen.findByText(/Chưa rõ yêu cầu đã hủy chưa/)).toBeInTheDocument();
  m.cancel.mockRejectedValueOnce(new Error("network"));
  confirm();
  expect(await screen.findByText(/mất kết nối/)).toBeInTheDocument();
  m.cancel.mockResolvedValueOnce({ status: "SUCCESS", message: "Đã hủy yêu cầu.", resultId: id });
  confirm();
  await waitFor(() => expect(m.refresh).toHaveBeenCalled());
  const operations = m.cancel.mock.calls.map(([input]) => input.operationId);
  expect(new Set(operations).size).toBe(1);
});
