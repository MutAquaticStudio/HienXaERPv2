"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { MoneyInput } from "@/components/ui/money-input";
import { formatVnd, vnd } from "@/lib/core/money";
import { adjustPrice, isValidAdjustment, priceChange, ROUNDING_STEPS, type AdjustMode, type RoundingStep } from "@/modules/pricing/bulk-adjust";
import { savePurchasePriceBookAction, setSupplierMaterialsAction, type PurchaseBookResult } from "@/modules/pricing/purchase-book-actions";

export type PurchaseBookRow = {
  /** supplier:material — one row per material a supplier sells. */
  key: string; supplierId: string; supplierName: string; materialId: string; code: string; name: string; group: string;
  uomId: string; uom: string;
  currentVnd: string | null; since: string | null; otherUnits: string[];
  /** Selling price in the same unit, for the margin; null when there is none or it may not be read. */
  saleVnd: string | null;
  /** In the overview: the cheapest current price of this material in this unit among its suppliers. */
  cheapest: boolean;
  target: { ruleId: string; version: number } | null;
};
export type AssignCandidate = { materialId: string; code: string; name: string; units: { id: string; symbol: string }[] };

const money = (value: bigint) => formatVnd(vnd(value.toString()));
const digitsText = (value: string) => new Intl.NumberFormat("vi-VN").format(BigInt(value));

function margin(sale: string | null, cost: bigint | null) {
  if (!sale || cost === null) return null;
  const price = BigInt(sale);
  if (price <= 0n) return null;
  return Math.round(Number(price - cost) * 1000 / Number(price)) / 10;
}

/**
 * D61 Bảng giá mua: one supplier's materials (or every supplier, one row per material × supplier) — edit many prices,
 * raise or lower the chosen ones by % or an amount, save them together for one day. The same day again replaces that
 * day's price. Purchase orders keep reading these prices as before.
 */
