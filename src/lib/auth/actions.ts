"use server";

import { revalidatePath } from "next/cache";
import { accountPortals, wrongPortalMessage } from "./account-portals";
import { deterministicUuid, portalRpc } from "@/modules/portal/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { requireInternalPermission } from "@/lib/access/context";
import { reasonOrDefault } from "@/lib/core/reason";
import { activationUrl, appOrigin, passwordSetupUrl } from "@/lib/auth/app-origin";
import { displayLogin, isPhoneLogin, loginEmail, normalizePhone } from "@/lib/auth/login-identifier";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

export type AuthFormState = { message?: string; success?: boolean } | undefined;

const loginSchema = z.object({
  // C1: "Email hoặc số điện thoại".
  email: z.string().trim().min(3).max(200).transform((value, context) => {
    const email = loginEmail(value);
    if (!email) { context.addIssue({ code: "custom", message: "invalid_login" }); return z.NEVER; }
    return email;
  }),
  password: z.string().min(8).max(200),
  surface: z.enum(["admin", "work", "customer"]),
});

const recoverySchema = z.object({
  email: z.email().trim(),
  surface: z.enum(["admin", "work", "customer"]),
});

export async function loginAction(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    surface: formData.get("surface"),
  });
  if (!parsed.success) return { message: "Nhập email hoặc số điện thoại và mật khẩu (ít nhất 8 ký tự)." };

  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    if (error) return { message: "Không thể đăng nhập với thông tin đã cung cấp." };
    if (parsed.data.surface === "customer" && data.user) await completePortalRegistration(supabase, data.user);
    // FB9: each account signs in only on its own tab; a worker or a customer never enters the operations side.
    const wrongPortal = data.user ? wrongPortalMessage(parsed.data.surface, await accountPortals(supabase, data.user.id)) : null;
    if (wrongPortal) {
      await supabase.auth.signOut();
      return { message: wrongPortal };
    }
  } catch {
    return { message: "Dịch vụ đăng nhập chưa sẵn sàng. Vui lòng thử lại sau." };
  }
  redirect(parsed.data.surface === "customer" ? "/customer" : "/");
}

export async function recoveryAction(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (normalizePhone(String(formData.get("email") ?? ""))) {
    return { message: "Tài khoản đăng nhập bằng số điện thoại không nhận được email. Nhờ quản lý cửa hàng đặt lại mật khẩu cho bạn." };
  }
  const parsed = recoverySchema.safeParse({ email: formData.get("email"), surface: formData.get("surface") });
  if (!parsed.success) return { message: "Vui lòng nhập địa chỉ thư điện tử hợp lệ." };
  try {
    const supabase = await createServerSupabase();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: await passwordSetupUrl(parsed.data.surface) });
  } catch {
    return { message: "Không thể gửi yêu cầu lúc này. Vui lòng thử lại sau." };
  }
  return { success: true, message: "Nếu tài khoản hợp lệ, hướng dẫn khôi phục sẽ được gửi." };
}

const selectBranchSchema = z.object({
  branchId: z.guid(),
  surface: z.enum(["admin", "work"]),
});

