import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  access: vi.fn(), rpc: vi.fn(), customer: vi.fn(), signIn: vi.fn(), signUp: vi.fn(), getUser: vi.fn(), updateUser: vi.fn(), refresh: vi.fn(),
  createUser: vi.fn(), deleteUser: vi.fn(), updateUserById: vi.fn(),
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => {
  const query = { select: () => query, eq: () => query, maybeSingle: m.customer };
  return { from: () => query, rpc: m.rpc,
    auth: { signInWithPassword: m.signIn, signUp: m.signUp, getUser: m.getUser, updateUser: m.updateUser, refreshSession: m.refresh } };
} }));
vi.mock("@/lib/supabase/config", () => ({ getSupabaseConfig: () => ({ url: "https://qa.example.test" }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { admin: { createUser: m.createUser, deleteUser: m.deleteUser, updateUserById: m.updateUserById } } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn(async () => new Headers({ host: "erp.example.test", "x-forwarded-proto": "https" })) }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/modules/portal/server", () => ({ portalRpc: vi.fn(), deterministicUuid: (seed: string) => `uuid(${seed})` }));
import { changeOwnPasswordAction, createCustomerPortalAccountAction, loginAction, registerCustomerAccountAction, resetCustomerPortalPasswordAction } from "./actions";

const customerId = "11111111-1111-4111-8111-111111111111";
const membershipId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const form = (values: Record<string, string>) => { const data = new FormData(); Object.entries(values).forEach(([key, value]) => data.set(key, value)); return data; };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-only-not-a-credential");
  m.access.mockResolvedValue({ branchId: "b1", permissions: new Set(["customers.manage"]) });
  m.customer.mockResolvedValue({ data: { id: customerId }, error: null });
  m.rpc.mockResolvedValue({ data: null, error: null });
  m.createUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  m.updateUserById.mockResolvedValue({ data: {}, error: null });
  m.updateUser.mockResolvedValue({ data: {}, error: null });
  m.refresh.mockResolvedValue({ data: {}, error: null });
  m.deleteUser.mockResolvedValue({ data: {}, error: null });
});

it("signs in with a phone number as the internal phone login", async () => {
  m.signIn.mockResolvedValue({ data: { user: { id: userId, user_metadata: {} } }, error: null });
  await expect(loginAction(undefined, form({ email: "0912 345 678", password: "matkhau123", surface: "work" }))).rejects.toThrow("REDIRECT:/");
  expect(m.signIn).toHaveBeenCalledWith({ email: "0912345678@sdt.hienxavlxd.com", password: "matkhau123" });
  expect(m.rpc).not.toHaveBeenCalled();
});

it("finishes a pending self-registration at the first customer sign-in with one operation id per login", async () => {
  m.signIn.mockResolvedValue({ data: { user: { id: userId, user_metadata: { hx_registration: { name: "Anh Tư", phone: "0912345678", address: "12 Lê Lợi, Huế" } } } }, error: null });
  await expect(loginAction(undefined, form({ email: "tu@example.test", password: "matkhau123", surface: "customer" }))).rejects.toThrow("REDIRECT:/customer");
  expect(m.rpc).toHaveBeenCalledWith("register_portal_customer", { display_name: "Anh Tư", phone: "0912345678", address_text: "12 Lê Lợi, Huế",
    operation_id: `uuid(register_portal_customer:${userId})` });
});

it("creates a customer login with a temporary password, links it and returns the text to send over Zalo", async () => {
  const result = await createCustomerPortalAccountAction(undefined, form({ customerId, login: "0912.345.678", password: "TamThoi99", role: "OWNER" }));
  expect(m.access).toHaveBeenCalledWith("customers.manage");
  expect(m.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "0912345678@sdt.hienxavlxd.com", password: "TamThoi99", email_confirm: true,
    app_metadata: { hx_must_change_password: true } }));
  expect(m.rpc).toHaveBeenCalledWith("grant_customer_portal_access", expect.objectContaining({ target_customer_id: customerId, target_auth_user_id: userId, membership_role: "OWNER" }));
  expect(result?.success).toBe(true);
  expect(result?.shareText).toContain("https://erp.example.test/customer/login");
  expect(result?.shareText).toContain("Đăng nhập: 0912345678");
  expect(result?.shareText).not.toContain("sdt.hienxavlxd.com");
});

