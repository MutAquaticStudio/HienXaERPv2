"use client";

import { useActionState } from "react";
import { inviteEmployeeAction } from "@/lib/auth/actions";

type Option = { id: string; name: string };

export function InviteEmployeeForm({ branches, roles }: { branches: Option[]; roles: Option[] }) {
  const [state, action, pending] = useActionState(inviteEmployeeAction, undefined);
  return <form action={action}><div className="form-grid"><div className="field"><label htmlFor="invite-email">Email</label><input id="invite-email" name="email" type="email" autoComplete="off" required /></div><div className="field"><label htmlFor="invite-code">Mã nhân viên</label><input id="invite-code" name="code" pattern="[A-Z0-9_-]{2,24}" placeholder="NV001" required /></div><div className="field"><label htmlFor="invite-name">Tên hiển thị</label><input id="invite-name" name="name" required /></div><div className="field"><label htmlFor="invite-branch">Chi nhánh</label><select id="invite-branch" name="branchId" required>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div><div className="field"><label htmlFor="invite-role">Vai trò</label><select id="invite-role" name="roleId" required><option value="">Chọn vai trò</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div><div className="field"><label htmlFor="invite-reason">Lý do cấp quyền</label><input id="invite-reason" name="reason" minLength={3} required /></div></div>{state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{state.message}</p>}<div className="form-actions"><button className="button button-primary" type="submit" disabled={pending || !branches.length || !roles.length}>{pending ? "Đang gửi..." : "Gửi lời mời"}</button></div></form>;
}
