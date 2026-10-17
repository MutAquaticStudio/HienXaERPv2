import { randomUUID } from "node:crypto";
import Link from "next/link";
import { permissionLabel, roleDisplayName } from "@/components/access/presentation";
import { InviteEmployeeForm } from "@/components/access/invite-employee-form";
import { ExplicitPermissionForm, ManageAccessForm, ReactivateAccessForm, RevokeAccessForm } from "@/components/access/manage-access-form";
import { RoleEditorButton, type EditorPermission, type EditorRole } from "@/components/access/role-editor";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";
import { DetailTabs } from "@/components/ui/detail-tabs";
import { FormDialog } from "@/components/ui/form-dialog";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { OWNER_ONLY_PERMISSIONS } from "@/lib/access/permission-groups";
import { CORE_LIST_PAGE_SIZE, ilikePattern, parseCoreListQuery } from "@/lib/core-list";
import { createServerSupabase } from "@/lib/supabase/server";

type RoleRelation = { id: string; name: string; system_role: boolean; role_permissions: { permission_code: string }[] };
type Assignment = { id: string; active: boolean; branch_id: string; branches: { id: string; name: string } | null; roles: RoleRelation | null };
type Employee = { id: string; code: string; display_name: string; active: boolean; employee_branch_access: Assignment[] };
type RoleRow = { id: string; code: string; name: string; system_role: boolean; role_permissions: { permission_code: string }[] };
type PermissionRow = { code: string; name: string };
type GrantRow = { employee_id: string; branch_id: string; permission_code: string };

/**
 * Nhân viên & quyền (FB2 Đợt 7, KiotViet style): an employee table whose actions open in popups, and a Vai trò tab where the
 * owner creates and edits custom roles (D12). Preset roles and roles holding roles.manage are view-only.
 */
