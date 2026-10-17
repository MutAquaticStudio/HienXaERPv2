"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MaterialUnitsEditor } from "@/components/catalog/material-units-editor";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { deleteCatalogRecordAction, setCatalogActiveAction } from "./actions";
import { CatalogEditor, type Options } from "./editor";
import { catalogs } from "./fields";
import { catalogChoiceLabel } from "./presentation";

type Row = Record<string, unknown>;
type Saved = { id: string; message: string; deleted?: boolean };
type EditorProps = { kind: string; options: Options; permissions: readonly string[]; initial?: Record<string, string> };

const lower = (title: string) => title.charAt(0).toLowerCase() + title.slice(1);

type DialogTab = "info" | "units";

/**
 * One catalog record (or a new one) edited in a popup; the page behind keeps its place. A material also has the
 * "Đơn vị tính & giá" tab; a new material moves there right after it is created.
 */
export function CatalogDialog({ kind, record, options, permissions, initial, scope, onClose, onSaved, initialTab = "info" }: EditorProps & {
  record?: Row; scope: string; onClose: () => void; onSaved: (saved: Saved) => void; initialTab?: DialogTab;
}) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const materialId = kind === "materials" ? (record?.id ? String(record.id) : createdId) : null;
  const [tab, setTab] = useState<DialogTab>(materialId ? initialTab : "info");
  const [unitsOpened, setUnitsOpened] = useState(tab === "units");
  const title = catalogs[kind].title;
  const name = record ? String(record.name ?? record.display_name ?? record.code ?? "") : "";
  const show = (next: DialogTab) => { setTab(next); if (next === "units") setUnitsOpened(true); };
  const saved = kind === "materials" && !record
    ? (result: Saved) => { setCreatedId(result.id); setNotice(`${result.message} Thêm đơn vị bán và giá bên dưới, hoặc bấm “Đóng”.`); show("units"); }
    : onSaved;
  return <Dialog size="lg" eyebrow={record ? "Sửa" : "Thêm mới"} title={record ? `${title}${name ? ` · ${name}` : ""}` : `Thêm ${lower(title)}`} onClose={onClose}
    description={record ? "Xóa được khi chưa có chứng từ liên quan; đã dùng thì ngừng dùng để ẩn khỏi lựa chọn mới." : undefined}>
    {kind === "materials" && <div className="dialog-tabs" role="tablist" aria-label="Phần thông tin vật tư">
      <button type="button" role="tab" aria-selected={tab === "info"} onClick={() => show("info")}>Thông tin</button>
      <button type="button" role="tab" aria-selected={tab === "units"} disabled={!materialId} title={materialId ? undefined : "Lưu vật tư trước để thêm đơn vị bán"} onClick={() => show("units")}>Đơn vị tính & giá</button>
    </div>}
    {notice && <p className="form-message success" role="status">{notice}</p>}
    <div hidden={tab !== "info"}>
      <CatalogEditor kind={kind} record={record} options={options} permissions={permissions} initial={initial} operationId={operationId} scope={scope}
        className="catalog-dialog-form" onSaved={saved} />
    </div>
    {materialId && unitsOpened && <div hidden={tab !== "units"}><MaterialUnitsEditor materialId={materialId} /></div>}
    {record?.id != null && tab === "info" && <CatalogRecordActions kind={kind} record={record}
      onDone={(result) => onSaved({ id: String(record.id), message: result.message, deleted: result.deleted })} />}
  </Dialog>;
}

const recordName = (record: Row) => String(record.name ?? record.display_name ?? record.plate_number ?? record.code ?? "");

/**
 * "Ngừng dùng / Dùng lại" and "Xóa" for a saved record. Deleting asks once more and works only while nothing uses the
 * record; an unclear result keeps the same operation, so pressing again checks instead of acting twice.
 */
