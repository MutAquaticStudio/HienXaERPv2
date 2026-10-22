"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { savePriceGroupAction, type PriceGroupResult } from "@/modules/pricing/price-group-actions";

export type PriceGroupRow = { code: string; name: string; active: boolean; customers: number };

function PriceGroupForm({ group, onDone }: { group?: PriceGroupRow; onDone: (message: string) => void }) {
  const router = useRouter();
  const [operationId] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<PriceGroupResult | null>(null);
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const saved = await savePriceGroupAction({ operationId, code: group?.code ?? String(form.get("code") ?? ""), name: String(form.get("name") ?? ""),
          active: group ? form.get("active") === "on" : true });
        setResult(saved);
        if (saved.success) { router.refresh(); onDone(saved.message); }
      } catch {
        setResult({ success: false, outcomeUnknown: true, message: "Chưa xác định được kết quả. Bấm lưu lại đúng thao tác này để kiểm tra; hệ thống không lưu trùng." });
      }
    });
  }
  return <form className="form-grid" onSubmit={submit}>
    <div className="field"><label htmlFor="price-group-code">Mã nhóm *</label>
      <input id="price-group-code" name="code" className="input-code" defaultValue={group?.code} readOnly={!!group} required minLength={2} maxLength={40} autoCapitalize="characters" placeholder="vd SI, DAI_LY" />
      {group && <small className="muted">Mã là định danh của nhóm, không đổi được.</small>}</div>
    <div className="field"><label htmlFor="price-group-name">Tên nhóm *</label><input id="price-group-name" name="name" defaultValue={group?.name} required maxLength={80} placeholder="vd Khách sỉ" /></div>
    {group && <div className="field"><label htmlFor="price-group-active"><input id="price-group-active" name="active" type="checkbox" defaultChecked={group.active} /> Đang dùng</label>
      <small className="muted">Ngừng nhóm: không chọn được cho khách mới và không đặt giá mới; khách đang ở nhóm giữ nguyên.</small></div>}
    {result && !result.success && <p className="form-message field-full" role="status">{result.message}</p>}
    <div className="form-actions field-full"><button className="button button-primary" type="submit" disabled={pending}>{pending ? "Đang lưu..." : result?.outcomeUnknown ? "Lưu lại đúng thao tác" : group ? "Lưu nhóm giá" : "Tạo nhóm giá"}</button></div>
  </form>;
}

/**
 * Customer price groups (D11): "Giá chung" is the retail price every customer gets; groups such as Sỉ or Đại lý get
 * their own prices in the price book. Created and renamed in a popup.
 */
export function PriceGroupList({ groups, canManage }: { groups: PriceGroupRow[]; canManage: boolean }) {
  const [editing, setEditing] = useState<{ group?: PriceGroupRow } | null>(null);
  const [saved, setSaved] = useState("");
  return <section className="card list-main" aria-labelledby="price-groups-title">
    <div className="section-head"><h2 id="price-groups-title">Nhóm giá khách</h2>
      {canManage && <button type="button" className="button button-secondary" onClick={() => { setSaved(""); setEditing({}); }}>+ Nhóm giá</button>}</div>
    <p className="muted card-pad-x">Khách không thuộc nhóm nào dùng giá chung (giá lẻ). Gán nhóm trong hồ sơ khách; đặt giá nhóm ở “Thiết lập giá”.</p>
    {saved && <p className="form-message success catalog-saved" role="status">{saved}</p>}
    {groups.length ? <div className="table-wrap"><table>
      <thead><tr><th scope="col">Mã</th><th scope="col">Tên nhóm</th><th scope="col" className="numeric">Số khách</th><th scope="col">Trạng thái</th>{canManage && <th scope="col"><span className="sr-only">Thao tác</span></th>}</tr></thead>
      <tbody>{groups.map((group) => <tr key={group.code}>
        <td className="mono" data-label="Mã">{group.code}</td><td data-label="Tên nhóm">{group.name}</td>
        <td className="numeric" data-label="Số khách">{group.customers}</td>
        <td data-label="Trạng thái"><StatusBadge tone={group.active ? "success" : "danger"}>{group.active ? "Đang dùng" : "Đã ngừng"}</StatusBadge></td>
        {canManage && <td className="table-actions"><button type="button" className="button button-secondary button-compact" aria-label={`Sửa nhóm ${group.name}`} onClick={() => { setSaved(""); setEditing({ group }); }}>Sửa</button></td>}
      </tr>)}</tbody>
    </table></div> : <p className="empty-inline">Chưa có nhóm giá. Mọi khách đang dùng giá chung.</p>}
    {editing && <Dialog title={editing.group ? `Nhóm giá · ${editing.group.name}` : "Thêm nhóm giá khách"} eyebrow={editing.group ? "Sửa" : "Thêm mới"} onClose={() => setEditing(null)} initialFocusId={editing.group ? "price-group-name" : "price-group-code"}>
      <PriceGroupForm group={editing.group} onDone={(message) => { setSaved(message); setEditing(null); }} />
    </Dialog>}
  </section>;
}