export async function selectBranchAction(formData: FormData) {
  const parsed = selectBranchSchema.safeParse({ branchId: formData.get("branchId"), surface: formData.get("surface") });
  if (!parsed.success) redirect("/select-branch");
  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(parsed.data.surface === "work" ? "/work/login" : "/login");
  const { data: employee } = await supabase.from("employees").select("id").eq("auth_user_id", authData.user.id).eq("active", true).single();
  if (!employee) redirect(parsed.data.surface === "work" ? "/work/login" : "/login");
  const { data: access } = await supabase.from("employee_branch_access").select("id").eq("employee_id", employee.id).eq("branch_id", parsed.data.branchId).eq("active", true).maybeSingle();
  if (!access) redirect("/select-branch");
  (await cookies()).set("hx_branch_id", parsed.data.branchId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect("/");
}

const assignRoleSchema = z.object({
  employeeId: z.guid(),
  branchId: z.guid(),
  roleId: z.guid(),
  reason: z.string().trim().max(500).nullish(),
  operationId: z.guid(),
});

export async function assignRoleAction(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = assignRoleSchema.safeParse({ employeeId: formData.get("employeeId"), branchId: formData.get("branchId"), roleId: formData.get("roleId"), reason: formData.get("reason"), operationId: formData.get("operationId") });
  if (!parsed.success) return { message: "Thông tin phân quyền chưa hợp lệ." };
  const actor = await requireInternalPermission("roles.manage");
  if (parsed.data.branchId !== actor.branchId) return { message: "Chỉ cấp vai trò tại chi nhánh đang quản lý." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("assign_employee_role", {
    target_employee_id: parsed.data.employeeId,
    target_branch_id: parsed.data.branchId,
    target_role_id: parsed.data.roleId,
    change_reason: reasonOrDefault(parsed.data.reason, "Cập nhật quyền"),
    operation_id: parsed.data.operationId,
  });
  if (error) return { message: "Không thể cập nhật vai trò. Không có thay đổi nào được xác nhận." };
  revalidatePath("/admin/access");
  return { success: true, message: "Đã cập nhật vai trò và ghi nhật ký." };
}

const inviteSchema = z.object({
  // C1: field staff without email get a phone login; the activation link is then the only way (nothing is mailed).
  email: z.string().trim().max(200).transform((value, context) => {
    const email = loginEmail(value);
    if (!email) { context.addIssue({ code: "custom", message: "invalid_login" }); return z.NEVER; }
    return email;
  }),
  code: z.string().trim().regex(/^[A-Z0-9_-]{2,24}$/),
  name: z.string().trim().min(2).max(120),
  branchId: z.guid(),
  roleId: z.guid(),
  reason: z.string().trim().max(500).nullish(),
  delivery: z.enum(["link", "email"]).default("link"),
});

/** Result of an invite or a new activation link: the link is shown once to the manager, who sends it to the employee. */
export type ActivationFormState = (NonNullable<AuthFormState> & { activationLink?: string }) | undefined;

type RolePermissions = { role_permissions: { permission_code: string }[] };
type AuthAdmin = ReturnType<typeof createClient>["auth"]["admin"];

function authAdminClient(): AuthAdmin | null {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) return null;
  return createClient(getSupabaseConfig().url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } }).auth.admin;
}

/** Field staff (only work.* permissions) set their password on the worker portal; everyone else on the admin login. */
function setupSurface(role: RolePermissions | null | undefined): "admin" | "work" {
  const codes = role?.role_permissions.map((permission) => permission.permission_code) ?? [];
  return codes.length > 0 && codes.every((code) => code.startsWith("work.")) ? "work" : "admin";
}

/**
 * One-time activation link for `email` that opens the app's password page. A new or not yet confirmed account gets an
 * invite link (creating the account if needed); a confirmed one gets a password link. Each new link replaces the last.
 */
async function generateActivationLink(admin: AuthAdmin, email: string, surface: "admin" | "work", confirmed: boolean) {
  const type = confirmed ? "recovery" : "invite";
  const { data, error } = await admin.generateLink({ type, email, options: { redirectTo: await passwordSetupUrl(surface) } });
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed || !data.user) return null;
  return { userId: data.user.id, link: await activationUrl(surface, hashed, type) };
}

