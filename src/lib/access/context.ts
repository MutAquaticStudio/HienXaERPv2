import "server-only";

import { AppError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import {
  type CustomerMembership,
  type InternalAssignment,
  requirePermission,
  selectCustomerMembership,
  selectInternalContext,
} from "./policy";

type AccessRow = {
  branch_id: string;
  role_id: string;
  active: boolean;
  branches: { name: string } | { name: string }[] | null;
  roles: { name: string; role_permissions: { permission_code: string }[] } | { name: string; role_permissions: { permission_code: string }[] }[] | null;
};

type ExplicitPermissionRow = {
  branch_id: string;
  permission_code: string;
};

function one<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

async function resolveInternalAccessUncached() {
  const supabase = await createServerSupabase();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new AppError({ code: "UNAUTHENTICATED", message: "Cần đăng nhập.", status: 401 });

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id, display_name, active")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (employeeError || !employee) throw new AppError({ code: "FORBIDDEN", message: "Không có hồ sơ nhân viên hợp lệ.", status: 403 });

  const { data: accessRows, error: accessError } = await supabase
    .from("employee_branch_access")
    .select("branch_id, role_id, active, branches(name), roles(name, role_permissions(permission_code))")
    .eq("employee_id", employee.id)
    .eq("active", true);
  if (accessError) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Không thể kiểm tra quyền truy cập.", status: 503 });

  const { data: explicitRows, error: explicitError } = await supabase
    .from("employee_permission_grants")
    .select("branch_id, permission_code")
    .eq("employee_id", employee.id);
  if (explicitError) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Không thể kiểm tra quyền tường minh.", status: 503 });
  const explicitByBranch = new Map<string, string[]>();
  for (const row of (explicitRows ?? []) as ExplicitPermissionRow[]) {
    explicitByBranch.set(row.branch_id, [...(explicitByBranch.get(row.branch_id) ?? []), row.permission_code]);
  }

  const assignments = (accessRows as unknown as AccessRow[]).map<InternalAssignment>((row) => {
    const branch = one(row.branches);
    const role = one(row.roles);
    return {
      branchId: row.branch_id,
      branchName: branch?.name ?? "Chi nhánh",
      roleId: row.role_id,
      roleName: role?.name ?? "Vai trò",
      permissions: [...new Set([
        ...(role?.role_permissions.map((permission) => permission.permission_code) ?? []),
        ...(explicitByBranch.get(row.branch_id) ?? []),
      ])],
      active: row.active,
    };
  });
  const selectedBranch = (await cookies()).get("hx_branch_id")?.value;
  return selectInternalContext({
    authUserId: authData.user.id,
    employeeId: employee.id,
    employeeName: employee.display_name,
    employeeActive: employee.active,
    assignments,
    requestedBranchId: selectedBranch,
  });
}

export const resolveInternalAccess = cache(resolveInternalAccessUncached);

export async function requireInternalAccess(loginPath: "/login" | "/work/login" = "/login") {
  try {
    return await resolveInternalAccess();
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect(loginPath);
    if (error instanceof AppError && error.code === "CONFLICT") redirect(`/select-branch?surface=${loginPath === "/work/login" ? "work" : "admin"}`);
    throw error;
  }
}

export async function requireInternalPermission(permission: string, loginPath: "/login" | "/work/login" = "/login") {
  const context = await requireInternalAccess(loginPath);
  requirePermission(context, permission);
  return context;
}

export async function requireCustomerAccess(allowedRoles?: readonly CustomerMembership["role"][]) {
  const supabase = await createServerSupabase();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/customer/login");

  const { data, error } = await supabase
    .from("customer_portal_memberships")
    .select("customer_id, membership_role, active")
    .eq("auth_user_id", authData.user.id)
    .eq("active", true);
  if (error || !data?.length) throw new AppError({ code: "FORBIDDEN", message: "Không có quyền cổng khách hàng.", status: 403 });

  const memberships = data.map((row) => ({
    customerId: row.customer_id,
    customerName: "",
    role: row.membership_role as CustomerMembership["role"],
    active: row.active,
  }));
  const cookieStore = await cookies();
  const requestedCustomerId = cookieStore.get("hx_customer_id")?.value ?? memberships[0].customerId;
  const membership = selectCustomerMembership(memberships, requestedCustomerId, allowedRoles);
  const { data: customerName, error: nameError } = await supabase.rpc("customer_portal_display_name", { target_customer_id: membership.customerId });
  if (nameError || typeof customerName !== "string" || !customerName.trim()) {
    throw new AppError({ code: "FORBIDDEN", message: "Không có hồ sơ khách hàng hợp lệ.", status: 403 });
  }
  return { ...membership, customerName };
}
