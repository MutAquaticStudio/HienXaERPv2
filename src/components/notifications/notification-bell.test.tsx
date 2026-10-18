import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ feed: vi.fn(), mark: vi.fn(), refresh: vi.fn() }));
vi.mock("@/modules/notifications/actions", () => ({ getNotificationFeedAction: m.feed, markNotificationsReadAction: m.mark }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh, push: vi.fn() }) }));
vi.mock("@/lib/supabase/browser", () => ({ createBrowserSupabase: () => { throw new Error("no realtime in tests"); } }));

import { NotificationBell } from "./notification-bell";

const items = [
  { id: "n1", kind: "delivery.result_submitted", title: "Giao thiếu GH-000012", body: "Khách A · Công trình 1", link: "/admin/deliveries/d1", created_at: "2026-10-18T03:00:00Z", read: false },
  { id: "n2", kind: "work.assigned", title: "Đơn mua nháp cần duyệt", body: null, link: null, created_at: "2026-10-18T02:00:00Z", read: true },
];
beforeEach(() => { vi.clearAllMocks(); m.feed.mockResolvedValue({ unread: 1, items }); m.mark.mockResolvedValue(true); });
afterEach(cleanup);

it("shows the unread count and the list with links to the document", async () => {
  render(<NotificationBell branchId="b1" />);
  const button = await screen.findByRole("button", { name: "Thông báo, 1 chưa đọc" });
  fireEvent.click(button);
  const panel = await screen.findByRole("dialog", { name: "Thông báo" });
  expect(panel).toHaveTextContent("Giao thiếu GH-000012");
  expect(screen.getByRole("link", { name: /Giao thiếu GH-000012/ })).toHaveAttribute("href", "/admin/deliveries/d1");
  expect(screen.getByLabelText("Chưa đọc")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Xem tất cả thông báo" })).toHaveAttribute("href", "/admin/notifications");
});

it("marks everything read and reloads the count", async () => {
  render(<NotificationBell branchId="b1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Thông báo, 1 chưa đọc" }));
  m.feed.mockResolvedValue({ unread: 0, items: items.map((item) => ({ ...item, read: true })) });
  fireEvent.click(await screen.findByRole("button", { name: "Đánh dấu đã đọc hết" }));
  await waitFor(() => expect(m.mark).toHaveBeenCalledWith({ ids: null }));
  expect(await screen.findByRole("button", { name: "Thông báo" })).toBeInTheDocument();
});

it("opening an unread notification marks it read and closes the panel; Escape closes too", async () => {
  render(<NotificationBell branchId="b1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Thông báo, 1 chưa đọc" }));
  fireEvent.click(await screen.findByRole("link", { name: /Giao thiếu GH-000012/ }));
  await waitFor(() => expect(m.mark).toHaveBeenCalledWith({ ids: ["n1"] }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Thông báo/ }));
  await screen.findByRole("dialog");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
