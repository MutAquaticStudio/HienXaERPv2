import { InviteEmployeeForm } from "@/components/access/invite-employee-form";
import { ExplicitPermissionForm, ManageAccessForm, ReactivateAccessForm, RevokeAccessForm } from "@/components/access/manage-access-form";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

type RoleRelation = { id: string; name: string; role_permissions: { permission_code: string }[] };
type Assignment = { id: string; active: boolean; branch_id: string; branches: { id: string; name: string } | null; roles: RoleRelation | null };
type Employee = { id: string; code: string; display_name: string; active: boolean; employee_branch_access: Assignment[] };
type RoleRow = { id: string; name: string; role_permissions: { permission_code: string }[] };
type PermissionRow = { code: string; name: string };
type GrantRow = { employee_id: string; branch_id: string; permission_code: string };

export default async function AccessManagementPage() {
  const actor = await requireInternalPermission("roles.manage");
  const supabase = await createServerSupabase();
  const [employees, branches, roles, permissions, grants] = await Promise.all([
    supabase.from("employees").select("id, code, display_name, active, employee_branch_access(id, active, branch_id, branches(id, name), roles(id, name, role_permissions(permission_code)))").order("display_name").limit(100),
    supabase.from("branches").select("id, name").eq("id", actor.branchId).eq("active", true),
    supabase.from("roles").select("id, name, role_permissions(permission_code)").eq("active", true).order("name"),
    supabase.from("permissions").select("code, name").order("code"),
    supabase.from("employee_permission_grants").select("employee_id, branch_id, permission_code").eq("branch_id", actor.branchId),
  ]);
  if (employees.error || branches.error || roles.error || permissions.error || grants.error) throw new Error("Không thể tải dữ liệu phân quyền.");
  const employeeRows = employees.data as unknown as Employee[];
  const roleRows = roles.data as unknown as RoleRow[];
  const permissionRows = permissions.data as PermissionRow[];
  const grantRows = grants.data as GrantRow[];
  const roleOptions = roleRows
    .filter((role) => role.role_permissions.every((permission) => actor.permissions.has(permission.permission_code)))
    .map((role) => ({ id: role.id, name: role.name }));
  const permissionOptions = permissionRows.filter((permission) => actor.permissions.has(permission.code));

  return <>
    <header className="page-heading"><div><p className="eyebrow">Quản trị truy cập</p><h1>Nhân viên & quyền</h1><p className="lede">Đang quản lý {actor.branchName}. Chuyển chi nhánh để quản lý phạm vi khác; không tự thay đổi quyền của chính mình.</p></div><span className="scope-chip">Tối đa 100 nhân viên</span></header>
    <section className="card card-pad"><h2>Mời nhân viên</h2><InviteEmployeeForm branches={branches.data} roles={roleOptions} /></section>
    {employeeRows.map((employee) => {
      const hasActiveCurrentAccess = employee.employee_branch_access.some((assignment) => assignment.branch_id === actor.branchId && assignment.active);
      return <section className="card card-pad" key={employee.id}>
        <div className="section-head flush"><div><h2>{employee.display_name} · {employee.code}</h2><p>{employee.active ? "Nhân viên đang hoạt động" : "Nhân viên đã ngừng hoạt động"}</p></div><span className="scope-chip">{employee.employee_branch_access.filter((assignment) => assignment.active).length} phạm vi hiệu lực</span></div>
        <div className="table-wrap"><table><thead><tr><th>Chi nhánh</th><th>Vai trò</th><th>Quyền tường minh</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{employee.employee_branch_access.map((assignment) => {
          const explicit = grantRows.filter((grant) => grant.employee_id === employee.id && grant.branch_id === assignment.branch_id).map((grant) => grant.permission_code);
          const baseline = new Set(assignment.roles?.role_permissions.map((permission) => permission.permission_code) ?? []);
          const assignableExplicit = permissionOptions.filter((permission) => !baseline.has(permission.code));
          const canAct = employee.active && employee.id !== actor.employeeId && assignment.branch_id === actor.branchId;
          return <tr key={assignment.id}><td>{assignment.branches?.name ?? "Không có quyền xem"}</td><td>{assignment.roles?.name ?? "Không có quyền xem"}</td><td>{explicit.length ? explicit.join(", ") : "Không có"}</td><td>{assignment.active ? "Đang có hiệu lực" : "Đã thu hồi"}</td><td>{canAct && assignment.active && <div className="action-cluster"><details><summary>Quyền riêng</summary><ExplicitPermissionForm employeeId={employee.id} branchId={assignment.branch_id} permissions={assignableExplicit} selected={explicit} /></details><details><summary>Thu hồi</summary><RevokeAccessForm accessId={assignment.id} /></details></div>}{canAct && !assignment.active && !hasActiveCurrentAccess && <details><summary>Kích hoạt lại</summary><ReactivateAccessForm accessId={assignment.id} /></details>}</td></tr>;
        })}</tbody></table></div>
        {employee.active && employee.id !== actor.employeeId && <details><summary>Cấp / đổi vai trò tại {actor.branchName}</summary><ManageAccessForm employeeId={employee.id} branches={branches.data} roles={roleOptions} /></details>}
      </section>;
    })}
  </>;
}
