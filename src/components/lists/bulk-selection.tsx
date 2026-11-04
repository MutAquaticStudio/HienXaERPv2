"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { BULK_CLEAR, BULK_LIMIT, bulkConfirmText, bulkNouns, type BulkFieldChoice, type BulkKind, type BulkOperation, type BulkOutcome } from "@/modules/catalog/bulk";
import { bulkCatalogAction, exportCatalogCsvAction } from "@/modules/catalog/bulk-actions";
import { assignSupplierToMaterialsAction } from "@/modules/pricing/purchase-book-actions";

type Selection = { selected: ReadonlySet<string>; toggle: (id: string) => void; setMany: (ids: readonly string[], on: boolean) => void; clear: () => void };
const SelectionContext = createContext<Selection | null>(null);
function useSelection() {
  const value = useContext(SelectionContext);
  if (!value) throw new Error("BulkSelection is missing");
  return value;
}

/** Holds the rows chosen on a list. Remount it (via `key`) when the page or filter changes so a choice never leaks. */
export function BulkSelection({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const value = useMemo<Selection>(() => ({
    selected,
    toggle: (id) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }),
    setMany: (ids, on) => setSelected((current) => { const next = new Set(current); for (const id of ids) if (on) next.add(id); else next.delete(id); return next; }),
    clear: () => setSelected(new Set()),
  }), [selected]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

/** Checkbox in a row; sits above the row's whole-row link. */
export function BulkRowCheckbox({ id, label }: { id: string; label: string }) {
  const { selected, toggle } = useSelection();
  return <label className="row-select-box"><input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} aria-label={`Chọn ${label}`} /></label>;
}

/** Header checkbox: chooses or clears every row on this page. */
export function BulkPageCheckbox({ ids }: { ids: readonly string[] }) {
  const { selected, setMany } = useSelection();
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  const some = ids.some((id) => selected.has(id));
  return <label className="row-select-box"><input type="checkbox" checked={all} disabled={!ids.length}
    ref={(input) => { if (input) input.indeterminate = some && !all; }} onChange={() => setMany(ids, !all)} aria-label="Chọn tất cả trên trang này" /></label>;
}

