import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));
import { createAnnouncementAction, markAnnouncementsSeenAction, stopAnnouncementAction } from "./actions";

const op = "10000000-0000-4000-8000-000000000001";
const input = (change: Record<string, unknown> = {}) => ({ operationId: op, audience: "CUSTOMER", label: "FEATURE", title: "Mới: đặt dịch vụ",
  body: "Bấm Đặt.", link: "/customer/services/new", ...change });

beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ branchId: "branch" });
  m.rpc.mockResolvedValue({ data: "10000000-0000-4000-8000-000000000099", error: null });
});

it("composes only as the owner, with the operation id, in the database's own terms", async () => {
  expect(await createAnnouncementAction(input())).toMatchObject({ success: true, id: "10000000-0000-4000-8000-000000000099" });
  expect(m.access).toHaveBeenCalledWith("roles.manage");
  expect(m.rpc).toHaveBeenCalledWith("create_announcement", { target_branch_id: "branch", target_audience: "CUSTOMER", target_label: "FEATURE",
    announcement_title: "Mới: đặt dịch vụ", announcement_body: "Bấm Đặt.", announcement_link: "/customer/services/new", role_ids: null, operation_id: op });
});

it("refuses an outside link, roles for customers or a short title before the database", async () => {
  for (const bad of [input({ link: "https://example.com" }), input({ link: "/admin/orders" }), input({ title: "ab" }),
    input({ roleIds: ["10000000-0000-4000-8000-000000000002"] })]) {
    expect((await createAnnouncementAction(bad)).success).toBe(false);
  }
  expect(m.rpc).not.toHaveBeenCalled();
});

it("explains refusals in Vietnamese and treats a lost connection as unknown", async () => {
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "forbidden" } });
  expect((await createAnnouncementAction(input())).message).toBe("Chỉ chủ cửa hàng được gửi thông báo cập nhật.");
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "announcement_no_recipient" } });
  expect((await createAnnouncementAction(input())).message).toContain("Chưa có ai nhận");
  m.rpc.mockRejectedValueOnce(new Error("fetch failed"));
  expect(await createAnnouncementAction(input())).toMatchObject({ success: false, outcomeUnknown: true });
});

it("marks seen and stops with an operation id", async () => {
  expect(await markAnnouncementsSeenAction({ ids: ["10000000-0000-4000-8000-000000000003"], operationId: op })).toBe(true);
  expect(m.rpc).toHaveBeenCalledWith("mark_announcements_seen", { target_ids: ["10000000-0000-4000-8000-000000000003"], operation_id: op });
  expect(await markAnnouncementsSeenAction({ ids: [], operationId: op })).toBe(false);
  expect(await stopAnnouncementAction({ groupId: "10000000-0000-4000-8000-000000000004", operationId: op })).toMatchObject({ success: true });
  expect(m.rpc).toHaveBeenLastCalledWith("stop_announcement", { target_group_id: "10000000-0000-4000-8000-000000000004", operation_id: op });
});