export default async function AccessManagementPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; tab?: string }> }) {
  const actor = await requireInternalPermission("roles.manage");
  const query = await searchParams;
  const tab = query.tab === "roles" ? "roles" : "employees";
  const list = parseCoreListQuery(query);
  const supabase = await createServerSupabase();
  let employeeQuery = supabase.from("employees").select("id, code, display_name, active, employee_branch_access(id, active, branch_id, branches(id, name), roles(id, name, system_role, role_permissions(permission_code)))", { count: "exact" });
  if (list.q) employeeQuery = employeeQuery.or(`code.ilike.${ilikePattern(list.q)},display_name.ilike.${ilikePattern(list.q)}`);
  const [employees, branches, roles, permissions, grants, assignments] = await Promise.all([
    employeeQuery.order("display_name").order("id").range(list.from, list.to),
    supabase.from("branches").select("id, name").eq("id", actor.branchId).eq("active", true),
    supabase.from("roles").select("id, code, name, system_role, role_permissions(permission_code)").eq("active", true).order("name"),
    supabase.from("permissions").select("code, name").order("code"),
    supabase.from("employee_permission_grants").select("employee_id, branch_id, permission_code").eq("branch_id", actor.branchId),
    supabase.from("employee_branch_access").select("role_id").eq("active", true).limit(5000),
  ]);
  if (employees.error || branches.error || roles.error || permissions.error || grants.error) throw new Error("Không thể tải dữ liệu phân quyền.");
  const employeeRows = employees.data as unknown as Employee[];
  const roleRows = roles.data as unknown as RoleRow[];
  const permissionRows = permissions.data as PermissionRow[];
  const grantRows = grants.data as GrantRow[];
  const permissionName = (code: string) => permissionLabel(permissionRows.find((item) => item.code === code)?.name ?? code);
  const assignableRoles = roleRows.filter((role) => role.role_permissions.every((permission) => actor.permissions.has(permission.permission_code)));
  const roleOptions = assignableRoles.map((role) => ({ id: role.id, name: role.name, label: roleDisplayName(role) }));
  const permissionOptions = permissionRows.filter((permission) => actor.permissions.has(permission.code));
  const editorPermissions: EditorPermission[] = permissionRows.filter((item) => !(OWNER_ONLY_PERMISSIONS as readonly string[]).includes(item.code))
    .map((item) => ({ code: item.code, label: permissionLabel(item.name), granted: actor.permissions.has(item.code) }));
  const inUse = new Map<string, number>();
  for (const row of (assignments.data ?? []) as { role_id: string }[]) inUse.set(row.role_id, (inUse.get(row.role_id) ?? 0) + 1);
  const editorRole = (role: RoleRow): EditorRole => {
    const codes = role.role_permissions.map((item) => item.permission_code);
    return { id: role.id, name: role.name, permissions: codes, active: true, assigned: inUse.get(role.id) ?? 0,
      editable: !role.system_role && !codes.some((code) => (OWNER_ONLY_PERMISSIONS as readonly string[]).includes(code)) };
  };
  const tabs = [{ id: "employees", label: "Nhân viên", count: employees.count ?? undefined }, { id: "roles", label: "Vai trò", count: roleRows.length }];

  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Quản trị truy cập</p><h1>Nhân viên & quyền</h1><p className="lede">Đang quản lý {actor.branchName}. Chuyển chi nhánh để quản lý phạm vi khác; không tự thay đổi quyền của chính mình.</p></div>
      <div className="action-cluster">
        <FormDialog label="Mời nhân viên" title="Mời nhân viên" buttonClassName={tab === "employees" ? "button button-primary" : "button button-secondary"}
          description="Nhân viên nhận thư mời để đặt mật khẩu; vai trò áp dụng tại chi nhánh đang chọn."><InviteEmployeeForm branches={branches.data} roles={roleOptions} /></FormDialog>
        <RoleEditorButton label="Tạo vai trò" permissions={editorPermissions} buttonClassName={tab === "roles" ? "button button-primary" : "button button-secondary"} />
      </div>
    </header>
    <DetailTabs tabs={tabs} active={tab} label="Nhân viên và vai trò" href={(next) => next === "roles" ? "/admin/access?tab=roles" : "/admin/access"} />

    {tab === "employees" ? <>
      <AutoFilterForm aria-label="Tìm nhân viên"><label>Tìm nhân viên<input type="search" name="q" defaultValue={list.q} placeholder="Mã hoặc tên nhân viên" /></label>{list.q && <Link className="code-link" href="/admin/access">Xóa lọc</Link>}</AutoFilterForm>
      <section className="card list-main"><div className="section-head"><h2>{employees.count ?? 0} nhân viên</h2><span className="scope-chip">{CORE_LIST_PAGE_SIZE} / trang</span></div>
        <div className="table-wrap"><table className="access-table">
          <thead><tr><th scope="col">Nhân viên</th><th scope="col">Vai trò tại {actor.branchName}</th><th scope="col">Quyền bổ sung</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead>
          <tbody>{employeeRows.map((employee) => {
            const current = employee.employee_branch_access.find((assignment) => assignment.branch_id === actor.branchId && assignment.active)
              ?? employee.employee_branch_access.find((assignment) => assignment.branch_id === actor.branchId);
            const elsewhere = employee.employee_branch_access.filter((assignment) => assignment.branch_id !== actor.branchId && assignment.active);
            const explicit = current ? grantRows.filter((grant) => grant.employee_id === employee.id && grant.branch_id === current.branch_id).map((grant) => grant.permission_code) : [];
            const baseline = new Set(current?.roles?.role_permissions.map((permission) => permission.permission_code) ?? []);
            const canAct = employee.active && employee.id !== actor.employeeId;
            return <tr key={employee.id} className={employee.active ? undefined : "row-muted"}>
              <td data-label="Nhân viên"><strong>{employee.display_name}</strong><small className="table-subline mono">{employee.code}</small>
                {elsewhere.length > 0 && <small className="table-subline">Chi nhánh khác: {elsewhere.map((assignment) => `${assignment.branches?.name ?? "Chi nhánh"} (${assignment.roles ? roleDisplayName(assignment.roles) : "vai trò ẩn"})`).join(", ")}</small>}</td>
              <td data-label="Vai trò">{current?.roles ? roleDisplayName(current.roles) : <span className="muted">Chưa có</span>}</td>
              <td data-label="Quyền bổ sung">{explicit.length ? explicit.map(permissionName).join(", ") : <span className="muted">Không có</span>}</td>
              <td data-label="Trạng thái"><StatusBadge tone={!employee.active ? "danger" : current?.active ? "success" : "warning"}>{!employee.active ? "Ngừng hoạt động" : current?.active ? "Đang có hiệu lực" : current ? "Đã thu hồi" : "Chưa cấp quyền"}</StatusBadge></td>
              <td className="table-actions" data-label="Thao tác">{canAct && <div className="action-cluster">
                <FormDialog label={current?.active ? "Đổi vai trò" : "Cấp vai trò"} title={`${current?.active ? "Đổi vai trò" : "Cấp vai trò"} · ${employee.display_name}`} buttonClassName="button button-secondary button-compact" triggerData={{ "employee-id": employee.id, action: "role" }}>
                  <ManageAccessForm operationId={randomUUID()} employeeId={employee.id} branches={branches.data} roles={roleOptions} /></FormDialog>
                {current?.active && <FormDialog label="Quyền riêng" title={`Quyền riêng · ${employee.display_name}`} buttonClassName="button button-secondary button-compact" triggerData={{ "employee-id": employee.id, action: "explicit" }}
                  description="Quyền cộng thêm ngoài vai trò, chỉ tại chi nhánh đang chọn."><ExplicitPermissionForm employeeId={employee.id} branchId={current.branch_id} permissions={permissionOptions.filter((permission) => !baseline.has(permission.code))} selected={explicit} /></FormDialog>}
                {current?.active && <FormDialog label="Thu hồi" title={`Thu hồi quyền · ${employee.display_name}`} buttonClassName="button button-danger button-compact" triggerData={{ "access-id": current.id, action: "revoke" }}
                  description="Nhân viên mất quyền tại chi nhánh này ngay cả khi đang đăng nhập."><RevokeAccessForm accessId={current.id} /></FormDialog>}
                {current && !current.active && <FormDialog label="Kích hoạt lại" title={`Kích hoạt lại · ${employee.display_name}`} buttonClassName="button button-secondary button-compact" triggerData={{ "access-id": current.id, action: "reactivate" }}>
                  <ReactivateAccessForm accessId={current.id} /></FormDialog>}
              </div>}</td>
            </tr>;
          })}</tbody>
        </table>{!employeeRows.length && <p className="empty-inline">Không có nhân viên phù hợp trong phạm vi bạn được xem.</p>}</div>
        <ListPager page={list.page} total={employees.count ?? 0} params={{ q: list.q }} />
      </section>
    </> : <section className="card list-main"><div className="section-head"><h2>Vai trò</h2><span className="scope-chip">Áp dụng mọi chi nhánh</span></div>
      <p className="card-scope-note">Vai trò mẫu có sẵn chỉ xem. Vai trò tùy biến do chủ doanh nghiệp tạo; không vai trò nào được quyền quản lý nhân viên & phân quyền.</p>
      <div className="table-wrap"><table>
        <thead><tr><th scope="col">Vai trò</th><th scope="col">Loại</th><th scope="col" className="numeric">Số quyền</th><th scope="col" className="numeric">Đang dùng</th><th scope="col">Thao tác</th></tr></thead>
        <tbody>{roleRows.map((role) => {
          const editor = editorRole(role);
          return <tr key={role.id}><td data-label="Vai trò"><strong>{roleDisplayName(role)}</strong></td>
            <td data-label="Loại">{role.system_role ? "Vai trò mẫu" : editor.editable ? "Tùy biến" : "Quản trị"}</td>
            <td className="numeric" data-label="Số quyền">{role.role_permissions.length}</td>
            <td className="numeric" data-label="Đang dùng">{editor.assigned}</td>
            <td data-label="Thao tác"><RoleEditorButton label={editor.editable ? "Sửa" : "Xem"} role={editor} permissions={editorPermissions} /></td></tr>;
        })}</tbody>
      </table></div>
    </section>}
  </div>;
}
