import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ access: vi.fn(), server: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), role: vi.fn(), rpc: vi.fn(), admin: vi.fn(), invite: vi.fn(), generate: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: m.server }));
vi.mock("@/lib/supabase/config", () => ({ getSupabaseConfig: () => ({ url: "https://qa.example.test" }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: m.admin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn(async () => new Headers({ host: "erp.example.test", "x-forwarded-proto": "https" })) }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/modules/portal/server", () => ({ portalRpc: vi.fn() }));
import { inviteEmployeeAction, assignRoleAction, createActivationLinkAction } from "./actions";
const branch = "11111111-1111-4111-8111-111111111111", role = "22222222-2222-4222-8222-222222222222";
function form(otherBranch = branch, delivery = "email") { const f = new FormData(); Object.entries({ email: "qa-invite@example.test", code: "QA_RBAC", name: "QA nhân viên", branchId: otherBranch, roleId: role, delivery }).forEach(([k,v]) => f.set(k,v)); return f; }
const newUser = "33333333-3333-4333-8333-333333333333";
beforeEach(() => {
 vi.clearAllMocks(); vi.stubEnv("SUPABASE_SECRET_KEY", "test-only-not-a-credential");
 m.access.mockResolvedValue({ branchId: branch, employeeId: "99999999-9999-4999-8999-999999999999", permissions: new Set(["roles.manage", "work.read", "work.claim", "dashboard.read"]) });
 const builder = { select: m.select, eq: m.eq, maybeSingle: m.role }; m.from.mockReturnValue(builder); m.select.mockReturnValue(builder); m.eq.mockReturnValue(builder);
 m.role.mockResolvedValue({ data: { id: role, role_permissions: [{ permission_code: "work.read" }, { permission_code: "dashboard.read" }] }, error: null });
 m.server.mockResolvedValue({ from: m.from, rpc: m.rpc }); m.rpc.mockResolvedValue({ error: null });
 m.admin.mockReturnValue({ auth: { admin: { inviteUserByEmail: m.invite, generateLink: m.generate, getUserById: m.getUser } } });
 m.invite.mockResolvedValue({ data: { user: { id: newUser } }, error: null });
 m.generate.mockResolvedValue({ data: { user: { id: newUser }, properties: { hashed_token: "hash-1" } }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
it("checks the active server role before sending an authorized worker invite", async () => {
 expect((await inviteEmployeeAction(undefined, form()))?.success).toBe(true);
 expect(m.access).toHaveBeenCalledWith("roles.manage"); expect(m.eq.mock.calls).toEqual([["id",role],["active",true]]);
 expect(m.invite).toHaveBeenCalledOnce(); expect(m.rpc).toHaveBeenCalledWith("register_invited_employee", expect.objectContaining({ target_branch_id: branch, target_role_id: role, change_reason: "Mời nhân viên" }));
 expect(m.role.mock.invocationCallOrder[0]).toBeLessThan(m.invite.mock.invocationCallOrder[0]);
});
it("sends the invite to the app's password setup page, not the Supabase default", async () => {
 await inviteEmployeeAction(undefined, form());
 expect(m.invite).toHaveBeenCalledWith("qa-invite@example.test", { redirectTo: "https://erp.example.test/recovery/confirm?surface=admin" });
 vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test/");
 await inviteEmployeeAction(undefined, form());
 expect(m.invite).toHaveBeenLastCalledWith("qa-invite@example.test", { redirectTo: "https://app.example.test/recovery/confirm?surface=admin" });
});
it("does not send an invitation for a forged cross-branch target", async () => {
 expect((await inviteEmployeeAction(undefined, form("44444444-4444-4444-8444-444444444444")))?.success).not.toBe(true); expect(m.server).not.toHaveBeenCalled(); expect(m.invite).not.toHaveBeenCalled();
});
it("does not send an invitation for a role exceeding the actor's permissions", async () => {
 m.role.mockResolvedValue({ data: { role_permissions: [{ permission_code: "finance.payment.post" }] }, error: null });
 expect((await inviteEmployeeAction(undefined, form()))?.success).not.toBe(true); expect(m.invite).not.toHaveBeenCalled(); expect(m.rpc).not.toHaveBeenCalled();
});
it.each([null, { error: { message: "role lookup unavailable" } }])("rejects missing/inactive or unreadable roles before external email (%j)", async (value) => {
 m.role.mockResolvedValue(value ? { data:null,...value } : { data:null,error:null });
 expect((await inviteEmployeeAction(undefined, form()))?.success).not.toBe(true); expect(m.invite).not.toHaveBeenCalled();
});
it("does not bypass a denied roles.manage check", async () => {
 m.access.mockRejectedValue(new Error("forbidden")); await expect(inviteEmployeeAction(undefined, form())).rejects.toThrow("forbidden"); expect(m.invite).not.toHaveBeenCalled();
});
it("does not report linkage success if the DB recheck rejects a changed role after email", async () => {
 m.rpc.mockResolvedValue({ error: { code: "42501" } }); const result=await inviteEmployeeAction(undefined,form()); expect(result?.success).not.toBe(true); expect(result?.message).toContain("chưa liên kết"); expect(m.invite).toHaveBeenCalledOnce();
});

it("forwards a stable role-assignment operation id for retry",async()=>{const f=form();f.set('employeeId','55555555-5555-4555-8555-555555555555');f.set('operationId','66666666-6666-4666-8666-666666666666');await assignRoleAction(undefined,f);await assignRoleAction(undefined,f);expect(m.rpc.mock.calls.map(c=>c[1].operation_id)).toEqual(['66666666-6666-4666-8666-666666666666','66666666-6666-4666-8666-666666666666']);expect(m.rpc.mock.calls[0][1].change_reason).toBe('Cập nhật quyền');});
it("rejects missing assignment operation ids and cross-branch intent without a mutation",async()=>{const f=form();f.set('employeeId','55555555-5555-4555-8555-555555555555');await assignRoleAction(undefined,f);expect(m.rpc).not.toHaveBeenCalled();f.set('operationId','66666666-6666-4666-8666-666666666666');f.set('branchId','44444444-4444-4444-8444-444444444444');await assignRoleAction(undefined,f);expect(m.rpc).not.toHaveBeenCalled();});

it("creates the account with a one-time activation link by default, without relying on email", async () => {
 const result = await inviteEmployeeAction(undefined, form(branch, "link"));
 expect(result?.success).toBe(true);
 expect(m.invite).not.toHaveBeenCalled();
 expect(m.generate).toHaveBeenCalledWith({ type: "invite", email: "qa-invite@example.test", options: { redirectTo: "https://erp.example.test/recovery/confirm?surface=admin" } });
 expect(result?.activationLink).toBe("https://erp.example.test/recovery/confirm?surface=admin&token_hash=hash-1&type=invite");
 expect(m.rpc).toHaveBeenCalledWith("register_invited_employee", expect.objectContaining({ invited_auth_user_id: newUser }));
});

it("falls back to an activation link when the invite email cannot be sent", async () => {
 m.invite.mockResolvedValue({ data: { user: null }, error: { message: "Email address not authorized", status: 400 } });
 const result = await inviteEmployeeAction(undefined, form());
 expect(result?.success).toBe(true);
 expect(result?.message).toContain("Không gửi được thư mời");
 expect(result?.activationLink).toContain("token_hash=hash-1&type=invite");
});

it("sends field staff (work-only roles) to the worker portal password page", async () => {
 m.role.mockResolvedValue({ data: { id: role, role_permissions: [{ permission_code: "work.read" }, { permission_code: "work.claim" }] }, error: null });
 const result = await inviteEmployeeAction(undefined, form(branch, "link"));
 expect(result?.activationLink).toBe("https://erp.example.test/recovery/confirm?surface=work&token_hash=hash-1&type=invite");
});

it("returns no link when the account cannot be created", async () => {
 m.generate.mockResolvedValue({ data: { user: null, properties: null }, error: { message: "already registered" } });
 const result = await inviteEmployeeAction(undefined, form(branch, "link"));
 expect(result?.success).not.toBe(true);
 expect(result?.activationLink).toBeUndefined();
 expect(m.rpc).not.toHaveBeenCalled();
});

describe("createActivationLinkAction", () => {
 const employee = "55555555-5555-4555-8555-555555555555", account = "66666666-6666-4666-8666-666666666666";
 const row = (overrides = {}) => ({ data: { id: employee, auth_user_id: account, active: true, employee_branch_access: [{ branch_id: branch, active: true, roles: { role_permissions: [{ permission_code: "work.read" }, { permission_code: "work.claim" }] } }], ...overrides }, error: null });
 const linkForm = (id = employee) => { const f = new FormData(); f.set("employeeId", id); return f; };
 beforeEach(() => {
  m.role.mockResolvedValue(row());
  m.getUser.mockResolvedValue({ data: { user: { id: account, email: "nv@example.test", email_confirmed_at: null } }, error: null });
  m.generate.mockResolvedValue({ data: { user: { id: account }, properties: { hashed_token: "hash-2" } }, error: null });
 });

 it("gives a not yet activated employee a fresh invite link", async () => {
  const result = await createActivationLinkAction(undefined, linkForm());
  expect(result?.success).toBe(true);
  expect(m.generate).toHaveBeenCalledWith(expect.objectContaining({ type: "invite", email: "nv@example.test" }));
  expect(result?.activationLink).toBe("https://erp.example.test/recovery/confirm?surface=work&token_hash=hash-2&type=invite");
 });

 it("gives a confirmed account a password link instead", async () => {
  m.getUser.mockResolvedValue({ data: { user: { id: account, email: "nv@example.test", email_confirmed_at: "2026-10-17T10:30:52Z" } }, error: null });
  const result = await createActivationLinkAction(undefined, linkForm());
  expect(m.generate).toHaveBeenCalledWith(expect.objectContaining({ type: "recovery" }));
  expect(result?.activationLink).toContain("type=recovery");
 });

 it("refuses the manager's own account, other branches and stronger roles", async () => {
  expect((await createActivationLinkAction(undefined, linkForm("99999999-9999-4999-8999-999999999999")))?.success).not.toBe(true);
  m.role.mockResolvedValue(row({ employee_branch_access: [{ branch_id: "44444444-4444-4444-8444-444444444444", active: true, roles: null }] }));
  expect((await createActivationLinkAction(undefined, linkForm()))?.success).not.toBe(true);
  m.role.mockResolvedValue(row({ employee_branch_access: [{ branch_id: branch, active: true, roles: { role_permissions: [{ permission_code: "finance.payment.post" }] } }] }));
  expect((await createActivationLinkAction(undefined, linkForm()))?.success).not.toBe(true);
  expect(m.generate).not.toHaveBeenCalled();
 });

 it("does not hand out a link that belongs to another account", async () => {
  m.generate.mockResolvedValue({ data: { user: { id: newUser }, properties: { hashed_token: "hash-3" } }, error: null });
  const result = await createActivationLinkAction(undefined, linkForm());
  expect(result?.success).not.toBe(true);
  expect(result?.activationLink).toBeUndefined();
 });
});

it("invites field staff by phone number with an activation link only (nothing is mailed to the phone login)", async () => {
 const f = form(branch, "email"); f.set("email", "0987 654 321");
 const result = await inviteEmployeeAction(undefined, f);
 expect(result?.success).toBe(true); expect(result?.activationLink).toBeTruthy();
 expect(m.invite).not.toHaveBeenCalled();
 expect(m.generate).toHaveBeenCalledWith(expect.objectContaining({ type: "invite", email: "0987654321@sdt.hienxavlxd.com" }));
 f.set("email", "123"); expect((await inviteEmployeeAction(undefined, f))?.message).toContain("số điện thoại chưa đúng");
});
