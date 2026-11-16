"use client";

import { Search } from "lucide-react";
import { useActionState, useId, useMemo, useState } from "react";
import { useCloseFormDialog } from "@/components/ui/form-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { assignRoleAction, reactivateAccessAction, removeEmployeeAction, restoreEmployeeAction, revokeAccessAction, setExplicitPermissionsAction } from "@/lib/auth/actions";
import { groupPermissions } from "@/lib/access/permission-groups";
import { foldSearchText, permissionHint, permissionLabel, roleLabel } from "./presentation";

type Option = { id: string; name: string; label?: string };
type PermissionOption = { code: string; name: string };
/** One branch where the person holds a role, for "Vai trò hiện tại" in the role popup. */
export type AssignmentSummary = { branchId: string; branchName: string; roleId: string | null; roleLabel: string; active: boolean };

/**
 * "Đổi vai trò" / "Cấp vai trò": labels above the fields, the person's roles today and the role they hold at the chosen
 * branch picked already. Saving the role they already hold there is not offered, since nothing would change.
 */
export function ManageAccessForm({ employeeId, branches, roles, operationId: initialOperationId, assignments = [] }: {
  employeeId: string; branches: Option[]; roles: Option[]; operationId: string; assignments?: AssignmentSummary[];
}) {
  const [state, action, pending] = useActionState(assignRoleAction, undefined);
  const [operationId, setOperationId] = useState(initialOperationId);
  const closeDialog = useCloseFormDialog();
  const id = useId();
  const roleAt = (branchId: string) => {
    const held = assignments.find((assignment) => assignment.branchId === branchId);
    return held?.roleId && roles.some((role) => role.id === held.roleId) ? held.roleId : "";
  };
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [roleId, setRoleId] = useState(() => roleAt(branches[0]?.id ?? ""));
  const current = assignments.find((assignment) => assignment.branchId === branchId);
  const unchanged = !!current?.active && !!roleId && roleId === current.roleId;
  const ordered = [...assignments].sort((a, b) => Number(b.branchId === branchId) - Number(a.branchId === branchId));
  return <form action={action} className="form-stack access-role-form" onChange={() => setOperationId(crypto.randomUUID())}>
    <input type="hidden" name="operationId" value={operationId} /><input type="hidden" name="employeeId" value={employeeId} />
    <section className="access-current" aria-labelledby={`${id}-current`}>
      <h3 id={`${id}-current`}>Vai trò hiện tại</h3>
      {ordered.length ? <dl>{ordered.map((assignment) => <div key={assignment.branchId}>
        <dt>{assignment.branchName}</dt>
        <dd><strong>{assignment.roleLabel}</strong>{!assignment.active && <StatusBadge tone="warning">Đã thu hồi</StatusBadge>}</dd>
      </div>)}</dl> : <p className="muted">Chưa có vai trò ở chi nhánh nào.</p>}
    </section>
    <div className="form-grid">
      <div className="field"><label htmlFor={`${id}-branch`}>Chi nhánh</label>
        <select id={`${id}-branch`} name="branchId" required value={branchId} onChange={(event) => { setBranchId(event.target.value); setRoleId(roleAt(event.target.value)); }}>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
      <div className="field"><label htmlFor={`${id}-role`}>Vai trò</label>
        <select id={`${id}-role`} name="roleId" required value={roleId} onChange={(event) => setRoleId(event.target.value)} aria-describedby={unchanged ? `${id}-same` : undefined}>
          <option value="">Chọn vai trò</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.label ?? roleLabel(role.name)}</option>)}</select>
        {unchanged && <small id={`${id}-same`} className="muted">Đang là vai trò hiện tại. Chọn vai trò khác để đổi.</small>}</div>
    </div>
    {state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{state.message}</p>}
    <div className="form-actions">
      {closeDialog && <button type="button" className="button button-secondary" onClick={closeDialog}>Hủy</button>}
      <button className="button button-primary" disabled={pending || !branches.length || !roles.length || unchanged}>Lưu vai trò</button>
    </div>
  </form>;
}

/**
 * "Quyền riêng": permissions on top of the role, grouped like the menu with a count per group, a search box, and what the
 * role already gives shown ticked and locked. A box the search hides stays in the form, so searching never drops a ticked
 * permission from what is saved.
 */