function download(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** A catalog change, or (D61, materials) assigning one supplier to every chosen material. */
type Pending = { operation: BulkOperation; confirm: string; assign?: undefined } | { operation?: undefined; confirm: string; assign: { supplierId: string; supplierName: string; operationId: string } };

/**
 * The bar shown once a row is chosen: how many, "choose all matching the filter" (up to 200), then one change for all
 * of them (asked once more before it runs) or an export. Each record is saved through its own audited command.
 */
export function BulkActionBar({ kind, pageIds, matchingIds, total, fields, activeLabels, canDelete = true, assignSuppliers }: {
  kind: BulkKind;
  pageIds: readonly string[];
  /** Every record matching the filter, when there are at most 200 of them. */
  matchingIds?: readonly string[];
  total: number;
  fields: readonly BulkFieldChoice[];
  activeLabels: { stop: string; restart: string };
  canDelete?: boolean;
  /** D61: suppliers offered by "Gán nhà cung cấp" (materials only, for those who manage purchase prices). */
  assignSuppliers?: readonly { id: string; name: string }[];
}) {
  const router = useRouter();
  const { selected, setMany, clear } = useSelection();
  const [action, setAction] = useState("");
  const [value, setValue] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkOutcome | null>(null);
  const [message, setMessage] = useState("");
  const noun = bulkNouns[kind];
  const ids = [...selected];
  const field = fields.find((item) => `set:${item.field}` === action);
  const pageChosen = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const canChooseAll = Boolean(matchingIds && matchingIds.length > pageIds.length && pageChosen && selected.size < matchingIds.length);

  if (!selected.size && !result) return null;

  function prepare() {
    setMessage("");
    if (!action) { setMessage("Chọn thao tác cần làm."); return; }
    if (ids.length > BULK_LIMIT) { setMessage(`Mỗi lần tối đa ${BULK_LIMIT} ${noun}.`); return; }
    let operation: BulkOperation;
    let valueLabel: string | undefined;
    if (action === "assign-supplier") {
      const supplier = assignSuppliers?.find((item) => item.id === value);
      if (!supplier) { setMessage("Chọn nhà cung cấp."); return; }
      setPending({ confirm: `Gán ${ids.length} ${noun} cho ${supplier.name}? Vật tư sẽ hiện trong Giá mua của nhà cung cấp này (đơn vị mua theo NCC khác đang dùng, hoặc đơn vị cơ bản). Vật tư ngừng mua được bỏ qua; giá nhập sau ở Giá mua.`,
        assign: { supplierId: supplier.id, supplierName: supplier.name, operationId: crypto.randomUUID() } });
      return;
    }
    if (action === "delete") operation = { type: "delete" };
    else if (action === "stop" || action === "restart") operation = { type: "active", active: action === "restart" };
    else if (field) {
      if (field.control === "days" && !/^\d{1,3}$/.test(value.trim())) { setMessage("Nhập số ngày từ 0 đến 365."); return; }
      if (field.control === "boolean" && value !== "true" && value !== "false") { setMessage("Chọn Có hoặc Không."); return; }
      if (field.control === "option" && !field.options?.some((option) => option.value === value)) { setMessage(`Chọn ${field.label.toLowerCase()}.`); return; }
      operation = { type: "set", field: field.field, value: field.control === "boolean" ? value === "true" : value === BULK_CLEAR ? "" : value };
      valueLabel = field.control === "option" ? field.options?.find((option) => option.value === value)?.label
        : field.control === "boolean" ? (value === "true" ? "Có" : "Không") : `${value.trim()} ngày`;
    } else return;
    setPending({ operation, confirm: bulkConfirmText(kind, operation, ids.length, valueLabel) });
  }

  async function run() {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.assign) {
        const outcome = await assignSupplierToMaterialsAction({ operationId: pending.assign.operationId, supplierId: pending.assign.supplierId, materialIds: ids });
        setResult(outcome);
        // An unclear outcome keeps the same operation, so pressing Xác nhận again only checks; nothing is assigned twice.
        if (outcome.outcomeUnknown) return;
        setPending(null);
        if (outcome.changed > 0) { clear(); setAction(""); setValue(""); router.refresh(); }
        return;
      }
      const outcome = await bulkCatalogAction({ kind, ids, operation: pending.operation });
      setResult(outcome);
      setPending(null);
      if (outcome.changed > 0) { clear(); setAction(""); setValue(""); router.refresh(); }
    } catch {
      setResult({ status: "FAILED", message: "Chưa rõ kết quả do mất kết nối. Tải lại trang để kiểm tra trước khi làm lại.", changed: 0, unchanged: 0, failed: [] });
      setPending(null);
    } finally { setBusy(false); }
  }

  async function exportSelected() {
    setMessage("");
    setBusy(true);
    try {
      const file = await exportCatalogCsvAction({ kind, ids });
      if (file.status === "SUCCESS") download(file.csv, file.filename); else setMessage(file.message);
    } catch { setMessage("Không xuất được file. Thử lại."); }
    finally { setBusy(false); }
  }

  return <div className="bulk-bar" role="region" aria-label="Thao tác với các dòng đã chọn">
    {selected.size > 0 && <>
      <div className="bulk-bar-head">
        <strong>Đã chọn {selected.size} {noun}</strong>
        {canChooseAll && <button type="button" className="code-link button-plain" onClick={() => setMany(matchingIds!, true)}>Chọn tất cả {matchingIds!.length} {noun} theo bộ lọc</button>}
        {!matchingIds && total > pageIds.length && pageChosen && <span className="muted">Bộ lọc có {total} {noun}; mỗi lần chọn tối đa {BULK_LIMIT}. Thu hẹp bộ lọc để chọn hết.</span>}
        <button type="button" className="code-link button-plain" onClick={() => { clear(); setPending(null); setMessage(""); }}>Bỏ chọn</button>
      </div>
      <div className="bulk-bar-actions">
        <label>Thao tác<select value={action} onChange={(event) => { setAction(event.target.value); setValue(""); setPending(null); setMessage(""); }} disabled={busy}>
          <option value="">Chọn thao tác…</option>
          {fields.map((item) => <option key={item.field} value={`set:${item.field}`}>Đổi {item.label.toLowerCase()}</option>)}
          <option value="stop">{activeLabels.stop}</option>
          <option value="restart">{activeLabels.restart}</option>
          {assignSuppliers && <option value="assign-supplier">Gán nhà cung cấp</option>}
          {canDelete && <option value="delete">Xóa hẳn</option>}
        </select></label>
        {field?.control === "option" && <label>{field.label}<select value={value} onChange={(event) => { setValue(event.target.value); setPending(null); }} disabled={busy}>
          <option value="">Chọn…</option>
          {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>}
        {action === "assign-supplier" && <label>Nhà cung cấp<select value={value} onChange={(event) => { setValue(event.target.value); setPending(null); }} disabled={busy}>
          <option value="">{assignSuppliers?.length ? "Chọn nhà cung cấp…" : "Chưa có nhà cung cấp đang dùng"}</option>
          {assignSuppliers?.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </select></label>}
        {field?.control === "days" && <label>{field.label}<input type="number" min={0} max={365} step={1} inputMode="numeric" value={value} onChange={(event) => { setValue(event.target.value); setPending(null); }} disabled={busy} /></label>}
        {field?.control === "boolean" && <label>{field.label}<select value={value} onChange={(event) => { setValue(event.target.value); setPending(null); }} disabled={busy}>
          <option value="">Chọn…</option><option value="true">Có</option><option value="false">Không</option>
        </select></label>}
        <button type="button" className={`button ${action === "delete" ? "button-danger" : "button-primary"} button-compact`} onClick={prepare} disabled={busy || !action}>Áp dụng</button>
        <button type="button" className="button button-secondary button-compact" onClick={exportSelected} disabled={busy}>Xuất Excel (CSV)</button>
      </div>
      {message && <p className="form-message error" role="alert">{message}</p>}
      {pending && <div className="bulk-confirm" role="alertdialog" aria-label="Xác nhận thao tác hàng loạt">
        <p>{pending.confirm}</p>
        <div className="action-cluster">
          <button type="button" className={`button ${pending.operation?.type === "delete" ? "button-danger" : "button-primary"} button-compact`} onClick={run} disabled={busy}>{busy ? "Đang thực hiện…" : "Xác nhận"}</button>
          <button type="button" className="button button-secondary button-compact" onClick={() => setPending(null)} disabled={busy}>Hủy</button>
        </div>
      </div>}
    </>}
    {result && <div className={`form-message ${result.status === "SUCCESS" ? "success" : result.status === "PARTIAL" ? "warning" : "error"} bulk-result`} role="status">
      <p>{result.message}</p>
      {result.failed.length > 0 && <ul>{result.failed.slice(0, 20).map((item, index) => <li key={`${item.code}-${index}`}><strong>{item.code}</strong>: {item.reason}</li>)}
        {result.failed.length > 20 && <li>… và {result.failed.length - 20} dòng khác</li>}</ul>}
      <button type="button" className="code-link button-plain" onClick={() => setResult(null)}>Đóng thông báo</button>
    </div>}
  </div>;
}
