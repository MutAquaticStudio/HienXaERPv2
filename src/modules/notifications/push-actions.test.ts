import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));
import { deleteAppPushTokenAction, saveAppPushTokenAction, savePushSubscriptionAction } from "./push-actions";
import { isPushServiceEndpoint } from "./push-endpoint";

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

it("D97 (T-2): a browser's push address is saved only on a real push service", async () => {
  const keys = { p256dh: "p".repeat(40), auth: "a".repeat(16) };
  for (const endpoint of ["https://fcm.googleapis.com/fcm/send/abc:APA91b", "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA", "https://web.push.apple.com/QGx2"]) {
    expect(isPushServiceEndpoint(endpoint)).toBe(true);
    expect(await savePushSubscriptionAction({ endpoint, keys })).toBe(true);
  }
  expect(m.rpc).toHaveBeenCalledTimes(4);
  m.rpc.mockClear();
  for (const endpoint of ["https://push.example.test/x", "https://fcm.googleapis.com.evil.example/x", "https://fcm.googleapis.com" + "@evil.example/x",
    "http://fcm.googleapis.com/fcm/send/x", "https://10.0.0.5/x", "https://fcm.googleapis.com:8443/x", "https://notify.windows.com.evil.example/x"]) {
    expect(isPushServiceEndpoint(endpoint)).toBe(false);
    expect(await savePushSubscriptionAction({ endpoint, keys })).toBe(false);
  }
  expect(m.rpc).not.toHaveBeenCalled();
});