export async function inviteEmployeeAction(_: ActivationFormState, formData: FormData): Promise<ActivationFormState> {
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"), code: formData.get("code"), name: formData.get("name"),
    branchId: formData.get("branchId"), roleId: formData.get("roleId"), reason: formData.get("reason"),
    delivery: formData.get("delivery") ?? undefined,
  });
  if (!parsed.success) return { message: parsed.error.issues.some((issue) => issue.path[0] === "email")
    ? "Email hoặc số điện thoại chưa đúng (ví dụ 0912345678)." : "Thông tin lời mời chưa hợp lệ." };
  const actor = await requireInternalPermission("roles.manage");
  if (parsed.data.branchId !== actor.branchId) return { message: "Chỉ mời nhân viên vào chi nhánh đang quản lý." };
  const supabase = await createServerSupabase();
  const { data: role, error: roleError } = await supabase.from("roles")
    .select("id, role_permissions(permission_code)").eq("id", parsed.data.roleId).eq("active", true).maybeSingle();
  if (roleError || !role) return { message: "Vai trò không còn khả dụng. Tải lại danh sách trước khi mời." };
  if (role.role_permissions.some((permission) => !actor.permissions.has(permission.permission_code))) {
    return { message: "Không thể cấp vai trò có quyền vượt phạm vi của bạn." };
  }

  const admin = authAdminClient();
  if (!admin) return { message: "Dịch vụ mời nhân viên chưa được cấu hình. Vui lòng liên hệ quản trị viên." };
  const surface = setupSurface(role);
  let userId: string | null = null;
  let activationLink: string | undefined;
  let emailFailed = false;
  if (parsed.data.delivery === "email" && !isPhoneLogin(parsed.data.email)) {
    // The invite email must land on the page that lets the new employee choose a password.
    const { data: invite, error: inviteError } = await admin.inviteUserByEmail(parsed.data.email, { redirectTo: await passwordSetupUrl(surface) });
    if (!inviteError && invite.user) userId = invite.user.id;
    else emailFailed = true;
  }
  if (!userId) {
    // Default, and the fallback when the email cannot be sent (e.g. the project's built-in mailer only reaches its own team).
    const generated = await generateActivationLink(admin, parsed.data.email, surface, false);
    if (!generated) return { message: "Không tạo được tài khoản cho email này. Nếu email đã có tài khoản, dùng nút \"Link kích hoạt\" ở dòng nhân viên." };
    userId = generated.userId;
    activationLink = generated.link;
  }

  const { error: registerError } = await supabase.rpc("register_invited_employee", {
    invited_auth_user_id: userId,
    employee_code: parsed.data.code,
    employee_name: parsed.data.name,
    target_branch_id: parsed.data.branchId,
    target_role_id: parsed.data.roleId,
    change_reason: reasonOrDefault(parsed.data.reason, "Mời nhân viên"),
    operation_id: randomUUID(),
  });
  if (registerError) return { message: "Tài khoản có thể đã tạo nhưng hồ sơ chưa liên kết. Hãy nhờ quản trị viên kiểm tra trước khi mời lại." };
  revalidatePath("/admin/access");
  if (!activationLink) return { success: true, message: "Đã gửi thư mời và tạo hồ sơ nhân viên." };
  return { success: true, activationLink, message: emailFailed
    ? "Không gửi được thư mời nên đã tạo link kích hoạt. Gửi link này cho nhân viên qua Zalo hoặc tin nhắn."
    : "Đã tạo hồ sơ nhân viên. Gửi link kích hoạt dưới đây cho nhân viên qua Zalo hoặc tin nhắn." };
}

