import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("@/lib/auth/app-origin", () => ({ appOrigin: async () => "https://app.hienxavlxd.com" }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: m.rpc }) }));
import { saveZaloTemplateAction, sendZaloTestAction, setZaloModeAction } from "./actions";
import { setCustomerZaloNotifyAction } from "./notify-actions";
import { startZaloOAuthAction } from "./connect-actions";
import { isZaloPhone } from "./phone";

beforeEach(() => { vi.clearAllMocks(); m.access.mockResolvedValue({ branchId: "b1" }); m.rpc.mockResolvedValue({ data: null, error: null }); });

it("starts OAuth with the app's https callback and only follows Zalo's permission page", async () => {
  m.rpc.mockResolvedValue({ data: "https://oauth.zaloapp.com/v4/oa/permission?app_id=1234567&state=x", error: null });
  expect(await startZaloOAuthAction(" 1234567 ")).toEqual({ ok: true, message: expect.any(String), url: "https://oauth.zaloapp.com/v4/oa/permission?app_id=1234567&state=x" });
  expect(m.access).toHaveBeenCalledWith("roles.manage");
  expect(m.rpc).toHaveBeenCalledWith("start_zalo_oauth", { target_app_id: "1234567", redirect_uri: "https://app.hienxavlxd.com/api/zalo/oauth/callback" });
  m.rpc.mockResolvedValue({ data: "https://evil.test/", error: null });
  expect((await startZaloOAuthAction("1234567")).ok).toBe(false);
  expect(await startZaloOAuthAction("abc")).toEqual({ ok: false, message: expect.stringContaining("App ID") });
});

it("saves a template only with an id when switched on, and explains refusals in Vietnamese", async () => {
  expect((await saveZaloTemplateAction({ event: "ORDER_CONFIRMED", templateId: "", active: true, version: 1 })).message).toContain("mã mẫu tin");
  expect(m.rpc).not.toHaveBeenCalled();
  expect((await saveZaloTemplateAction({ event: "ORDER_CONFIRMED", templateId: "111", active: true, version: 1 })).ok).toBe(true);
  expect(m.rpc).toHaveBeenCalledWith("set_zalo_template", { target_event: "ORDER_CONFIRMED", target_template_id: "111", enabled: true, expected_version: 1 });
  m.rpc.mockResolvedValue({ data: null, error: { code: "PT409", message: "zalo_template_version_conflict" } });
  expect((await saveZaloTemplateAction({ event: "ORDER_CONFIRMED", templateId: "111", active: true, version: 1 })).message).toContain("người khác sửa");
  expect((await saveZaloTemplateAction({ event: "DROP", templateId: "1", active: false, version: 1 })).ok).toBe(false);
});

it("switches the sending mode, sends a test, and treats transport errors as unknown", async () => {
  expect((await setZaloModeAction("production")).ok).toBe(true);
  expect(m.rpc).toHaveBeenCalledWith("set_zalo_send_mode", { target_mode: "production" });
  expect((await setZaloModeAction("spam")).ok).toBe(false);
  m.rpc.mockResolvedValue({ data: null, error: { code: "55000", message: "zalo_not_connected" } });
  expect((await sendZaloTestAction({ event: "PAYMENT_RECEIVED", phone: "0912345678", operationId: "11111111-1111-4111-8111-111111111111" })).message).toContain("chưa kết nối");
  m.rpc.mockRejectedValue(new Error("network"));
  expect((await sendZaloTestAction({ event: "PAYMENT_RECEIVED", phone: "0912345678", operationId: "11111111-1111-4111-8111-111111111111" })).message).toContain("Chưa xác định");
});

it("lets staff or the customer switch Zalo notifications for a customer", async () => {
  expect(await setCustomerZaloNotifyAction({ customerId: "22222222-2222-4222-8222-222222222222", enabled: false })).toEqual({ ok: true, message: "Đã tắt nhận thông báo qua Zalo." });
  expect(m.rpc).toHaveBeenCalledWith("set_customer_zalo_notify", { target_customer_id: "22222222-2222-4222-8222-222222222222", enabled: false });
  m.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "forbidden" } });
  expect((await setCustomerZaloNotifyAction({ customerId: "22222222-2222-4222-8222-222222222222", enabled: true })).message).toContain("không có quyền");
});

it("recognises Vietnamese mobile numbers like the database", () => {
  expect(["0912 345 678", "+84 912-345-678", "84912345678", "0389999999"].every(isZaloPhone)).toBe(true);
  expect(["024 3555 1234", "", null, "0912"].some(isZaloPhone)).toBe(false);
});