export function CatalogRecordActions({ kind, record, onDone }: { kind: string; record: Row; onDone: (result: { message: string; deleted: boolean }) => void }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const statusOperation = useRef<string | null>(null);
  const deleteOperation = useRef<string | null>(null);
  const active = Boolean(record.active);
  const title = lower(catalogs[kind].title);

  async function toggle() {
    statusOperation.current ??= crypto.randomUUID();
    setBusy(true); setMessage("");
    const outcome = await setCatalogActiveAction({ kind, id: String(record.id), active: !active,
      customerId: kind === "sites" ? String(record.customer_id ?? "") || null : null, operationId: statusOperation.current });
    setBusy(false);
    if (outcome.status !== "UNKNOWN") statusOperation.current = null;
    if (outcome.status === "SUCCESS") onDone({ message: outcome.message, deleted: false });
    else setMessage(outcome.message);
  }

  async function remove() {
    deleteOperation.current ??= crypto.randomUUID();
    setBusy(true); setMessage("");
    const outcome = await deleteCatalogRecordAction({ kind, id: String(record.id), operationId: deleteOperation.current });
    setBusy(false);
    if (outcome.status !== "UNKNOWN") deleteOperation.current = null;
    if (outcome.status === "SUCCESS") { onDone({ message: outcome.message, deleted: true }); return; }
    if (outcome.inUse) setConfirming(false);
    setMessage(outcome.message);
  }

  return <section className="catalog-record-actions" aria-label={`Trạng thái và xóa ${title}`}>
    <div className="catalog-record-actions-row">
      <span className="muted">{active ? "Đang dùng" : "Đã ngừng dùng"}</span>
      <button type="button" className="button button-secondary" disabled={busy} onClick={toggle}>{active ? "Ngừng dùng" : "Dùng lại"}</button>
      {kind !== "branches" && !confirming && <button type="button" className="button button-danger" disabled={busy} onClick={() => { setConfirming(true); setMessage(""); }}>Xóa</button>}
    </div>
    {confirming && <div className="catalog-delete-confirm" role="group" aria-label={`Xác nhận xóa ${title}`}>
      <p>Xóa hẳn <strong>{recordName(record) || title}</strong>? Chỉ xóa được khi chưa có đơn, phiếu, công nợ hay tồn kho liên quan; đơn vị bán, giá và ngưỡng tồn của riêng bản ghi này sẽ xóa theo.</p>
      <div className="form-actions">
        <button type="button" className="button button-danger" disabled={busy} onClick={remove}>{busy ? "Đang xóa..." : "Xóa hẳn"}</button>
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => setConfirming(false)}>Không xóa</button>
      </div>
    </div>}
    {message && <p className="form-message" role="alert">{message}</p>}
  </section>;
}

