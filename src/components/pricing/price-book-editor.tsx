"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatVnd, vnd } from "@/lib/core/money";
import { adjustPrice, isValidAdjustment, priceChange, ROUNDING_STEPS, type AdjustMode, type RoundingStep } from "@/modules/pricing/bulk-adjust";
import { savePriceBookAction, type PriceBookResult } from "@/modules/pricing/price-book-actions";
import { MoneyInput } from "@/components/ui/money-input";

export type PriceBookRow = {
  materialId: string; code: string; name: string; group: string; uomId: string; uom: string;
  currentVnd: string | null; costVnd: string | null;
  /** In a group price book: the general (retail) price, for comparison. */
  generalVnd?: string | null;
  /** Prices of the other selling units in this book, e.g. "bao 300.000 ₫". */
  otherUnits?: string[];
  target: { ruleId: string; version: number } | null;
};

const money = (value: bigint) => formatVnd(vnd(value.toString()));

/** KiotViet-style "Thiết lập giá": edit many general prices inline, preview the change, save them together. */
export function PriceBookEditor({ rows, operationId, today, canManage, showCost, tierCode }: { rows: PriceBookRow[]; operationId: string; today: string; canManage: boolean; showCost: boolean;
  /** Customer price group being edited; absent for the general price book. */
  tierCode?: string }) {
  const router = useRouter();
  const [next, setNext] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<AdjustMode>("percent");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<RoundingStep>(1000);
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [result, setResult] = useState<PriceBookResult | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  const changes = useMemo(() => rows.flatMap((row) => {
    const digits = next[row.materialId];
    if (!digits || (row.currentVnd !== null && BigInt(digits) === BigInt(row.currentVnd))) return [];
    return [{ row, price: BigInt(digits) }];
  }), [rows, next]);
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.materialId));

  function applyAdjustment() {
    let applied = 0;
    let skipped = 0;
    const updates: Record<string, string> = {};
    for (const row of rows) {
      if (!selected.has(row.materialId)) continue;
      const result = row.currentVnd === null ? null : adjustPrice(BigInt(row.currentVnd), mode, amount, step);
      if (result === null) { skipped += 1; continue; }
      updates[row.materialId] = result.toString();
      applied += 1;
    }
    setNext((current) => ({ ...current, ...updates }));
    setResult(null);
    setNotice(`Đã tính giá mới cho ${applied} dòng${skipped ? `; bỏ qua ${skipped} dòng chưa có giá hiện tại hoặc ra giá không hợp lệ` : ""}. Kiểm tra cột chênh lệch trước khi lưu.`);
  }

  function save() {
    if (!changes.length || pending) return;
    const items = changes.map(({ row, price }) => ({ materialId: row.materialId, uomId: row.uomId, priceVnd: price.toString(), ...(tierCode ? { tierCode } : {}),
      ...(row.target ? { supersedesId: row.target.ruleId, expectedVersion: row.target.version } : {}) }));
    startTransition(async () => {
      try {
        const saved = await savePriceBookAction({ operationId, effectiveDate, items });
        setResult(saved);
        if (saved.success) { setNext({}); setSelected(new Set()); setNotice(""); router.refresh(); }
      } catch {
        setResult({ success: false, outcomeUnknown: true, message: "Chưa xác định kết quả lưu. Giữ nguyên nội dung và bấm Lưu lại; hệ thống không lưu trùng." });
      }
    });
  }

  return <div className="price-book">
    {canManage && <section className="card card-pad price-book-tools" aria-label="Điều chỉnh hàng loạt">
      <span className="price-book-selection">{selected.size} dòng đã chọn</span>
      <label>Cách điều chỉnh<select value={mode} onChange={(event) => setMode(event.target.value as AdjustMode)}><option value="percent">Tăng/giảm theo %</option><option value="amount">Tăng/giảm số tiền</option></select></label>
      <label>{mode === "percent" ? "Phần trăm (âm để giảm)" : "Số tiền ₫ (âm để giảm)"}<input inputMode="decimal" value={amount} placeholder={mode === "percent" ? "Ví dụ 10 hoặc -5" : "Ví dụ 2000 hoặc -1000"} onChange={(event) => setAmount(event.target.value)} /></label>
      <label>Làm tròn<select value={step} onChange={(event) => setStep(Number(event.target.value) as RoundingStep)}>{ROUNDING_STEPS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <button type="button" className="button button-secondary" disabled={!selected.size || !isValidAdjustment(mode, amount)} onClick={applyAdjustment}>Áp dụng cho dòng đã chọn</button>
      {notice && <p className="muted price-book-notice" role="status">{notice}</p>}
    </section>}

    <section className="card list-main">
      <div className="table-wrap"><table className={`price-book-table${canManage ? " price-book-selectable" : ""}`}>
        <thead><tr>
          {canManage && <th><input type="checkbox" aria-label="Chọn tất cả" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.materialId)))} /></th>}
          <th>Mã</th><th>Tên vật tư</th><th>ĐVT</th>{showCost && <th className="numeric">Giá vốn</th>}{tierCode && <th className="numeric">Giá chung</th>}<th className="numeric">Giá hiện tại</th>{canManage && <><th className="numeric">Giá mới</th><th className="numeric">Chênh lệch</th></>}
        </tr></thead>
        <tbody>{rows.map((row) => {
          const digits = next[row.materialId] ?? "";
          const price = digits ? BigInt(digits) : null;
          const change = price !== null ? priceChange(row.currentVnd === null ? null : BigInt(row.currentVnd), price) : null;
          const changed = price !== null && (row.currentVnd === null || price !== BigInt(row.currentVnd));
          return <tr key={row.materialId} className={changed ? "price-book-changed" : undefined}>
            {canManage && <td className="price-book-pick"><input type="checkbox" aria-label={`Chọn ${row.name}`} checked={selected.has(row.materialId)} onChange={() => setSelected((current) => { const copy = new Set(current); if (copy.has(row.materialId)) copy.delete(row.materialId); else copy.add(row.materialId); return copy; })} /></td>}
            <td className="mono price-book-code" data-label="Mã">{row.code}</td>
            <td className="price-book-name" data-label="Tên vật tư"><strong>{row.name}</strong><small className="table-subline">{row.group}</small></td>
            <td data-label="ĐVT">{row.uom}</td>
            {showCost && <td className="numeric mono" data-label="Giá vốn">{row.costVnd ? formatVnd(vnd(row.costVnd)) : "—"}</td>}
            {tierCode && <td className="numeric mono" data-label="Giá chung">{row.generalVnd ? formatVnd(vnd(row.generalVnd)) : "—"}</td>}
            <td className="numeric mono" data-label="Giá hiện tại">{row.currentVnd ? formatVnd(vnd(row.currentVnd)) : <span className="muted">{tierCode ? "Theo giá chung" : "Chưa có"}</span>}
              {row.otherUnits?.length ? <small className="table-subline">{row.otherUnits.join(" · ")}</small> : null}</td>
            {canManage && <>
              <td className="numeric" data-label="Giá mới"><MoneyInput aria-label={`Giá mới ${row.name}`} value={digits} placeholder={row.currentVnd ? new Intl.NumberFormat("vi-VN").format(BigInt(row.currentVnd)) : "Nhập giá"}
                onValue={(value) => { setResult(null); setNext((current) => { const copy = { ...current }; if (value && value !== "0") copy[row.materialId] = value; else delete copy[row.materialId]; return copy; }); }} /></td>
              <td className="numeric mono price-book-diff" data-label="Chênh lệch">{changed && change ? <span className={change.amount < 0n ? "price-down" : "price-up"}>{change.amount > 0n ? "+" : ""}{money(change.amount)}{change.percent !== null && <small className="table-subline">{change.amount > 0n ? "+" : ""}{change.percent}%</small>}</span> : null}</td>
            </>}
          </tr>;
        })}</tbody>
      </table>{!rows.length && <p className="empty-inline">Không có vật tư đang bán phù hợp.</p>}</div>
    </section>

    {canManage && <section className="card card-pad price-book-save" aria-label="Lưu bảng giá">
      <label>Ngày áp dụng<input type="date" min={today} value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} /></label>
      <button type="button" className="button button-primary" disabled={!changes.length || pending} onClick={save}>{pending ? "Đang lưu..." : `Lưu bảng giá (${changes.length} thay đổi)`}</button>
      {result && <p className={`form-message${result.success ? " success" : ""}`} role="status">{result.message}</p>}
      <p className="muted">Tất cả giá được lưu cùng lúc: nếu một dòng lỗi, không dòng nào bị thay đổi. Đơn đã chốt giữ giá cũ.</p>
    </section>}
  </div>;
}
