import type { createServerSupabase } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;
export type LoginSurface = "admin" | "work" | "customer";
export type AccountPortals = { admin: boolean; work: boolean; customer: boolean };

/** Permissions that only open the worker portal; any other permission opens the operations side. */
const WORKER_ONLY = new Set(["work.read", "work.claim"]);

/**
 * FB9: which sign-in tabs an account belongs to, read with its own session (each reader is limited to the caller's own
 * rows): staff with any operations permission → Vận hành; staff who may read jobs → Thợ & tài xế; an active customer
 * membership → Khách hàng. A worker or a customer cannot enter through Vận hành.
 */
export async function accountPortals(supabase: Supabase, userId: string): Promise<AccountPortals> {
  const [{ data: employee }, { data: memberships }] = await Promise.all([
    supabase.from("employees").select("id").eq("auth_user_id", userId).eq("active", true).maybeSingle(),
    supabase.from("customer_portal_memberships").select("id").eq("auth_user_id", userId).eq("active", true).limit(1),
  ]);
  const permissions = new Set<string>();
  if (employee) {
    const [{ data: access }, { data: grants }] = await Promise.all([
      supabase.from("employee_branch_access").select("roles(role_permissions(permission_code))").eq("employee_id", employee.id).eq("active", true),
      supabase.from("employee_permission_grants").select("permission_code").eq("employee_id", employee.id),
    ]);
    for (const row of (access ?? []) as { roles: { role_permissions: { permission_code: string }[] } | { role_permissions: { permission_code: string }[] }[] | null }[]) {
      for (const role of Array.isArray(row.roles) ? row.roles : row.roles ? [row.roles] : []) {
        for (const permission of role.role_permissions) permissions.add(permission.permission_code);
      }
    }
    for (const grant of (grants ?? []) as { permission_code: string }[]) permissions.add(grant.permission_code);
  }
  return {
    admin: [...permissions].some((permission) => !WORKER_ONLY.has(permission)),
    work: permissions.has("work.read"),
    customer: (memberships ?? []).length > 0,
  };
}

/** The message when an account signs in on a tab that is not its own; null when the tab is right. */
export function wrongPortalMessage(surface: LoginSurface, portals: AccountPortals): string | null {
  if (portals[surface]) return null;
  if (portals.work && !portals.admin) return "Đây là tài khoản thợ & tài xế. Vui lòng đăng nhập ở tab “Thợ & tài xế”.";
  if (portals.customer && !portals.admin && !portals.work) return "Đây là tài khoản khách hàng. Vui lòng đăng nhập ở tab “Khách hàng”.";
  if (portals.admin) return "Đây là tài khoản nhân viên vận hành. Vui lòng đăng nhập ở tab “Vận hành”.";
  return "Tài khoản chưa được cấp quyền vào cổng này. Vui lòng liên hệ quản lý cửa hàng.";
}