/** New activation link for an employee who has not set a password yet, or who lost it. Replaces any earlier link. */
export async function createActivationLinkAction(_: ActivationFormState, formData: FormData): Promise<ActivationFormState> {
  const employeeId = z.guid().safeParse(formData.get("employeeId"));
  if (!employeeId.success) return { message: "Không xác định được nhân viên." };
  const actor = await requireInternalPermission("roles.manage");
  if (employeeId.data === actor.employeeId) return { message: "Không tạo link kích hoạt cho chính mình. Dùng \"Quên mật khẩu\" ở trang đăng nhập." };
  const supabase = await createServerSupabase();
  const { data: employee, error } = await supabase.from("employees")
    .select("id, auth_user_id, active, employee_branch_access(branch_id, active, roles(role_permissions(permission_code)))")
    .eq("id", employeeId.data).maybeSingle();
  if (error || !employee) return { message: "Không tìm thấy nhân viên trong phạm vi bạn được quản lý." };
  const access = employee.employee_branch_access.find((row) => row.branch_id === actor.branchId && row.active);
  if (!employee.active || !access) return { message: "Nhân viên chưa có quyền đang hiệu lực tại chi nhánh này." };
  const linked = access.roles as unknown as RolePermissions | RolePermissions[] | null;
  const role = Array.isArray(linked) ? linked[0] ?? null : linked;
  if (role?.role_permissions.some((permission) => !actor.permissions.has(permission.permission_code))) {
    return { message: "Không thể tạo link cho tài khoản có quyền vượt phạm vi của bạn." };
  }

  const admin = authAdminClient();
  if (!admin) return { message: "Dịch vụ tài khoản chưa được cấu hình. Vui lòng liên hệ quản trị viên." };
  const { data: account, error: accountError } = await admin.getUserById(employee.auth_user_id);
  if (accountError || !account.user?.email) return { message: "Không đọc được tài khoản đăng nhập của nhân viên. Thử lại sau." };
  const generated = await generateActivationLink(admin, account.user.email, setupSurface(role), Boolean(account.user.email_confirmed_at));
  if (!generated || generated.userId !== employee.auth_user_id) return { message: "Không tạo được link kích hoạt. Thử lại sau." };
  return { success: true, activationLink: generated.link,
    message: "Đã tạo link mới; link cũ (nếu có) không dùng được nữa. Gửi link này cho nhân viên qua Zalo hoặc tin nhắn." };
}

export async function revokeAccessAction(_: AuthFormState, form: FormData): Promise<AuthFormState> {
 const parsed=z.object({accessId:z.guid(),reason:z.string().trim().max(500).optional(),confirmed:z.literal('on')}).safeParse(Object.fromEntries(form));
 if(!parsed.success) return {message:'Đánh dấu xác nhận để thu hồi quyền.'};
 await requireInternalPermission('roles.manage');
 try {await portalRpc(await createServerSupabase(),'revoke_employee_access',{target_access_id:parsed.data.accessId,change_reason:reasonOrDefault(parsed.data.reason,'Thu hồi quyền'),operation_id:randomUUID()});}
 catch {return {message:'Không thể thu hồi. Không được tự thu hồi quyền hoặc thao tác ngoài phạm vi.'};}
 revalidatePath('/admin/access');
 return {success:true,message:'Đã thu hồi quyền tại chi nhánh và ghi nhật ký.'};
}

