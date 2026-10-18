// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalAccess: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: m.rpc }) }));

import { getNotificationFeedAction, markNotificationsReadAction } from "./actions";

const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { vi.clearAllMocks(); m.access.mockResolvedValue({ branchId: "b1" }); });

it("reads the active branch feed and normalises the count", async () => {
  m.rpc.mockResolvedValue({ data: { unread: "2", items: [{ id, title: "Đơn mua nháp cần duyệt" }] }, error: null });
  expect(await getNotificationFeedAction({ limit: 10 })).toEqual({ unread: 2, items: [{ id, title: "Đơn mua nháp cần duyệt" }] });
  expect(m.rpc).toHaveBeenCalledWith("notification_feed", { target_branch_id: "b1", page_limit: 10, before_at: null });
});

it("returns null instead of a wrong count when the feed is unavailable", async () => {
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "forbidden" } });
  expect(await getNotificationFeedAction()).toBeNull();
  m.rpc.mockRejectedValueOnce(new Error("fetch failed"));
  expect(await getNotificationFeedAction()).toBeNull();
  expect(await getNotificationFeedAction({ limit: 500 })).toBeNull();
});

it("marks chosen or all notifications of the branch read", async () => {
  m.rpc.mockResolvedValue({ data: 1, error: null });
  expect(await markNotificationsReadAction({ ids: [id] })).toBe(true);
  expect(m.rpc).toHaveBeenCalledWith("mark_notifications_read", { target_branch_id: "b1", notification_ids: [id] });
  expect(await markNotificationsReadAction({ ids: null })).toBe(true);
  expect(m.rpc).toHaveBeenLastCalledWith("mark_notifications_read", { target_branch_id: "b1", notification_ids: null });
  expect(await markNotificationsReadAction({ ids: ["not-a-uuid"] })).toBe(false);
});
