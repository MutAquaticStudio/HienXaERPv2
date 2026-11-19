import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ create: vi.fn(), stop: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/modules/announcements/actions", () => ({ createAnnouncementAction: m.create, stopAnnouncementAction: m.stop }));

import { AnnouncementComposer } from "./announcement-composer";
import type { ComposerOptions, SentAnnouncement } from "@/modules/announcements/presentation";

const options: ComposerOptions = { customers: 41, workers: 12, office: 8,
  roles: [{ id: "10000000-0000-4000-8000-0000000000a1", name: "Bán hàng", count: 3 }, { id: "10000000-0000-4000-8000-0000000000a2", name: "Kế toán", count: 2 }] };
const sent: SentAnnouncement[] = [
  { group_id: "10000000-0000-4000-8000-0000000000b1", audience: "CUSTOMER", kind: "PRICE", label: null, title: "Giá mới từ thứ Hai, 16/11/2026",
    created_at: "2026-11-15T02:12:00Z", expires_at: "2999-12-15T02:12:00Z", withdrawn_at: null, announcements: 38, recipients: 41, seen: 12 },
  { group_id: "10000000-0000-4000-8000-0000000000b2", audience: "OFFICE", kind: "MANUAL", label: "FEATURE", title: "Thợ tự nhận phiếu giao",
    created_at: "2026-11-15T01:30:00Z", expires_at: "2999-12-15T01:30:00Z", withdrawn_at: "2026-11-15T03:00:00Z", announcements: 1, recipients: 8, seen: 6 },
];

beforeEach(() => {
  vi.clearAllMocks();
  m.create.mockResolvedValue({ success: true, message: "Đã gửi thông báo." });
  m.stop.mockResolvedValue({ success: true, message: "Đã ngừng hiện thông báo." });
});
afterEach(cleanup);

it("composes for the chosen people, confirms, sends once and starts a new message", async () => {
  render(<AnnouncementComposer options={options} sent={sent} now={Date.parse("2026-11-15T03:00:00Z")} />);
  expect(screen.getByRole("radio", { name: /Cổng khách · 41 tài khoản/ })).toBeChecked();
  expect(screen.getByText(/Không ghi giá vào tin soạn tay/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: /Thợ & tài xế/ }));
  expect(screen.getByText("Sẽ hiện cho 12 thợ & tài xế")).toBeInTheDocument();
  // Links only to pages of the worker portal.
  const link = screen.getByLabelText("Nút mở trang (không bắt buộc)");
  expect(within(link).getAllByRole("option").map((option) => option.textContent)).toEqual(["Không có nút", "Nhận việc", "Thu nhập", "Chấm công"]);

  // A title is needed: said when leaving the field, the send stops there.
  fireEvent.click(screen.getByRole("button", { name: "Gửi thông báo" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Tiêu đề cần ít nhất 3 ký tự.");
  expect(m.create).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText(/Tiêu đề/), { target: { value: "Quy định mới khi giao hàng" } });
  expect(screen.queryByText("Tiêu đề cần ít nhất 3 ký tự.")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/^Nội dung\d/), { target: { value: "Chụp ảnh hàng tại công trình rồi mới bấm Đã giao." } });
  fireEvent.change(screen.getByLabelText("Nhãn"), { target: { value: "RULE" } });
  fireEvent.change(link, { target: { value: "/work/pool" } });
  // The preview follows what is typed.
  const preview = screen.getByRole("region", { name: "Xem trước" });
  expect(within(preview).getByText("QUY ĐỊNH MỚI")).toBeInTheDocument();
  expect(within(preview).getByText("Quy định mới khi giao hàng")).toBeInTheDocument();
  expect(within(preview).getByText("Nhận việc")).toBeInTheDocument();
  expect(screen.getByText("26/80")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Gửi thông báo" }));
  const confirm = screen.getByRole("dialog", { name: "Gửi cho 12 thợ & tài xế?" });
  expect(m.create).not.toHaveBeenCalled();
  fireEvent.click(within(confirm).getByRole("button", { name: "Gửi ngay" }));
  await waitFor(() => expect(m.create).toHaveBeenCalledTimes(1));
  expect(m.create).toHaveBeenCalledWith({ operationId: expect.stringMatching(/^[0-9a-f-]{36}$/), audience: "WORKER", label: "RULE",
    title: "Quy định mới khi giao hàng", body: "Chụp ảnh hàng tại công trình rồi mới bấm Đã giao.", link: "/work/pool", roleIds: [] });
  expect(await screen.findByRole("status")).toHaveTextContent("Đã gửi cho 12 thợ & tài xế.");
  expect(m.refresh).toHaveBeenCalled();
  expect(screen.getByLabelText(/Tiêu đề/)).toHaveValue("");
});

it("office: some roles only, counted from those roles", async () => {
  render(<AnnouncementComposer options={options} sent={[]} now={Date.parse("2026-11-15T03:00:00Z")} />);
  fireEvent.click(screen.getByRole("radio", { name: /Nhân viên văn phòng/ }));
  expect(screen.getByText("Sẽ hiện cho 8 nhân viên")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Kế toán (2)" }));
  expect(screen.getByText("Sẽ hiện cho 2 nhân viên")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Tiêu đề/), { target: { value: "Lịch nghỉ Tết" } });
  fireEvent.click(screen.getByRole("button", { name: "Gửi thông báo" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Gửi cho 2 nhân viên?" })).getByRole("button", { name: "Gửi ngay" }));
  await waitFor(() => expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ audience: "OFFICE", roleIds: ["10000000-0000-4000-8000-0000000000a2"] })));
  expect(screen.getByText(/Chưa có thông báo nào/)).toBeInTheDocument();
});

it("says why a send failed and keeps what was typed", async () => {
  m.create.mockResolvedValue({ success: false, message: "Chỉ chủ cửa hàng được gửi thông báo cập nhật." });
  render(<AnnouncementComposer options={options} sent={[]} now={Date.parse("2026-11-15T03:00:00Z")} />);
  fireEvent.change(screen.getByLabelText(/Tiêu đề/), { target: { value: "Tin thử" } });
  fireEvent.click(screen.getByRole("button", { name: "Gửi thông báo" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Gửi ngay" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Chỉ chủ cửa hàng được gửi thông báo cập nhật.");
  expect(screen.getByLabelText(/Tiêu đề/)).toHaveValue("Tin thử");
});

it("lists what was sent, automatic ones too, with how many saw it, and stops one after asking", async () => {
  render(<AnnouncementComposer options={options} sent={sent} now={Date.parse("2026-11-15T03:00:00Z")} />);
  const table = screen.getByRole("region", { name: "Đã gửi gần đây" });
  const [, first, second] = within(table).getAllByRole("row");
  expect(within(first).getByText("Khách có giá thay đổi (38)")).toBeInTheDocument();
  expect(within(first).getByText("Tự động · lưu giá")).toBeInTheDocument();
  expect(within(first).getByText("12/41")).toBeInTheDocument();
  expect(within(second).getByText("Đã ngừng")).toBeInTheDocument();
  expect(within(second).getByText("Soạn tay")).toBeInTheDocument();
  fireEvent.click(within(first).getByRole("button", { name: "Ngừng hiện Giá mới từ thứ Hai, 16/11/2026" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Ngừng hiện thông báo này?" })).getByRole("button", { name: "Ngừng hiện" }));
  await waitFor(() => expect(m.stop).toHaveBeenCalledWith({ groupId: sent[0].group_id, operationId: expect.any(String) }));
  expect(m.refresh).toHaveBeenCalled();
});
