"use server";

import { revalidatePath } from "next/cache";
import { portalRpc } from "@/modules/portal/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { requireInternalPermission } from "@/lib/access/context";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

export type AuthFormState = { message?: string; success?: boolean } | undefined;

const loginSchema = z.object({
  email: z.email().trim(),
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
  if (!parsed.success) return { message: "Thông tin đăng nhập chưa hợp lệ." };

  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    if (error) return { message: "Không thể đăng nhập với thông tin đã cung cấp." };
  } catch {
    return { message: "Dịch vụ đăng nhập chưa sẵn sàng. Vui lòng thử lại sau." };
  }
  redirect(parsed.data.surface === "customer" ? "/customer" : "/");
}

export async function recoveryAction(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = recoverySchema.safeParse({ email: formData.get("email"), surface: formData.get("surface") });
  if (!parsed.success) return { message: "Vui lòng nhập địa chỉ thư điện tử hợp lệ." };
  try {
    const supabase = await createServerSupabase();
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const redirectTo = new URL("/recovery/confirm", origin);
    redirectTo.searchParams.set("surface", parsed.data.surface);
    await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: redirectTo.toString() });
  } catch {
    return { message: "Không thể gửi yêu cầu lúc này. Vui lòng thử lại sau." };
  }
  return { success: true, message: "Nếu tài khoản hợp lệ, hướng dẫn khôi phục sẽ được gửi." };
}

const selectBranchSchema = z.object({
  branchId: z.uuid(),
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
  employeeId: z.uuid(),
  branchId: z.uuid(),
  roleId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
  operationId: z.uuid(),
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
    change_reason: parsed.data.reason,
    operation_id: parsed.data.operationId,
  });
  if (error) return { message: "Không thể cập nhật vai trò. Không có thay đổi nào được xác nhận." };
  revalidatePath("/admin/access");
  return { success: true, message: "Đã cập nhật vai trò và ghi nhật ký." };
}

const inviteSchema = z.object({
  email: z.email().trim(),
  code: z.string().trim().regex(/^[A-Z0-9_-]{2,24}$/),
  name: z.string().trim().min(2).max(120),
  branchId: z.uuid(),
  roleId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
});

export async function inviteEmployeeAction(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"), code: formData.get("code"), name: formData.get("name"),
    branchId: formData.get("branchId"), roleId: formData.get("roleId"), reason: formData.get("reason"),
  });
  if (!parsed.success) return { message: "Thông tin lời mời chưa hợp lệ." };
  const actor = await requireInternalPermission("roles.manage");
  if (parsed.data.branchId !== actor.branchId) return { message: "Chỉ mời nhân viên vào chi nhánh đang quản lý." };
  const supabase = await createServerSupabase();
  const { data: role, error: roleError } = await supabase.from("roles")
    .select("id, role_permissions(permission_code)").eq("id", parsed.data.roleId).eq("active", true).maybeSingle();
  if (roleError || !role) return { message: "Vai trò không còn khả dụng. Tải lại danh sách trước khi mời." };
  if (role.role_permissions.some((permission) => !actor.permissions.has(permission.permission_code))) {
    return { message: "Không thể cấp vai trò có quyền vượt phạm vi của bạn." };
  }


  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) return { message: "Dịch vụ mời nhân viên chưa được cấu hình. Vui lòng liên hệ quản trị viên." };
  const { url } = getSupabaseConfig();
  const authAdmin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: invite, error: inviteError } = await authAdmin.auth.admin.inviteUserByEmail(parsed.data.email);
  if (inviteError || !invite.user) return { message: "Không thể gửi lời mời. Vui lòng liên hệ quản trị viên để kiểm tra tài khoản." };

  const { error: registerError } = await supabase.rpc("register_invited_employee", {
    invited_auth_user_id: invite.user.id,
    employee_code: parsed.data.code,
    employee_name: parsed.data.name,
    target_branch_id: parsed.data.branchId,
    target_role_id: parsed.data.roleId,
    change_reason: parsed.data.reason,
    operation_id: randomUUID(),
  });
  if (registerError) return { message: "Lời mời có thể đã gửi nhưng hồ sơ chưa liên kết. Hãy nhờ quản trị viên kiểm tra trước khi gửi lại." };
  revalidatePath("/admin/access");
  return { success: true, message: "Đã gửi lời mời và tạo hồ sơ nhân viên." };
}

export async function revokeAccessAction(_: AuthFormState, form: FormData): Promise<AuthFormState> {
 const parsed=z.object({accessId:z.uuid(),reason:z.string().trim().min(3).max(500),confirmed:z.literal('on')}).safeParse(Object.fromEntries(form));
 if(!parsed.success) return {message:'Nhập lý do và xác nhận thu hồi quyền.'};
 await requireInternalPermission('roles.manage');
 try {await portalRpc(await createServerSupabase(),'revoke_employee_access',{target_access_id:parsed.data.accessId,change_reason:parsed.data.reason,operation_id:randomUUID()});}
 catch {return {message:'Không thể thu hồi. Không được tự thu hồi quyền hoặc thao tác ngoài phạm vi.'};}
 revalidatePath('/admin/access');
 return {success:true,message:'Đã thu hồi quyền tại chi nhánh và ghi nhật ký.'};
}

export async function reactivateAccessAction(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = z.object({ accessId: z.uuid(), reason: z.string().trim().min(3).max(500), confirmed: z.literal("on") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Nhập lý do và xác nhận kích hoạt lại quyền." };
  await requireInternalPermission("roles.manage");
  try {
    await portalRpc(await createServerSupabase(), "reactivate_employee_access", {
      target_access_id: parsed.data.accessId,
      change_reason: parsed.data.reason,
      operation_id: randomUUID(),
    });
  } catch {
    return { message: "Không thể kích hoạt lại. Kiểm tra phạm vi, vai trò và quyền hiện tại." };
  }
  revalidatePath("/admin/access");
  return { success: true, message: "Đã kích hoạt lại quyền tại chi nhánh và ghi nhật ký." };
}

export async function setExplicitPermissionsAction(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = z.object({
    employeeId: z.uuid(),
    branchId: z.uuid(),
    permissionCodes: z.array(z.string().regex(/^[a-z][a-z0-9_.]{2,79}$/)).max(100),
    reason: z.string().trim().min(3).max(500),
  }).safeParse({
    employeeId: form.get("employeeId"),
    branchId: form.get("branchId"),
    permissionCodes: form.getAll("permissionCode"),
    reason: form.get("reason"),
  });
  if (!parsed.success) return { message: "Danh sách quyền hoặc lý do chưa hợp lệ." };
  await requireInternalPermission("roles.manage");
  try {
    await portalRpc(await createServerSupabase(), "set_employee_explicit_permissions", {
      target_employee_id: parsed.data.employeeId,
      target_branch_id: parsed.data.branchId,
      permission_codes: [...new Set(parsed.data.permissionCodes)],
      change_reason: parsed.data.reason,
      operation_id: randomUUID(),
    });
  } catch {
    return { message: "Không thể cập nhật quyền tường minh. Không được cấp vượt phạm vi của bạn." };
  }
  revalidatePath("/admin/access");
  return { success: true, message: "Đã cập nhật quyền tường minh và ghi nhật ký." };
}
