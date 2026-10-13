"use client";
import { permissionLabel } from "./presentation";
import { roleLabel } from "./presentation";


import { useActionState, useState } from "react";
import { assignRoleAction, reactivateAccessAction, revokeAccessAction, setExplicitPermissionsAction } from "@/lib/auth/actions";

type Option = { id: string; name: string };
type PermissionOption = { code: string; name: string };

export function ManageAccessForm({ employeeId, branches, roles, operationId: initialOperationId }: { employeeId: string; branches: Option[]; roles: Option[]; operationId: string }) {
  const [state, action, pending] = useActionState(assignRoleAction, undefined);
  const [operationId, setOperationId] = useState(initialOperationId);
  return <form action={action} onChange={() => setOperationId(crypto.randomUUID())}><input type="hidden" name="operationId" value={operationId} /><input type="hidden" name="employeeId" value={employeeId} /><div className="form-grid"><label>Chi nhánh<select name="branchId" required>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Vai trò<select name="roleId" required><option value="">Chọn vai trò</option>{roles.map((role) => <option key={role.id} value={role.id}>{roleLabel(role.name)}</option>)}</select></label><label>Lý do thay đổi<input name="reason" required minLength={3} maxLength={500} /></label></div>{state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{state.message}</p>}<button className="button button-primary" disabled={pending || !branches.length || !roles.length}>Cấp / đổi vai trò</button></form>;
}

export function ExplicitPermissionForm({ employeeId, branchId, permissions, selected }: { employeeId: string; branchId: string; permissions: PermissionOption[]; selected: string[] }) {
  const [state, action, pending] = useActionState(setExplicitPermissionsAction, undefined);
  return <form action={action} className="command-panel"><input type="hidden" name="employeeId" value={employeeId} /><input type="hidden" name="branchId" value={branchId} /><fieldset><legend>Quyền cộng thêm ngoài vai trò</legend>{permissions.map((permission) => <label key={permission.code}><input type="checkbox" name="permissionCode" value={permission.code} defaultChecked={selected.includes(permission.code)} /> {permissionLabel(permission.name)}</label>)}</fieldset>{!permissions.length && <p className="muted">Không có quyền nào trong phạm vi của bạn để cấp thêm.</p>}<label>Lý do thay đổi<input name="reason" required minLength={3} maxLength={500} /></label>{state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{state.message}</p>}<button className="button button-primary" disabled={pending}>Lưu quyền bổ sung</button></form>;
}

export function RevokeAccessForm({ accessId }: { accessId: string }) {
  const [state, action, pending] = useActionState(revokeAccessAction, undefined);
  return <form action={action} className="command-panel"><input type="hidden" name="accessId" value={accessId} /><label>Lý do thu hồi<input name="reason" required minLength={3} maxLength={500} /></label><label><input type="checkbox" name="confirmed" required /> Xác nhận chặn quyền tại chi nhánh này</label>{state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{state.message}</p>}<button className="button button-danger" disabled={pending || state?.success}>Thu hồi quyền</button></form>;
}

export function ReactivateAccessForm({ accessId }: { accessId: string }) {
  const [state, action, pending] = useActionState(reactivateAccessAction, undefined);
  return <form action={action} className="command-panel"><input type="hidden" name="accessId" value={accessId} /><label>Lý do kích hoạt lại<input name="reason" required minLength={3} maxLength={500} /></label><label><input type="checkbox" name="confirmed" required /> Xác nhận khôi phục quyền theo vai trò trước đó</label>{state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{state.message}</p>}<button className="button button-primary" disabled={pending || state?.success}>Kích hoạt lại</button></form>;
}
