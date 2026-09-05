import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { canUseSyntheticAuth } from "@/modules/platform/environment";
import {
  SYNTHETIC_OFFICE_PRINCIPAL,
  SYNTHETIC_WORKER_PRINCIPAL,
} from "@/modules/platform/synthetic-principals";
import type {
  DataScope,
  DataScopeKind,
  EmployeeStatus,
  Permission,
  Principal,
  RoleTemplate,
} from "@/modules/platform/types";

export type ProductSurface = "office" | "worker";

interface ProfileRow {
  user_id: string;
  display_name: string;
  status: EmployeeStatus;
}

interface RoleRow {
  id: string;
  code: RoleTemplate;
}

interface PermissionRow {
  id: string;
  code: Permission;
}

interface ScopeRow {
  scope_kind: DataScopeKind;
  branch_id: string | null;
  warehouse_id: string | null;
}

export const getCurrentPrincipal = cache(async function getCurrentPrincipal(
  surface: ProductSurface,
): Promise<Principal | null> {
  if (canUseSyntheticAuth()) {
    const cookieStore = await cookies();
    const selectedRole = cookieStore.get("hx-synthetic-role")?.value;
    if (selectedRole === "worker") return SYNTHETIC_WORKER_PRINCIPAL;
    if (selectedRole === "office") return SYNTHETIC_OFFICE_PRINCIPAL;
    return surface === "worker"
      ? SYNTHETIC_WORKER_PRINCIPAL
      : SYNTHETIC_OFFICE_PRINCIPAL;
  }

  if (!getSupabasePublicConfig()) return null;

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const userId = userData.user.id;
  const [profileResult, userRolesResult, scopesResult] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("user_id, display_name, status")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("user_roles").select("role_id").eq("user_id", userId),
    supabase
      .from("data_scopes")
      .select("scope_kind, branch_id, warehouse_id")
      .eq("user_id", userId),
  ]);

  const profile = profileResult.data as ProfileRow | null;
  if (profileResult.error || !profile) return null;

  const roleIds = (userRolesResult.data ?? []).map((row) => row.role_id);
  const roleResult = roleIds.length
    ? await supabase.from("roles").select("id, code").in("id", roleIds)
    : { data: [], error: null };
  const roles = (roleResult.data ?? []) as RoleRow[];

  const rolePermissionResult = roleIds.length
    ? await supabase
        .from("role_permissions")
        .select("permission_id")
        .in("role_id", roleIds)
    : { data: [], error: null };
  const permissionIds = (rolePermissionResult.data ?? []).map(
    (row) => row.permission_id,
  );
  const permissionResult = permissionIds.length
    ? await supabase
        .from("permissions")
        .select("id, code")
        .in("id", permissionIds)
    : { data: [], error: null };
  const permissions = (permissionResult.data ?? []) as PermissionRow[];

  const scopes: DataScope[] = ((scopesResult.data ?? []) as ScopeRow[]).map(
    (scope) => ({
      kind: scope.scope_kind,
      ...(scope.branch_id ? { branchId: scope.branch_id } : {}),
      ...(scope.warehouse_id ? { warehouseId: scope.warehouse_id } : {}),
    }),
  );

  return {
    userId: profile.user_id,
    displayName: profile.display_name,
    status: profile.status,
    roles: roles.map((role) => role.code),
    permissions: permissions.map((permission) => permission.code),
    scopes,
  };
});