export function ExplicitPermissionForm({ employeeId, branchId, permissions, selected, inherited = [], roleName }: {
  employeeId: string; branchId: string; permissions: PermissionOption[]; selected: string[];
  /** What the person's role at this branch already gives: shown ticked and locked, never sent. */
  inherited?: PermissionOption[]; roleName?: string;
}) {
  const [state, action, pending] = useActionState(setExplicitPermissionsAction, undefined);
  const closeDialog = useCloseFormDialog();
  const id = useId();
  const [checked, setChecked] = useState(() => new Set(selected.filter((code) => permissions.some((permission) => permission.code === code))));
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const grantable = new Set(permissions.map((item) => item.code));
    const items = [...permissions.map((item) => ({ ...item, inherited: false })), ...inherited.filter((item) => !grantable.has(item.code)).map((item) => ({ ...item, inherited: true }))]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((item) => { const label = permissionLabel(item.name); return { ...item, label, hint: permissionHint(item.code), folded: foldSearchText(label) }; });
    return groupPermissions(items).map((group) => ({ ...group, folded: foldSearchText(group.label) }));
  }, [permissions, inherited]);
  const needle = foldSearchText(query);
  const matches = (groupText: string, itemText: string) => !needle || itemText.includes(needle) || groupText.includes(needle);
  const shown = groups.reduce((total, group) => total + group.items.filter((item) => matches(group.folded, item.folded)).length, 0);
  const inheritedCount = groups.reduce((total, group) => total + group.items.filter((item) => item.inherited).length, 0);
  const toggle = (code: string, on: boolean) => setChecked((current) => {
    const next = new Set(current);
    if (on) next.add(code); else next.delete(code);
    return next;
  });

  return <form action={action} className="permission-picker">
    <input type="hidden" name="employeeId" value={employeeId} /><input type="hidden" name="branchId" value={branchId} />
    <div className="permission-picker-bar">
      <div className="field permission-search"><label htmlFor={`${id}-search`}>Tìm quyền</label>
        <span className="permission-search-box"><Search aria-hidden="true" size={16} />
          <input id={`${id}-search`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ví dụ: công nợ, giao hàng, kiểm kho" autoComplete="off"
            onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); setQuery(""); } }} /></span></div>
      <p className="permission-picker-summary" aria-live="polite">Đã chọn <strong>{checked.size}</strong> quyền cộng thêm
        {inheritedCount > 0 && <> · {inheritedCount} quyền có sẵn từ vai trò{roleName ? ` ${roleName}` : ""}</>}
        {needle && shown > 0 && <> · {shown} quyền khớp</>}</p>
    </div>
    <div className="permission-picker-scroll">
      {groups.map((group) => {
        const own = group.items.filter((item) => !item.inherited);
        const picked = own.filter((item) => checked.has(item.code)).length;
        return <fieldset key={group.id} className="permission-group" hidden={!group.items.some((item) => matches(group.folded, item.folded))}>
          <legend><span>{group.label}</span><span className={`permission-group-count${picked ? " active" : ""}`}>{own.length ? `đã chọn ${picked}/${own.length}` : "có sẵn từ vai trò"}</span></legend>
          <div className="permission-options">{group.items.map((item) => <label key={item.code} className={`permission-option${item.inherited ? " inherited" : ""}`} hidden={!matches(group.folded, item.folded)}>
            {item.inherited
              ? <input type="checkbox" checked disabled readOnly aria-describedby={`${id}-${item.code}-from`} />
              : <input type="checkbox" name="permissionCode" value={item.code} checked={checked.has(item.code)} onChange={(event) => toggle(item.code, event.target.checked)}
                aria-describedby={item.hint ? `${id}-${item.code}-hint` : undefined} />}
            <span className="permission-option-text"><span>{item.label}</span>
              {item.hint && <small id={`${id}-${item.code}-hint`}>{item.hint}</small>}
              {item.inherited && <small id={`${id}-${item.code}-from`}>Đã có từ vai trò</small>}</span>
          </label>)}</div>
        </fieldset>;
      })}
      {needle && !shown && <p className="permission-picker-empty">Không có quyền nào khớp “{query.trim()}”. <button type="button" className="link-button" onClick={() => setQuery("")}>Xóa tìm kiếm</button></p>}
      {!permissions.length && <p className="muted">Không có quyền nào trong phạm vi của bạn để cấp thêm.</p>}
    </div>
    <div className="permission-picker-foot">
      {state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{state.message}</p>}
      <div className="form-actions">
        {closeDialog && <button type="button" className="button button-secondary" onClick={closeDialog}>Hủy</button>}
        <button className="button button-primary" disabled={pending}>Lưu quyền bổ sung</button>
      </div>
    </div>
  </form>;
}

export function RevokeAccessForm({ accessId }: { accessId: string }) {
  const [state, action, pending] = useActionState(revokeAccessAction, undefined);
  return <form action={action} className="command-panel"><input type="hidden" name="accessId" value={accessId} /><label><input type="checkbox" name="confirmed" required /> Xác nhận chặn quyền tại chi nhánh này</label>{state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{state.message}</p>}<button className="button button-danger" disabled={pending || state?.success}>Thu hồi quyền</button></form>;
}

/** FB12: "Xóa" — deleted when the person has no history, otherwise "Ngừng làm việc". */
export function RemoveEmployeeForm({ employeeId, name }: { employeeId: string; name: string }) {
  const [state, action, pending] = useActionState(removeEmployeeAction, undefined);
  return <form action={action} className="command-panel"><input type="hidden" name="employeeId" value={employeeId} />
    <p className="muted">Nếu {name} chưa có chứng từ nào (đơn, phiếu giao, việc, thu nhập, chấm công, sổ quỹ), hệ thống xóa hẳn cả tài khoản đăng nhập. Nếu đã có, nhân viên chuyển sang <strong>Ngừng làm việc</strong>: khóa đăng nhập, ẩn khỏi danh sách chọn, chứng từ cũ vẫn giữ tên.</p>
    <label><input type="checkbox" name="confirmed" required /> Xác nhận xóa {name}</label>
    {state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{state.message}</p>}
    <button className="button button-danger" disabled={pending || state?.success}>Xóa nhân viên</button></form>;
}

export function RestoreEmployeeForm({ employeeId }: { employeeId: string }) {
  const [state, action, pending] = useActionState(restoreEmployeeAction, undefined);
  return <form action={action} className="command-panel"><input type="hidden" name="employeeId" value={employeeId} />
    <p className="muted">Nhân viên đăng nhập lại được với vai trò và quyền trước khi ngừng.</p>
    {state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{state.message}</p>}
    <button className="button button-primary" disabled={pending || state?.success}>Dùng lại</button></form>;
}

export function ReactivateAccessForm({ accessId }: { accessId: string }) {
  const [state, action, pending] = useActionState(reactivateAccessAction, undefined);
  return <form action={action} className="command-panel"><input type="hidden" name="accessId" value={accessId} /><label><input type="checkbox" name="confirmed" required /> Xác nhận khôi phục quyền theo vai trò trước đó</label>{state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{state.message}</p>}<button className="button button-primary" disabled={pending || state?.success}>Kích hoạt lại</button></form>;
}
