"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type KeyboardEvent } from "react";
import { NumberEntry } from "@/components/documents/editor/number-entry";
import { Dialog } from "@/components/ui/dialog";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatQuantity } from "@/lib/core/quantity";
import { decimalForEditing, normalizeDecimalInput } from "@/lib/core/vn-number";
import { cancelStockCountAction, saveStockCountSheetAction, type StockCountSheetResult } from "@/modules/inventory/stock-count-actions";
import { entryOf, needsUnitCost, sheetLines, sheetSummary, varianceOf, type SheetEntry, type SheetRow } from "@/modules/inventory/stock-count-sheet";

type View = "all" | "uncounted" | "variance" | "match";
type Props = {
  countId: string;
  version: number;
  open: boolean;
  rows: SheetRow[];
  /** Active materials with no stock in this warehouse, which can be added when found on the floor. */
  extraMaterials: { id: string; code: string; name: string; symbol: string }[];
  can: { count: boolean; approve: boolean; cost: boolean };
};

const newId = () => crypto.randomUUID();
const signed = (value: string) => (value.startsWith("-") ? "−" + formatQuantity(value.slice(1)) : "+" + formatQuantity(value));

/**
 * Count sheet (FB2 Đợt 5, KiotViet style): every material of the warehouse with its book quantity, counts typed in a
 * column, variance shown as it is typed. "Lưu tạm" keeps the count open; "Hoàn thành & cân bằng kho" saves and posts the
 * adjustments after a review; "Hủy phiếu" closes it without touching stock.
 */
