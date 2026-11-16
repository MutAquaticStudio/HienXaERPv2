import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));
import { deleteAppPushTokenAction, saveAppPushTokenAction } from "./push-actions";

const token = "fcmActionToken:APA91b" + "s".repeat(60);
beforeEach(() => { vi.clearAllMocks(); m.rpc.mockResolvedValue({ data: "id", error: null }); });

it("D86: saves the app's token for the signed-in login through save_app_push_token", async () => {
  expect(await saveAppPushTokenAction({ token, platform: "ANDROID", userAgent: "HienXaAndroid/2.3.0" })).toBe(true);
  expect(m.rpc).toHaveBeenCalledWith("save_app_push_token", { token, platform: "ANDROID", user_agent: "HienXaAndroid/2.3.0" });
  expect(await saveAppPushTokenAction({ token, platform: "ANDROID" })).toBe(true);
  expect(m.rpc).toHaveBeenLastCalledWith("save_app_push_token", { token, platform: "ANDROID", user_agent: null });
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "forbidden" } });
  expect(await saveAppPushTokenAction({ token, platform: "ANDROID" })).toBe(false);
});

it("D86: refuses what is not an app token before reaching the database", async () => {
  for (const input of [null, {}, { token, platform: "IOS" }, { token: "short", platform: "ANDROID" }, { token: "has spaces, not a token at all", platform: "ANDROID" },
    { token, platform: "ANDROID", userAgent: "x".repeat(301) }]) {
    expect(await saveAppPushTokenAction(input)).toBe(false);
  }
  expect(await deleteAppPushTokenAction("short")).toBe(false);
  expect(m.rpc).not.toHaveBeenCalled();
});

it("D86: deletes this phone's token for the login", async () => {
  expect(await deleteAppPushTokenAction(token)).toBe(true);
  expect(m.rpc).toHaveBeenCalledWith("delete_app_push_token", { token });
});