it("removes the new login again when it cannot be linked to the customer", async () => {
  m.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "portal_access_exists" } });
  const result = await createCustomerPortalAccountAction(undefined, form({ customerId, login: "khach@example.test", password: "TamThoi99", role: "RECEIVER" }));
  expect(result?.success).not.toBe(true);
  expect(m.deleteUser).toHaveBeenCalledWith(userId);
});

it("does not create a login for a customer outside the managed branch or for an invalid sign-in name", async () => {
  m.customer.mockResolvedValue({ data: null, error: null });
  expect((await createCustomerPortalAccountAction(undefined, form({ customerId, login: "0912345678", password: "TamThoi99", role: "OWNER" })))?.success).not.toBe(true);
  expect((await createCustomerPortalAccountAction(undefined, form({ customerId, login: "12345", password: "TamThoi99", role: "OWNER" })))?.message).toContain("chưa đúng");
  expect(m.createUser).not.toHaveBeenCalled();
});

it("resets only an active login of that customer and asks for a new change at the next sign-in", async () => {
  m.rpc.mockResolvedValue({ data: [{ membership_id: membershipId, auth_user_id: userId, email: "0912345678@sdt.hienxavlxd.com", active: true }], error: null });
  const result = await resetCustomerPortalPasswordAction(undefined, form({ customerId, membershipId, password: "MoiTam123" }));
  expect(m.updateUserById).toHaveBeenCalledWith(userId, { password: "MoiTam123", app_metadata: { hx_must_change_password: true } });
  expect(result?.shareText).toContain("Mật khẩu tạm: MoiTam123");
  m.rpc.mockResolvedValue({ data: [{ membership_id: membershipId, auth_user_id: userId, email: "x@example.test", active: false }], error: null });
  m.updateUserById.mockClear();
  expect((await resetCustomerPortalPasswordAction(undefined, form({ customerId, membershipId, password: "MoiTam123" })))?.success).not.toBe(true);
  expect(m.updateUserById).not.toHaveBeenCalled();
});

it("changes the temporary password, clears the flag and opens the portal", async () => {
  m.getUser.mockResolvedValue({ data: { user: { id: userId } } });
  expect((await changeOwnPasswordAction(undefined, form({ password: "MatKhauMoi1", confirm: "khac", surface: "customer" })))?.message).toContain("giống nhau");
  await expect(changeOwnPasswordAction(undefined, form({ password: "MatKhauMoi1", confirm: "MatKhauMoi1", surface: "customer" }))).rejects.toThrow("REDIRECT:/customer?notice=password-changed");
  expect(m.updateUser).toHaveBeenCalledWith({ password: "MatKhauMoi1" });
  expect(m.updateUserById).toHaveBeenCalledWith(userId, { app_metadata: { hx_must_change_password: false } });
  expect(m.refresh).toHaveBeenCalled();
});

it("registers a customer: the record is made right away when signed in, or after the email is confirmed", async () => {
  const values = { name: "Cửa hàng Minh", phone: "+84 912 345 678", address: "5 Trần Phú, Đà Nẵng", email: "Minh@Example.test", password: "matkhau123", confirm: "matkhau123" };
  m.signUp.mockResolvedValue({ data: { user: { id: userId }, session: null }, error: null });
  const pending = await registerCustomerAccountAction(undefined, form(values));
  expect(pending?.success).toBe(true);
  expect(m.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "minh@example.test",
    options: { data: { hx_registration: { name: "Cửa hàng Minh", phone: "0912345678", address: "5 Trần Phú, Đà Nẵng" } }, emailRedirectTo: "https://erp.example.test/customer/login?confirmed=1" } }));
  expect(m.rpc).not.toHaveBeenCalled();

  m.signUp.mockResolvedValue({ data: { user: { id: userId }, session: { access_token: "t" } }, error: null });
  await expect(registerCustomerAccountAction(undefined, form(values))).rejects.toThrow("REDIRECT:/customer?notice=registered");
  expect(m.rpc).toHaveBeenCalledWith("register_portal_customer", expect.objectContaining({ phone: "0912345678", operation_id: `uuid(register_portal_customer:${userId})` }));

  m.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: "Signups not allowed for this instance" } });
  expect((await registerCustomerAccountAction(undefined, form(values)))?.message).toContain("chưa mở tự đăng ký");
});