export function StockCountSheet({ countId, version, open, rows: initialRows, extraMaterials, can }: Props) {
  const router = useRouter();
  const editable = open && can.count;
  const [added, setAdded] = useState<SheetRow[]>([]);
  const [typed, setTyped] = useState<Record<string, SheetEntry>>({});
  const [sharedReason, setSharedReason] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("all");
  const [showProblems, setShowProblems] = useState(false);
  const [result, setResult] = useState<StockCountSheetResult | null>(null);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [ops, setOps] = useState(() => ({ save: newId(), approve: newId(), cancel: newId() }));
  const [dialog, setDialog] = useState<"complete" | "cancel" | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [pending, startTransition] = useTransition();

  const rows = useMemo(() => [...initialRows, ...added.filter((row) => !initialRows.some((item) => item.materialId === row.materialId))], [initialRows, added]);
  const currentVersion = Math.max(version, savedVersion ?? 0);
  const check = useMemo(() => sheetLines(rows, typed, sharedReason), [rows, typed, sharedReason]);
  const summary = useMemo(() => sheetSummary(rows, typed), [rows, typed]);
  const problemCount = Object.keys(check.problems).length;
  const addable = extraMaterials.filter((item) => !rows.some((row) => row.materialId === item.id));
  const term = query.trim().toLocaleLowerCase("vi");
  const visible = rows.filter((row) => {
    if (term && !`${row.code} ${row.name}`.toLocaleLowerCase("vi").includes(term)) return false;
    const variance = varianceOf(row, entryOf(row, typed[row.materialId]).counted);
    return view === "all" || (view === "uncounted" ? !variance : view === "variance" ? !!variance && !variance.isZero() : !!variance && variance.isZero());
  });

  const setEntry = (materialId: string, patch: SheetEntry) => setTyped((all) => ({ ...all, [materialId]: { ...all[materialId], ...patch } }));
  const nextOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const inputs = [...document.querySelectorAll<HTMLInputElement>("input[data-count-entry]")];
    inputs[inputs.indexOf(event.currentTarget) + 1]?.focus();
  };

  function save(approve: boolean) {
    if (pending) return;
    if (problemCount) { setShowProblems(true); setResult({ status: "FAILED", message: `Còn ${problemCount} dòng cần sửa (được đánh dấu đỏ).` }); return; }
    if (!check.lines.length && !approve) { setResult({ status: "FAILED", message: "Chưa có số đếm mới để lưu." }); return; }
    startTransition(async () => {
      let outcome: StockCountSheetResult;
      try {
        outcome = await saveStockCountSheetAction({ operationId: ops.save, stockCountId: countId, version: currentVersion, lines: check.lines, approveOperationId: approve ? ops.approve : null });
      } catch {
        outcome = { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra; hệ thống không ghi trùng." };
      }
      setResult(outcome);
      // An unknown outcome is retried with the very same command (same ids, same version) so the database replays it.
      if (outcome.status === "UNKNOWN") return;
      if (outcome.version) setSavedVersion(outcome.version);
      setOps({ save: newId(), approve: newId(), cancel: ops.cancel });
      setShowProblems(false);
      if (outcome.status === "SUCCESS") setDialog(null);
      if (outcome.status === "SUCCESS" || outcome.version) router.refresh();
    });
  }

  function cancel() {
    if (pending) return;
    startTransition(async () => {
      let outcome: StockCountSheetResult;
      try {
        outcome = await cancelStockCountAction({ operationId: ops.cancel, stockCountId: countId, version: currentVersion, reason: cancelReason.trim() });
      } catch {
        outcome = { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra." };
      }
      setResult(outcome);
      if (outcome.status === "UNKNOWN") return;
      setOps((current) => ({ ...current, cancel: newId() }));
      if (outcome.status === "SUCCESS") { setDialog(null); router.refresh(); }
    });
  }

  const views: [View, string, number][] = [
    ["all", "Tất cả", rows.length],
    ["uncounted", "Chưa đếm", rows.length - summary.counted],
    ["variance", "Lệch", summary.increase + summary.decrease],
    ["match", "Khớp", summary.match],
  ];
  const value = (amount: string) => formatVnd(vnd(amount));

  return <section className="card stock-count-sheet">
    <div className="section-head stock-count-toolbar">
      <label className="stock-count-search">Tìm trong phiếu<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mã hoặc tên vật tư" /></label>
      <div className="segmented" role="group" aria-label="Lọc dòng kiểm">
        {views.map(([id, label, count]) => <button key={id} type="button" className={view === id ? "active" : undefined} aria-pressed={view === id} onClick={() => setView(id)}>{label} <span className="detail-tab-count">{count}</span></button>)}
      </div>
      {editable && addable.length > 0 && <label className="stock-count-add">Thêm vật tư khác
        <select value="" onChange={(event) => {
          const item = addable.find((row) => row.id === event.target.value);
          if (item) setAdded((all) => [...all, { materialId: item.id, code: item.code, name: item.name, symbol: item.symbol, book: "0", recorded: null, averageCost: null }]);
        }}><option value="">Chọn vật tư chưa có trong kho...</option>{addable.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>}
    </div>
    <div className="table-wrap"><table className="stock-count-table">
      <thead><tr><th scope="col">Vật tư</th><th scope="col" className="numeric">Tồn sổ sách</th><th scope="col" className="numeric">Thực tế</th>
        <th scope="col" className="numeric">Lệch</th>{can.cost && <th scope="col" className="numeric">Giá trị lệch</th>}<th scope="col">Ghi chú</th></tr></thead>
      <tbody>{visible.map((row) => {
        const entry = entryOf(row, typed[row.materialId]);
        const variance = varianceOf(row, entry.counted);
        const costNeeded = needsUnitCost(row, variance) || !!entry.unitCost;
        const typedCost = entry.unitCost.trim() ? normalizeDecimalInput(entry.unitCost) : null;
        const cost = variance?.gt(0) ? typedCost ?? row.averageCost : row.averageCost;
        const problem = showProblems ? check.problems[row.materialId] : undefined;
        return <tr key={row.materialId} className={problem ? "row-problem" : variance && !variance.isZero() ? "row-variance" : undefined}>
          <td data-label="Vật tư"><strong>{row.name}</strong><small className="table-subline mono">{row.code}</small>{problem && <small className="field-error" role="alert">{problem}</small>}</td>
          <td className="numeric mono" data-label="Tồn sổ sách">{formatQuantity(row.book)} {row.symbol}</td>
          <td className="numeric" data-label="Thực tế">{editable
            ? <span className="unit-ratio"><NumberEntry data-count-entry="" aria-label={`Thực tế ${row.name}`} inputMode="decimal" value={entry.counted} normalize={normalizeDecimalInput} display={decimalForEditing}
                placeholder="Chưa đếm" onKeyDown={nextOnEnter} onValue={(next) => setEntry(row.materialId, { counted: next })} disabled={pending} /><span>{row.symbol}</span></span>
            : entry.counted ? <span className="mono">{formatQuantity(entry.counted)} {row.symbol}</span> : <span className="muted">Chưa đếm</span>}
            {editable && costNeeded && <label className="stock-count-cost">Giá vốn / {row.symbol}
              <NumberEntry aria-label={`Giá vốn ${row.name}`} inputMode="decimal" value={entry.unitCost} normalize={normalizeDecimalInput} display={decimalForEditing} placeholder="₫"
                onValue={(next) => setEntry(row.materialId, { unitCost: next })} disabled={pending} /></label>}</td>
          <td className={`numeric mono${variance?.gt(0) ? " text-success" : variance?.lt(0) ? " text-danger" : ""}`} data-label="Lệch">{variance ? variance.isZero() ? "Khớp" : signed(variance.toFixed()) : "—"}</td>
          {can.cost && <td className="numeric mono" data-label="Giá trị lệch">{variance && !variance.isZero() && cost ? signed(variance.mul(cost).toDecimalPlaces(0).toFixed(0)) + " ₫" : "—"}</td>}
          <td data-label="Ghi chú">{editable && variance && !variance.isZero()
            ? <input aria-label={`Ghi chú ${row.name}`} value={entry.reason} placeholder={sharedReason.trim() ? `Dùng ghi chú chung: ${sharedReason.trim()}` : "Không bắt buộc"} onChange={(event) => setEntry(row.materialId, { reason: event.target.value })} disabled={pending} />
            : entry.reason || <span className="muted">{variance && !variance.isZero() ? "Chưa có" : ""}</span>}</td>
        </tr>;
      })}</tbody>
    </table>{!visible.length && <p className="empty-inline">{rows.length ? "Không có dòng phù hợp bộ lọc." : "Kho chưa có vật tư nào. Thêm vật tư khác để ghi số đếm."}</p>}</div>

    <footer className={`stock-count-footer${open && (can.count || can.approve) ? " stock-count-footer-sticky" : ""}`}>
      <p className="stock-count-summary" aria-live="polite">Đã đếm <strong>{summary.counted}/{summary.total}</strong> · Lệch tăng <strong className="text-success">{summary.increase}</strong>
        {summary.valueVnd && summary.increase > 0 && <> ({value(summary.valueVnd.increase)})</>} · Lệch giảm <strong className="text-danger">{summary.decrease}</strong>
        {summary.valueVnd && summary.decrease > 0 && <> ({value(summary.valueVnd.decrease)})</>} · Khớp {summary.match}</p>
      {editable && <label className="stock-count-shared">Ghi chú chung cho dòng lệch (không bắt buộc)<input value={sharedReason} onChange={(event) => setSharedReason(event.target.value)} placeholder="Ví dụ: Kiểm kê cuối tháng" disabled={pending} /></label>}
      {result && <p className={result.status === "SUCCESS" ? "form-message success" : "form-message"} role={result.status === "SUCCESS" ? "status" : "alert"}>{result.message}</p>}
      {open && (can.count || can.approve) && <div className="form-actions">
        {can.count && <button type="button" className="button button-secondary" onClick={() => { setResult(null); setDialog("cancel"); }} disabled={pending}>Hủy phiếu</button>}
        {can.count && <button type="button" className="button button-secondary" onClick={() => save(false)} disabled={pending}>{pending ? "Đang lưu..." : result?.status === "UNKNOWN" ? "Lưu lại đúng thao tác" : `Lưu tạm${check.lines.length ? ` (${check.lines.length} dòng)` : ""}`}</button>}
        {can.approve && <button type="button" className="button button-primary" disabled={pending || summary.counted === 0}
          onClick={() => { if (problemCount) { setShowProblems(true); setResult({ status: "FAILED", message: `Còn ${problemCount} dòng cần sửa (được đánh dấu đỏ).` }); return; } setResult(null); setDialog("complete"); }}>Hoàn thành & cân bằng kho</button>}
      </div>}
    </footer>

    {dialog === "complete" && <Dialog title="Hoàn thành phiếu kiểm" eyebrow="Cân bằng kho" onClose={() => setDialog(null)}>
      <div className="order-review">
        <dl className="detail-grid">
          <div className="detail-item"><dt>Đã đếm</dt><dd>{summary.counted}/{summary.total} vật tư</dd></div>
          <div className="detail-item"><dt>Khớp</dt><dd>{summary.match}</dd></div>
          <div className="detail-item"><dt>Lệch tăng</dt><dd>{summary.increase}{summary.valueVnd && summary.increase > 0 && ` · ${value(summary.valueVnd.increase)}`}</dd></div>
          <div className="detail-item"><dt>Lệch giảm</dt><dd>{summary.decrease}{summary.valueVnd && summary.decrease > 0 && ` · ${value(summary.valueVnd.decrease)}`}</dd></div>
        </dl>
        <p className="muted">Kho được điều chỉnh theo số thực tế của các dòng đã đếm; vật tư chưa đếm giữ nguyên. Sau khi cân bằng, phiếu bị khóa — muốn sửa phải lập phiếu kiểm mới.</p>
        {summary.decrease > 0 && <p className="muted">Phần hàng thiếu được ghi vào Chi phí thành &quot;Hao hụt kiểm kho&quot; (theo giá vốn), trừ vào lợi nhuận; không trừ tiền quỹ.</p>}
        {result && result.status !== "SUCCESS" && <p className="form-message" role="alert">{result.message}</p>}
        <div className="form-actions">
          <button type="button" className="button button-secondary" onClick={() => setDialog(null)} disabled={pending}>Quay lại</button>
          <button type="button" className="button button-primary" onClick={() => save(true)} disabled={pending}>{pending ? "Đang cân bằng..." : result?.status === "UNKNOWN" ? "Cân bằng lại đúng thao tác" : "Cân bằng kho"}</button>
        </div>
      </div>
    </Dialog>}

    {dialog === "cancel" && <Dialog title="Hủy phiếu kiểm" onClose={() => setDialog(null)} initialFocusId="stock-count-cancel-reason">
      <p className="muted">Phiếu chuyển sang Đã hủy và không thay đổi tồn kho. Số đã đếm vẫn được lưu làm lịch sử.</p>
      <div className="field"><label htmlFor="stock-count-cancel-reason">Ghi chú (không bắt buộc)</label>
        <input id="stock-count-cancel-reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} disabled={pending} placeholder="Ví dụ: Chọn nhầm kho" /></div>
      {result && result.status !== "SUCCESS" && <p className="form-message" role="alert">{result.message}</p>}
      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={() => setDialog(null)} disabled={pending}>Quay lại</button>
        <button type="button" className="button button-danger" onClick={cancel} disabled={pending}>{pending ? "Đang hủy..." : "Hủy phiếu"}</button>
      </div>
    </Dialog>}
  </section>;
}