export function PurchasePriceBookEditor({ rows, operationId, today, canManage, showSale, supplier, candidates }: {
  rows: PurchaseBookRow[]; operationId: string; today: string; canManage: boolean; showSale: boolean;
  /** The supplier chosen in the filter; absent in the overview. */
  supplier?: { id: string; name: string; assigned: number; missing: number };
  candidates: AssignCandidate[];
}) {
  const router = useRouter();
  const overview = !supplier;
  const [next, setNext] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<AdjustMode>("percent");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<RoundingStep>(1000);
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [result, setResult] = useState<PurchaseBookResult | null>(null);
  const [notice, setNotice] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [pending, startTransition] = useTransition();

  const changes = useMemo(() => rows.flatMap((row) => {
    const digits = next[row.key];
    if (!digits || (row.currentVnd !== null && BigInt(digits) === BigInt(row.currentVnd))) return [];
    return [{ row, price: BigInt(digits) }];
  }), [rows, next]);
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.key));

  function applyAdjustment() {
    let applied = 0, skipped = 0;
    const updates: Record<string, string> = {};
    for (const row of rows) {
      if (!selected.has(row.key)) continue;
      const value = row.currentVnd === null ? null : adjustPrice(BigInt(row.currentVnd), mode, amount, step);
      if (value === null) { skipped += 1; continue; }
      updates[row.key] = value.toString();
      applied += 1;
    }
    setNext((current) => ({ ...current, ...updates }));
    setResult(null);
    setNotice(`Đã tính giá mới cho ${applied} dòng${skipped ? `; bỏ qua ${skipped} dòng chưa có giá hiện tại hoặc ra giá không hợp lệ` : ""}. Kiểm tra cột chênh lệch trước khi lưu.`);
  }

  function save() {
    if (!changes.length || pending) return;
    const items = changes.map(({ row, price }) => ({ supplierId: row.supplierId, materialId: row.materialId, uomId: row.uomId, costVnd: price.toString(),
      ...(row.target ? { supersedesId: row.target.ruleId, expectedVersion: row.target.version } : {}) }));
    startTransition(async () => {
      try {
        const saved = await savePurchasePriceBookAction({ operationId, effectiveDate, items });
        setResult(saved);
        if (saved.success) { setNext({}); setSelected(new Set()); setNotice(""); router.refresh(); }
      } catch {
        setResult({ success: false, outcomeUnknown: true, message: "Chưa xác định kết quả lưu. Giữ nguyên nội dung và bấm Lưu lại; hệ thống không lưu trùng." });
      }
    });
  }

  return <div className="price-book purchase-book">
    {supplier && <section className="card card-pad purchase-book-supplier" aria-label="Nhà cung cấp đang chọn">
      <div className="purchase-book-supplier-head"><strong>{supplier.name}</strong>
        <span className="scope-chip">{supplier.assigned} vật tư đã gán</span>
        {supplier.missing > 0 && <span className="purchase-book-chip-warn">{supplier.missing} chưa có giá</span>}</div>
      {canManage && <button type="button" className="button button-secondary" onClick={() => setAssigning(true)}>+ Gán vật tư cho NCC này</button>}
    </section>}
    {overview && <p className="purchase-book-overview-note">Tổng quan: mỗi dòng là một vật tư của một nhà cung cấp. Vật tư có nhiều nhà cung cấp đứng cạnh nhau; “Rẻ nhất” là giá hệ thống chọn khi tự phân nguồn (cùng đơn vị).</p>}

    {canManage && <section className="card card-pad price-book-tools" aria-label="Điều chỉnh hàng loạt">
      <span className="price-book-selection">{selected.size} dòng đã chọn</span>
      <label>Cách điều chỉnh<select value={mode} onChange={(event) => setMode(event.target.value as AdjustMode)}><option value="percent">Tăng/giảm theo %</option><option value="amount">Tăng/giảm số tiền</option></select></label>
      <label>{mode === "percent" ? "Phần trăm (âm để giảm)" : "Số tiền ₫ (âm để giảm)"}<input inputMode="decimal" value={amount} placeholder={mode === "percent" ? "Ví dụ 5 hoặc -3" : "Ví dụ 2000 hoặc -1000"} onChange={(event) => setAmount(event.target.value)} /></label>
      <label>Làm tròn<select value={step} onChange={(event) => setStep(Number(event.target.value) as RoundingStep)}>{ROUNDING_STEPS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <button type="button" className="button button-secondary" disabled={!selected.size || !isValidAdjustment(mode, amount)} onClick={applyAdjustment}>Áp dụng cho dòng đã chọn</button>
      {notice && <p className="muted price-book-notice" role="status">{notice}</p>}
    </section>}

    <section className="card list-main">
      <div className="table-wrap"><table className={`price-book-table purchase-book-table${canManage ? " price-book-selectable" : ""}`}>
        <thead><tr>
          {canManage && <th><input type="checkbox" aria-label="Chọn tất cả" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.key)))} /></th>}
          <th>Mã</th><th>Tên vật tư</th>{overview && <th>Nhà cung cấp</th>}<th>ĐVT mua</th>
          {showSale && <th className="numeric">Giá bán</th>}<th className="numeric">Giá mua hiện tại</th>
          {canManage && <><th className="numeric">Giá mới</th><th className="numeric">Chênh lệch</th></>}{showSale && <th className="numeric">Lãi gộp</th>}
        </tr></thead>
        <tbody>{rows.map((row) => {
          const digits = next[row.key] ?? "";
          const price = digits ? BigInt(digits) : null;
          const current = row.currentVnd === null ? null : BigInt(row.currentVnd);
          const change = price !== null ? priceChange(current, price) : null;
          const changed = price !== null && (current === null || price !== current);
          const gross = margin(row.saleVnd, price ?? current);
          return <tr key={row.key} className={changed ? "price-book-changed" : undefined}>
            {canManage && <td className="price-book-pick"><input type="checkbox" aria-label={`Chọn ${row.name}${overview ? ` của ${row.supplierName}` : ""}`} checked={selected.has(row.key)}
              onChange={() => setSelected((value) => { const copy = new Set(value); if (copy.has(row.key)) copy.delete(row.key); else copy.add(row.key); return copy; })} /></td>}
            <td className="mono price-book-code" data-label="Mã">{row.code}</td>
            <td className="price-book-name" data-label="Tên vật tư"><strong>{row.name}</strong><small className="table-subline">{row.group}</small></td>
            {overview && <td data-label="Nhà cung cấp">{row.supplierName}{row.cheapest && <span className="purchase-book-cheapest">Rẻ nhất</span>}</td>}
            <td data-label="ĐVT mua">{row.uom}</td>
            {showSale && <td className="numeric mono" data-label="Giá bán">{row.saleVnd ? formatVnd(vnd(row.saleVnd)) : "—"}</td>}
            <td className="numeric mono" data-label="Giá mua hiện tại">{row.currentVnd ? formatVnd(vnd(row.currentVnd)) : <span className="purchase-book-missing">Chưa có giá</span>}
              <small className="table-subline">{row.currentVnd ? [row.since && `từ ${row.since}`, ...row.otherUnits].filter(Boolean).join(" · ") : "Nhập giá đầu tiên"}</small></td>
            {canManage && <>
              <td className="numeric" data-label="Giá mới"><MoneyInput aria-label={`Giá mới ${row.name}${overview ? ` của ${row.supplierName}` : ""}`} value={digits} placeholder={row.currentVnd ? digitsText(row.currentVnd) : "Nhập giá"}
                onValue={(value) => { setResult(null); setNext((value0) => { const copy = { ...value0 }; if (value && value !== "0") copy[row.key] = value; else delete copy[row.key]; return copy; }); }} /></td>
              <td className="numeric mono price-book-diff" data-label="Chênh lệch">{changed && change ? <span className={change.amount < 0n ? "price-down" : "price-up"}>{change.amount > 0n ? "+" : ""}{money(change.amount)}
                {change.percent !== null && <small className="table-subline">{change.amount > 0n ? "+" : ""}{change.percent.replace(".", ",")}%</small>}</span>
                : changed ? <span className="price-new">Giá mới</span> : null}</td>
            </>}
            {showSale && <td className={`numeric mono${gross !== null && gross < 10 ? " purchase-book-thin" : ""}`} data-label="Lãi gộp">{gross === null ? "—" : `${gross.toLocaleString("vi-VN")}%`}</td>}
          </tr>;
        })}</tbody>
      </table>{!rows.length && <p className="empty-inline">{supplier ? "Nhà cung cấp này chưa được gán vật tư nào. Bấm “+ Gán vật tư cho NCC này”." : "Chưa có vật tư nào được gán cho nhà cung cấp. Gán ở trang chi tiết vật tư hoặc chọn một nhà cung cấp."}</p>}</div>
    </section>

    {canManage && <section className="card card-pad price-book-save" aria-label="Lưu bảng giá mua">
      <label>Ngày áp dụng<input type="date" min={today} value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} /></label>
      <button type="button" className="button button-primary" disabled={!changes.length || pending} onClick={save}>{pending ? "Đang lưu..." : result?.outcomeUnknown ? "Lưu lại đúng thao tác" : `Lưu bảng giá mua (${changes.length} thay đổi)`}</button>
      {result && <p className={`form-message${result.success ? " success" : ""}`} role={result.success ? "status" : "alert"}>{result.message}</p>}
      <p className="muted">Tất cả giá lưu cùng lúc: một dòng lỗi thì không dòng nào thay đổi. Đổi lại trong cùng ngày thì giá mới thay giá cũ của ngày đó. Đơn mua đã tạo giữ giá cũ.</p>
    </section>}

    {assigning && supplier && <AssignDialog supplier={supplier} candidates={candidates} onClose={() => setAssigning(false)} onSaved={() => { setAssigning(false); router.refresh(); }} />}
  </div>;
}

