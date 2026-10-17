"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { groupPermissions } from "@/lib/access/permission-groups";
import { saveCustomRoleAction, type RoleSaveResult } from "@/lib/access/role-actions";

export type EditorPermission = { code: string; label: string; /** The editor holds it and may hand it out. */ granted: boolean };
export type EditorRole = { id: string; name: string; permissions: string[]; active: boolean; assigned: number; editable: boolean };

/**
 * "Tạo vai trò" / "Sửa" / "Xem" for one role (owner decision D12): name and permissions ticked by group. Preset roles are
 * shown read-only; a custom role in use warns that a change applies at once to everyone holding it.
 */
export function RoleEditorButton({ label, role, permissions, buttonClassName = "button button-secondary button-compact" }: {
  label: string; role?: EditorRole; permissions: EditorPermission[]; buttonClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(role?.name ?? "");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role?.permissions ?? []));
  const [retire, setRetire] = useState(false);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<RoleSaveResult | null>(null);
  const [pending, startTransition] = useTransition();
  const readOnly = !!role && !role.editable;
  const known = new Map(permissions.map((item) => [item.code, item]));
  const shown = readOnly ? (role?.permissions ?? []).map((code) => known.get(code) ?? { code, label: code, granted: false }) : permissions;
  const groups = groupPermissions(shown);
  const toggle = (codes: string[], on: boolean) => setSelected((current) => {
    const next = new Set(current);
    for (const code of codes) if (on) next.add(code); else next.delete(code);
    return next;
  });

  function save() {
    if (pending) return;
    startTransition(async () => {
      let outcome: RoleSaveResult;
      try {
        outcome = await saveCustomRoleAction({ operationId, roleId: role?.id ?? null, name, permissions: [...selected].sort(), expected: role ? [...role.permissions].sort() : null, active: !retire });
      } catch {
        outcome = { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra." };
      }
      setResult(outcome);
      if (outcome.status === "UNKNOWN") return;
      setOperationId(crypto.randomUUID());
      if (outcome.status === "SUCCESS") { setOpen(false); router.refresh(); }
    });
  }

  const title = readOnly ? `Vai trò · ${role!.name}` : role ? `Sửa vai trò · ${role.name}` : "Tạo vai trò";
  return <>
    <button type="button" className={buttonClassName} onClick={() => { setOpen(true); setResult(null); }}>{label}</button>
    {open && <Dialog title={title} size="lg" onClose={() => setOpen(false)} initialFocusId={readOnly ? undefined : "role-name"}
      description={readOnly ? "Vai trò mẫu có sẵn của hệ thống, chỉ xem. Tạo vai trò mới nếu cần bộ quyền khác." : "Quyền quản lý nhân viên & phân quyền chỉ dành cho chủ doanh nghiệp và không gán được vào vai trò."}>
      {!readOnly && <div className="field"><label htmlFor="role-name">Tên vai trò *</label>
        <input id="role-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="Ví dụ: Thủ kho ca tối" disabled={pending} /></div>}
      {role && role.assigned > 0 && !readOnly && <p className="form-message warning" role="note">Vai trò đang dùng cho {role.assigned} nhân viên. Thay đổi quyền có hiệu lực ngay với họ.</p>}
      <div className="role-permission-groups">
        {groups.map((group) => {
          const grantable = group.items.filter((item) => item.granted).map((item) => item.code);
          const all = grantable.length > 0 && grantable.every((code) => selected.has(code));
          return <fieldset key={group.id} className="role-permission-group">
            <legend>{readOnly ? group.label : <label className="check-inline"><input type="checkbox" checked={all} disabled={pending || !grantable.length} onChange={(event) => toggle(grantable, event.target.checked)} /> {group.label}</label>}</legend>
            {group.items.map((item) => readOnly ? <p key={item.code} className="role-permission">{item.label}</p>
              : <label key={item.code} className="check-inline role-permission" title={item.granted ? undefined : "Bạn không có quyền này nên không gán được"}>
                <input type="checkbox" checked={selected.has(item.code)} disabled={pending || (!item.granted && !selected.has(item.code))}
                  onChange={(event) => toggle([item.code], event.target.checked)} /> {item.label}</label>)}
          </fieldset>;
        })}
      </div>
      {role && !readOnly && role.assigned === 0 && <label className="check-inline"><input type="checkbox" checked={retire} onChange={(event) => setRetire(event.target.checked)} disabled={pending} /> Ngừng dùng vai trò này</label>}
      {result && result.status !== "SUCCESS" && <p className="form-message" role="alert">{result.message}</p>}
      {!readOnly && <div className="form-actions">
        <span className="muted">{selected.size} quyền</span>
        <button type="button" className="button button-secondary" onClick={() => setOpen(false)} disabled={pending}>Quay lại</button>
        <button type="button" className="button button-primary" onClick={save} disabled={pending || name.trim().length < 2 || (!retire && selected.size === 0)}>
          {pending ? "Đang lưu..." : result?.status === "UNKNOWN" ? "Lưu lại đúng thao tác" : role ? "Lưu vai trò" : "Tạo vai trò"}</button>
      </div>}
    </Dialog>}
  </>;
}
