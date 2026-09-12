import { InviteEmployeeForm } from "@/components/access/invite-employee-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

type AccessRow = { id: string; code: string; display_name: string; active: boolean; employee_branch_access: { branches: { id: string; name: string } | null; roles: { id: string; name: string } | null }[] };

export default async function AccessManagementPage() {
  await requireInternalPermission("roles.manage");
  const supabase = await createServerSupabase();
  const [{ data: employees }, { data: branches }, { data: roles }] = await Promise.all([
    supabase.from("employees").select("id, code, display_name, active, employee_branch_access(branches(id, name), roles(id, name))").order("display_name"),
    supabase.from("branches").select("id, name").eq("active", true).order("name"),
    supabase.from("roles").select("id, name").eq("active", true).order("name"),
  ]);
  const employeeRows = (employees ?? []) as unknown as AccessRow[];

  return <><header className="page-heading"><div><p className="eyebrow">Quản trị truy cập</p><h1>Nhân viên & quyền</h1><p className="lede">Mỗi nhân viên có đúng một vai trò đang hoạt động tại mỗi chi nhánh. Mọi thay đổi đều cần lý do và audit.</p></div></header><div className="two-column"><section className="card"><div className="section-head"><h2>Nhân viên</h2><StatusBadge tone="info">Theo quyền hiện tại</StatusBadge></div><div className="table-wrap"><table><thead><tr><th>Mã</th><th>Nhân viên</th><th>Chi nhánh</th><th>Vai trò</th><th>Trạng thái</th></tr></thead><tbody>{employeeRows.map((employee) => { const access = employee.employee_branch_access[0]; return <tr key={employee.id}><td className="mono">{employee.code}</td><td>{employee.display_name}</td><td>{access?.branches?.name ?? "Chưa gán"}</td><td>{access?.roles?.name ?? "Chưa gán"}</td><td><StatusBadge tone={employee.active ? "success" : "danger"}>{employee.active ? "Đang hoạt động" : "Đã thu hồi"}</StatusBadge></td></tr>; })}</tbody></table></div></section><section className="card card-pad"><h2>Mời nhân viên</h2><p className="muted">Lời mời dùng Auth provider. Không có đăng ký nội bộ công khai.</p><InviteEmployeeForm branches={(branches ?? []).map((branch) => ({ id: branch.id, name: branch.name }))} roles={(roles ?? []).map((role) => ({ id: role.id, name: role.name }))} /></section></div></>;
}