function AssignDialog({ supplier, candidates, onClose, onSaved }: { supplier: { id: string; name: string }; candidates: AssignCandidate[]; onClose: () => void; onSaved: () => void }) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<PurchaseBookResult | null>(null);
  const [pending, startTransition] = useTransition();
  const term = search.trim().toLocaleLowerCase("vi");
  const shown = candidates.filter((item) => !term || item.name.toLocaleLowerCase("vi").includes(term) || item.code.toLocaleLowerCase("vi").includes(term)).slice(0, 80);
  const count = Object.keys(picked).length;
  function toggle(item: AssignCandidate) {
    setResult(null);
    if (result && !result.outcomeUnknown) setOperationId(crypto.randomUUID());
    setPicked((value) => { const copy = { ...value }; if (copy[item.materialId]) delete copy[item.materialId]; else copy[item.materialId] = item.units[0]?.id ?? ""; return copy; });
  }
  function save() {
    if (!count || pending) return;
    startTransition(async () => {
      const saved = await setSupplierMaterialsAction({ operationId, items: Object.entries(picked).map(([materialId, uomId]) => ({ supplierId: supplier.id, materialId, uomId, active: true })) })
        .catch(() => ({ success: false, outcomeUnknown: true, message: "Chưa xác định kết quả. Bấm lưu lại; hệ thống không ghi trùng." }));
      setResult(saved);
      if (saved.success) onSaved();
    });
  }
  return <Dialog title={`Gán vật tư cho ${supplier.name}`} description="Chọn vật tư nhà cung cấp này bán và đơn vị mua thường dùng. Giá nhập sau ở bảng." onClose={onClose} initialFocusId="assign-search">
    <div className="form-stack purchase-assign">
      <label className="field"><span>Tìm vật tư chưa gán</span><input id="assign-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Mã hoặc tên" /></label>
      <ul className="purchase-assign-list">{shown.map((item) => <li key={item.materialId}>
        <label className="check-row"><input type="checkbox" checked={Boolean(picked[item.materialId])} onChange={() => toggle(item)} />
          <span><strong>{item.name}</strong> <small className="muted">· {item.code}</small></span></label>
        <select aria-label={`Đơn vị mua ${item.name}`} value={picked[item.materialId] ?? item.units[0]?.id ?? ""} disabled={!picked[item.materialId]}
          onChange={(event) => setPicked((value) => ({ ...value, [item.materialId]: event.target.value }))}>{item.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.symbol}</option>)}</select>
      </li>)}</ul>
      {!shown.length && <p className="empty-inline">{candidates.length ? "Không có vật tư khớp từ tìm." : "Mọi vật tư đang mua đã được gán cho nhà cung cấp này."}</p>}
      {result && !result.success && <p className="form-message" role="alert">{result.message}</p>}
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>Hủy</button>
        <button type="button" className="button button-primary" disabled={!count || pending} onClick={save}>{pending ? "Đang gán…" : count ? `Gán ${count} vật tư` : "Chọn vật tư để gán"}</button></div>
    </div>
  </Dialog>;
}