/** "+ Thêm …" button that creates a catalog record in a popup, without leaving the list page. */
export function CatalogCreateButton({ label, scope, className = "button button-primary", ...editor }: EditorProps & { label: string; scope: string; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState("");
  return <>
    <button type="button" className={className} onClick={() => { setSaved(""); setOpen(true); }}>{label}</button>
    {saved && <p className="form-message success catalog-saved" role="status">{saved}</p>}
    {open && <CatalogDialog {...editor} scope={scope} onClose={() => setOpen(false)} onSaved={(result) => { setSaved(result.message); setOpen(false); router.refresh(); }} />}
  </>;
}

const LIST_AFTER_DELETE: Record<string, string> = { customers: "/admin/customers", suppliers: "/admin/suppliers", materials: "/admin/products" };

/** "Sửa" button that edits one catalog record in a popup on its own detail page, then shows the saved state. */
export function CatalogEditButton({ label, record, scope, className = "button button-secondary", ...editor }: EditorProps & { label: string; record: Row; scope: string; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState("");
  return <>
    <button type="button" className={className} onClick={() => { setSaved(""); setOpen(true); }}>{label}</button>
    {saved && <p className="form-message success catalog-saved" role="status">{saved}</p>}
    {open && <CatalogDialog {...editor} record={record} scope={scope} onClose={() => setOpen(false)} onSaved={(result) => {
      // A deleted record's own page no longer exists: go back to its list.
      if (result.deleted) { router.push(LIST_AFTER_DELETE[editor.kind] ?? "/admin"); return; }
      setSaved(result.message); setOpen(false); router.refresh();
    }} />}
  </>;
}

function cellValue(kind: string, key: string, row: Row, options: Options) {
  const field = catalogs[kind].fields.find((item) => item.key === key);
  const value = row[key];
  if (value === null || value === undefined || value === "") return <span className="muted">—</span>;
  if (field?.type === "checkbox") return value ? "Có" : "Không";
  if (field?.options) return options[field.options]?.find((option) => option.id === value)?.name ?? <span className="muted">—</span>;
  if (field?.choices) return catalogChoiceLabel(String(value));
  return String(value);
}

/**
 * KiotViet-style catalog list: compact table, "Thêm" and "Sửa" open the editor in a popup.
 * `openId` (from `?id=`) opens that record directly, e.g. from "Sửa vật tư" on a detail page.
 */
export function CatalogTable({ kind, rows, options, permissions, scopePrefix, openId, openTab, openNew = false, initial }: {
  kind: string; rows: Row[]; options: Options; permissions: readonly string[]; scopePrefix: string; openId?: string; openTab?: DialogTab;
  /** Open the create popup straight away (e.g. "Thêm công trình" from a customer). */
  openNew?: boolean; initial?: Record<string, string>;
}) {
  const config = catalogs[kind];
  const visible = new Set(config.fields.filter((field) => !field.permission || permissions.includes(field.permission)).map((field) => field.key));
  const columns = config.list.filter((key) => visible.has(key));
  const [editing, setEditing] = useState<{ record?: Row } | null>(() => {
    const record = openId ? rows.find((row) => row.id === openId) : undefined;
    return record ? { record } : openNew ? {} : null;
  });
  const [saved, setSaved] = useState("");
  const label = (key: string) => config.fields.find((field) => field.key === key)?.label.replace(/\s*\(.*\)$/, "") ?? key;
  return <section className="card list-main">
    <div className="section-head"><h2>{rows.length} {lower(config.title)}</h2>
      <button type="button" className="button button-primary" onClick={() => { setSaved(""); setEditing({}); }}>+ Thêm {lower(config.title)}</button></div>
    {saved && <p className="form-message success catalog-saved" role="status">{saved}</p>}
    {rows.length ? <div className="table-wrap"><table>
      <thead><tr>{columns.map((key) => <th key={key} scope="col">{label(key)}</th>)}<th scope="col">Trạng thái</th><th scope="col"><span className="sr-only">Thao tác</span></th></tr></thead>
      <tbody>{rows.map((row) => <tr key={String(row.id)}>
        {columns.map((key, index) => <td key={key} data-label={label(key)} className={key === "code" ? "mono" : undefined}>
          {index === 1 || (columns.length === 1 && index === 0)
            ? <button type="button" className="link-button" onClick={() => setEditing({ record: row })}>{cellValue(kind, key, row, options)}</button>
            : cellValue(kind, key, row, options)}
        </td>)}
        <td data-label="Trạng thái"><StatusBadge tone={row.active ? "success" : "danger"}>{row.active ? "Đang dùng" : "Đã ngừng"}</StatusBadge></td>
        <td className="table-actions"><button type="button" className="button button-secondary button-compact" aria-label={`Sửa ${String(row.code ?? row.name ?? "")}`} onClick={() => setEditing({ record: row })}>Sửa</button></td>
      </tr>)}</tbody>
    </table></div> : <p className="empty-inline">Chưa có {lower(config.title)} phù hợp.</p>}
    {editing && <CatalogDialog kind={kind} record={editing.record} initialTab={editing.record?.id === openId ? openTab : undefined} options={options} permissions={permissions} initial={editing.record ? undefined : initial}
      scope={`${scopePrefix}:${kind}:${String(editing.record?.id ?? "NEW")}`} onClose={() => setEditing(null)}
      onSaved={(result) => { setSaved(result.message); setEditing(null); }} />}
  </section>;
}
