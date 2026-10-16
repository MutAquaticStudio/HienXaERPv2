"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { CatalogEditor, type Options } from "./editor";
import { catalogs } from "./fields";
import { catalogChoiceLabel } from "./presentation";

type Row = Record<string, unknown>;
type Saved = { id: string; message: string };
type EditorProps = { kind: string; options: Options; permissions: readonly string[]; initial?: Record<string, string> };

const lower = (title: string) => title.charAt(0).toLowerCase() + title.slice(1);

/** One catalog record (or a new one) edited in a popup; the page behind keeps its place. */
export function CatalogDialog({ kind, record, options, permissions, initial, scope, onClose, onSaved }: EditorProps & {
  record?: Row; scope: string; onClose: () => void; onSaved: (saved: Saved) => void;
}) {
  const [operationId] = useState(() => crypto.randomUUID());
  const title = catalogs[kind].title;
  const name = record ? String(record.name ?? record.display_name ?? record.code ?? "") : "";
  return <Dialog size="lg" eyebrow={record ? "Sửa" : "Thêm mới"} title={record ? `${title}${name ? ` · ${name}` : ""}` : `Thêm ${lower(title)}`} onClose={onClose}
    description="Ngừng sử dụng thay vì xóa; lịch sử chứng từ không thay đổi.">
    <CatalogEditor kind={kind} record={record} options={options} permissions={permissions} initial={initial} operationId={operationId} scope={scope}
      className="catalog-dialog-form" onSaved={onSaved} />
  </Dialog>;
}

/** "+ Thêm …" button that creates a catalog record in a popup, without leaving the list page. */
export function CatalogCreateButton({ label, scope, className = "button button-primary", ...editor }: EditorProps & { label: string; scope: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState("");
  return <>
    <button type="button" className={className} onClick={() => { setSaved(""); setOpen(true); }}>{label}</button>
    {saved && <p className="form-message success catalog-saved" role="status">{saved}</p>}
    {open && <CatalogDialog {...editor} scope={scope} onClose={() => setOpen(false)} onSaved={(result) => { setSaved(result.message); setOpen(false); }} />}
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
export function CatalogTable({ kind, rows, options, permissions, scopePrefix, openId, openNew = false, initial }: {
  kind: string; rows: Row[]; options: Options; permissions: readonly string[]; scopePrefix: string; openId?: string;
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
    {editing && <CatalogDialog kind={kind} record={editing.record} options={options} permissions={permissions} initial={editing.record ? undefined : initial}
      scope={`${scopePrefix}:${kind}:${String(editing.record?.id ?? "NEW")}`} onClose={() => setEditing(null)}
      onSaved={(result) => { setSaved(result.message); setEditing(null); }} />}
  </section>;
}