export async function reactivateAccessAction(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = z.object({ accessId: z.guid(), reason: z.string().trim().max(500).optional(), confirmed: z.literal("on") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Đánh dấu xác nhận để kích hoạt lại quyền." };
  await requireInternalPermission("roles.manage");
  try {
    await portalRpc(await createServerSupabase(), "reactivate_employee_access", {
      target_access_id: parsed.data.accessId,
      change_reason: reasonOrDefault(parsed.data.reason, "Kích hoạt lại quyền"),
      operation_id: randomUUID(),
    });
  } catch {
    return { message: "Không thể kích hoạt lại. Kiểm tra phạm vi, vai trò và quyền hiện tại." };
  }
  revalidatePath("/admin/access");
  return { success: true, message: "Đã kích hoạt lại quyền tại chi nhánh và ghi nhật ký." };
}

/**
 * FB12 (D34e) "Xóa nhân viên": a person with no history is deleted together with the sign-in account; anyone with history is
 * set to "Ngừng làm việc" (sign-in blocked, every branch access revoked, name kept on old documents).
 */
export async function removeEmployeeAction(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = z.object({ employeeId: z.guid(), confirmed: z.literal("on") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Đánh dấu xác nhận để xóa nhân viên." };
  await requireInternalPermission("roles.manage");
  let outcome: { result?: string; auth_user_id?: string } | null;
  try {
    outcome = await portalRpc(await createServerSupabase(), "remove_employee", { target_employee_id: parsed.data.employeeId, operation_id: randomUUID() });
  } catch {
    return { message: "Không thể xóa. Không xóa được chính mình hoặc người quản lý vai trò, hoặc nhân viên ngoài chi nhánh bạn quản lý." };
  }
  revalidatePath("/admin/access");
  if (outcome?.result !== "DELETED") {
    return { success: true, message: "Nhân viên đã có chứng từ nên không xóa hẳn: đã chuyển sang Ngừng làm việc (khóa đăng nhập, ẩn khỏi danh sách chọn). Bấm “Dùng lại” khi cần." };
  }
  const admin = authAdminClient();
  if (admin && outcome.auth_user_id) await admin.deleteUser(outcome.auth_user_id).catch(() => null);
  return { success: true, message: "Đã xóa nhân viên và tài khoản đăng nhập." };
}

export async function restoreEmployeeAction(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = z.object({ employeeId: z.guid() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Không xác định được nhân viên." };
  await requireInternalPermission("roles.manage");
  try {
    await portalRpc(await createServerSupabase(), "restore_employee", { target_employee_id: parsed.data.employeeId, operation_id: randomUUID() });
  } catch {
    return { message: "Không thể dùng lại nhân viên này. Kiểm tra chi nhánh bạn quản lý." };
  }
  revalidatePath("/admin/access");
  return { success: true, message: "Nhân viên đã làm việc lại với quyền trước đó." };
}

export async function setExplicitPermissionsAction(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = z.object({
    employeeId: z.guid(),
    branchId: z.guid(),
    permissionCodes: z.array(z.string().regex(/^[a-z][a-z0-9_.]{2,79}$/)).max(100),
    reason: z.string().trim().max(500).nullish(),
  }).safeParse({
    employeeId: form.get("employeeId"),
    branchId: form.get("branchId"),
    permissionCodes: form.getAll("permissionCode"),
    reason: form.get("reason"),
  });
  if (!parsed.success) return { message: "Danh sách quyền chưa hợp lệ." };
  await requireInternalPermission("roles.manage");
  try {
    await portalRpc(await createServerSupabase(), "set_employee_explicit_permissions", {
      target_employee_id: parsed.data.employeeId,
      target_branch_id: parsed.data.branchId,
      permission_codes: [...new Set(parsed.data.permissionCodes)],
      change_reason: reasonOrDefault(parsed.data.reason, "Cập nhật quyền"),
      operation_id: randomUUID(),
    });
  } catch {
    return { message: "Không thể cập nhật quyền tường minh. Không được cấp vượt phạm vi của bạn." };
  }
  revalidatePath("/admin/access");
  return { success: true, message: "Đã cập nhật quyền tường minh và ghi nhật ký." };
}


// ---- D14 customer portal accounts (the secret key stays in this module) -------------------------------------------------

export type PortalAccountState = { message?: string; success?: boolean; shareText?: string } | undefined;
const portalAccountSchema = z.object({
  customerId: z.guid(),
  login: z.string().trim().min(3).max(200),
  password: z.string().min(8).max(72),
  role: z.enum(["OWNER", "FINANCE_CONTACT", "RECEIVER"]),
});

/** Text the owner sends the customer (Zalo/SMS) with the sign-in page, the sign-in name and the temporary password. */
async function portalShareText(login: string, password: string) {
  return `Tài khoản đặt hàng & theo dõi đơn: ${await appOrigin()}/customer/login\nĐăng nhập: ${displayLogin(login)}\nMật khẩu tạm: ${password}\nLần đầu đăng nhập sẽ được yêu cầu đổi mật khẩu.`;
}

/**
 * "Tạo tài khoản cổng khách" on the customer page: a login with the email or phone the owner typed and a temporary password
 * (changed at first sign-in), linked to this customer. No email is sent.
 */
export async function createCustomerPortalAccountAction(_: PortalAccountState, formData: FormData): Promise<PortalAccountState> {
  const parsed = portalAccountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: "Nhập email hoặc số điện thoại và mật khẩu tạm từ 8 ký tự." };
  const email = loginEmail(parsed.data.login);
  if (!email) return { message: "Email hoặc số điện thoại chưa đúng (ví dụ 0912345678)." };
  const actor = await requireInternalPermission("customers.manage");
  const supabase = await createServerSupabase();
  const { data: customer } = await supabase.from("customers").select("id").eq("id", parsed.data.customerId).eq("branch_id", actor.branchId).maybeSingle();
  if (!customer) return { message: "Không tìm thấy khách hàng trong chi nhánh đang quản lý." };
  const admin = authAdminClient();
  if (!admin) return { message: "Dịch vụ tài khoản chưa được cấu hình. Vui lòng liên hệ quản trị viên." };
  const { data: created, error: createError } = await admin.createUser({ email, password: parsed.data.password, email_confirm: true,
    app_metadata: { hx_must_change_password: true }, user_metadata: { hx_portal: "customer" } });
  if (createError || !created.user) {
    return { message: /already|registered|exists/i.test(createError?.message ?? "") ? "Email hoặc số điện thoại này đã có tài khoản. Dùng thông tin khác." : "Không tạo được tài khoản. Thử lại sau." };
  }
  const { error: grantError } = await supabase.rpc("grant_customer_portal_access", { target_customer_id: customer.id, target_auth_user_id: created.user.id,
    membership_role: parsed.data.role, operation_id: randomUUID() });
  if (grantError) {
    await admin.deleteUser(created.user.id).catch(() => undefined);
    return { message: "Không gắn được tài khoản vào khách hàng; tài khoản vừa tạo đã được hủy. Thử lại sau." };
  }
  revalidatePath(`/admin/customers/${customer.id}`);
  return { success: true, message: "Đã tạo tài khoản cổng khách. Gửi thông tin dưới đây cho khách qua Zalo.", shareText: await portalShareText(email, parsed.data.password) };
}

/** "Đặt lại mật khẩu" for a customer login of this customer: a new temporary password, changed at the next sign-in. */
export async function resetCustomerPortalPasswordAction(_: PortalAccountState, formData: FormData): Promise<PortalAccountState> {
  const parsed = z.object({ customerId: z.guid(), membershipId: z.guid(), password: z.string().min(8).max(72) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: "Mật khẩu tạm từ 8 ký tự." };
  await requireInternalPermission("customers.manage");
  const supabase = await createServerSupabase();
  const { data: accounts, error } = await supabase.rpc("customer_portal_accounts", { target_customer_id: parsed.data.customerId });
  const account = ((accounts ?? []) as { membership_id: string; auth_user_id: string; email: string; active: boolean }[])
    .find((row) => row.membership_id === parsed.data.membershipId && row.active);
  if (error || !account) return { message: "Không tìm thấy tài khoản đang hoạt động của khách này." };
  const admin = authAdminClient();
  if (!admin) return { message: "Dịch vụ tài khoản chưa được cấu hình. Vui lòng liên hệ quản trị viên." };
  const { error: updateError } = await admin.updateUserById(account.auth_user_id, { password: parsed.data.password, app_metadata: { hx_must_change_password: true } });
  if (updateError) return { message: "Không đặt lại được mật khẩu. Thử lại sau." };
  revalidatePath(`/admin/customers/${parsed.data.customerId}`);
  return { success: true, message: "Đã đặt mật khẩu tạm mới. Gửi cho khách qua Zalo.", shareText: await portalShareText(account.email, parsed.data.password) };
}

/** First sign-in with a temporary password (customer or field staff): choose a new one, then continue. */
export async function changeOwnPasswordAction(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = z.object({ password: z.string().min(8).max(72), confirm: z.string(), surface: z.enum(["customer", "work", "admin"]) })
    .refine((value) => value.password === value.confirm).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: "Mật khẩu mới từ 8 ký tự và nhập lại phải giống nhau." };
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(parsed.data.surface === "customer" ? "/customer/login" : parsed.data.surface === "work" ? "/work/login" : "/login");
  const admin = authAdminClient();
  if (!admin) return { message: "Dịch vụ tài khoản chưa được cấu hình. Vui lòng liên hệ quản trị viên." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { message: /same|different/i.test(error.message) ? "Chọn mật khẩu khác mật khẩu tạm." : "Không đổi được mật khẩu. Thử lại sau." };
  const { error: flagError } = await admin.updateUserById(auth.user.id, { app_metadata: { hx_must_change_password: false } });
  if (flagError) return { message: "Đã đổi mật khẩu nhưng chưa mở được cổng. Đăng xuất rồi đăng nhập lại bằng mật khẩu mới." };
  await supabase.auth.refreshSession().catch(() => undefined);
  redirect(parsed.data.surface === "customer" ? "/customer?notice=password-changed" : parsed.data.surface === "work" ? "/work?notice=password-changed" : "/");
}

type PendingRegistration = { name: string; phone: string; address: string };
const pendingRegistrationSchema = z.object({ name: z.string(), phone: z.string(), address: z.string() });

/** One registration per login: the same operation id every time, so a later sign-in only replays the first one. */
const registrationOperationId = (userId: string) => deterministicUuid(`register_portal_customer:${userId}`);

async function registerPortalCustomer(supabase: Awaited<ReturnType<typeof createServerSupabase>>, userId: string, registration: PendingRegistration) {
  const { error } = await supabase.rpc("register_portal_customer", { display_name: registration.name, phone: registration.phone,
    address_text: registration.address, operation_id: registrationOperationId(userId) });
  return error;
}

/**
 * A customer who registered and had to confirm the email first: the customer record is made at the first sign-in from the
 * details kept on the login. Already registered (replay), an employee login or no pending details → nothing to do.
 */
async function completePortalRegistration(supabase: Awaited<ReturnType<typeof createServerSupabase>>, user: { id: string; user_metadata?: Record<string, unknown> }) {
  const registration = pendingRegistrationSchema.safeParse(user.user_metadata?.hx_registration);
  if (!registration.success) return;
  await registerPortalCustomer(supabase, user.id, registration.data).catch(() => undefined);
}

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(160), phone: z.string().trim().min(8).max(20), address: z.string().trim().min(5).max(300),
  email: z.email().trim().max(200), password: z.string().min(8).max(72), confirm: z.string(),
}).refine((value) => value.password === value.confirm);

/**
 * D14 self-registration: the login is created with the customer's details kept on it; the customer record, main address and
 * access are made by register_portal_customer as soon as the login is signed in (now, or after confirming the email).
 */
export async function registerCustomerAccountAction(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = registrationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: "Kiểm tra lại: tên, số điện thoại, địa chỉ giao hàng, email và mật khẩu từ 8 ký tự (nhập lại giống nhau)." };
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { message: "Số điện thoại chưa đúng (ví dụ 0912345678)." };
  const supabase = await createServerSupabase();
  const registration = { name: parsed.data.name, phone, address: parsed.data.address };
  const { data, error } = await supabase.auth.signUp({ email: parsed.data.email.toLowerCase(), password: parsed.data.password,
    options: { data: { hx_registration: registration }, emailRedirectTo: `${await appOrigin()}/customer/login?confirmed=1` } });
  if (error) {
    if (/not allowed|disabled/i.test(error.message)) return { message: "Cửa hàng chưa mở tự đăng ký. Liên hệ cửa hàng để được tạo tài khoản." };
    if (/already|registered|exists/i.test(error.message)) return { message: "Email này đã có tài khoản. Đăng nhập hoặc dùng “Quên mật khẩu”." };
    return { message: "Chưa đăng ký được. Thử lại sau." };
  }
  if (!data.session || !data.user) return { success: true, message: "Đã tạo tài khoản. Mở email xác nhận rồi đăng nhập để bắt đầu đặt hàng." };
  const registerError = await registerPortalCustomer(supabase, data.user.id, registration);
  if (registerError?.message.includes("portal_branch_not_configured")) return { message: "Cửa hàng chưa mở tự đăng ký. Liên hệ cửa hàng để được tạo tài khoản." };
  if (registerError) return { message: "Đã tạo tài khoản nhưng chưa lập được hồ sơ khách. Đăng nhập lại để hoàn tất, hoặc liên hệ cửa hàng." };
  redirect("/customer?notice=registered");
}
