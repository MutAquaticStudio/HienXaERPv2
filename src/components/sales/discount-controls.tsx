"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { MoneyInput } from "@/components/ui/money-input";
import { formatVnd, vnd } from "@/lib/core/money";
import { parseDiscountValue, unitDiscount, type DiscountInput, type DiscountMode } from "@/modules/sales/discounts";

export type DiscountDraft = { mode: "" | DiscountMode; value: string };

/** What the user typed, read as a discount (null when empty or not readable yet). */
export function draftDiscount(draft: DiscountDraft): DiscountInput {
  if (!draft.mode || !draft.value.trim()) return null;
  const value = parseDiscountValue(draft.mode, draft.value);
  return value ? { mode: draft.mode, value } : null;
}

/** "Giảm giá [VND | %]": an amount or a percentage, switched like KiotViet. */
export function DiscountField({ id, label, draft, onChange, disabled, hint }: {
  id: string; label: string; draft: DiscountDraft; onChange: (next: DiscountDraft) => void; disabled?: boolean; hint?: string;
}) {
  const mode = draft.mode || "AMOUNT";
  const invalid = !!draft.value.trim() && !draftDiscount({ mode, value: draft.value });
  return <div className="field discount-field">
    <div className="field-label-row"><label htmlFor={id}>{label}</label>
      <span className="discount-mode" role="group" aria-label={`Kiểu ${label.toLowerCase()}`}>
        {(["AMOUNT", "PERCENT"] as const).map((option) => <button key={option} type="button" aria-pressed={mode === option} disabled={disabled}
          onClick={() => onChange({ mode: option, value: option === mode ? draft.value : "" })}>{option === "AMOUNT" ? "VND" : "%"}</button>)}
      </span></div>
    {mode === "AMOUNT"
      ? <MoneyInput id={id} value={draft.value} disabled={disabled} placeholder="0" aria-invalid={invalid}
        onValue={(value) => onChange({ mode: value ? "AMOUNT" : "", value })} />
      : <input id={id} inputMode="decimal" value={draft.value} disabled={disabled} placeholder="0" maxLength={6} aria-invalid={invalid}
        onChange={(event) => onChange({ mode: "PERCENT", value: event.target.value })} />}
    {invalid && <small className="field-error" role="alert">{mode === "PERCENT" ? "Nhập phần trăm lớn hơn 0 và nhỏ hơn 100 (vd 5 hoặc 2,5)." : "Nhập số tiền giảm."}</small>}
    {hint && !invalid && <small className="muted">{hint}</small>}
  </div>;
}

/**
 * KiotViet-style price popup of one sales line: "Đơn giá" (price list price, or a manual price with reason),
 * "Giảm giá" per unit by VND or %, and the resulting "Giá bán".
 */
export function LinePriceDialog({ row, name, unit, listUnitVnd, systemUnitVnd, manualPriceVnd, discount, canManagePrice, onChange, onClose }: {
  row: number; name: string; unit: string;
  /** Price before discount as it stands (manual price or the price list price), when known. */
  listUnitVnd: string | null; systemUnitVnd: string | null; manualPriceVnd: string; discount: DiscountDraft; canManagePrice: boolean;
  onChange: (change: { manualPriceVnd?: string; discount?: DiscountDraft }) => void; onClose: () => void;
}) {
  const [price, setPrice] = useState(manualPriceVnd);
  const [draft, setDraft] = useState<DiscountDraft>(discount);
  const list = price || listUnitVnd;
  const own = draftDiscount(draft);
  const off = list && own ? unitDiscount(BigInt(list), own) : 0n;
  const selling = list ? BigInt(list) - off : null;
  const tooMuch = selling !== null && selling <= 0n;
  return <Dialog eyebrow={`Dòng ${row} · ${unit}`} title={name} onClose={onClose} initialFocusId={canManagePrice ? `line-price-${row}` : `line-discount-${row}`}>
    <div className="form-grid line-price-dialog">
      <div className="field field-full"><label htmlFor={`line-price-${row}`}>Đơn giá</label>
        {canManagePrice
          ? <MoneyInput id={`line-price-${row}`} value={price} placeholder={systemUnitVnd ? new Intl.NumberFormat("vi-VN").format(BigInt(systemUnitVnd)) : "Giá bảng giá"}
            onValue={setPrice} />
          : <strong>{list ? formatVnd(vnd(list)) : "—"}</strong>}
        <small className="muted">{price ? "Giá thủ công: cần ghi lý do ở dòng hàng." : "Để trống: dùng giá theo bảng giá."}</small>
      </div>
      <div className="field-full"><DiscountField id={`line-discount-${row}`} label="Giảm giá mỗi đơn vị" draft={draft} onChange={setDraft} /></div>
      <dl className="detail-grid field-full line-price-result">
        <div className="detail-item"><dt>Giảm</dt><dd>{off > 0n ? formatVnd(vnd(off.toString())) : "—"}</dd></div>
        <div className="detail-item"><dt>Giá bán</dt><dd><strong>{selling !== null && !tooMuch ? formatVnd(vnd(selling.toString())) : "—"}</strong></dd></div>
      </dl>
      {tooMuch && <p className="form-message field-full" role="alert">Giảm giá phải nhỏ hơn đơn giá.</p>}
      <div className="form-actions field-full">
        <button type="button" className="button button-primary" disabled={tooMuch} onClick={() => { onChange({ manualPriceVnd: price, discount: own ? draft : { mode: "", value: "" } }); onClose(); }}>Xong</button>
        <button type="button" className="button button-secondary" onClick={onClose}>Hủy</button>
      </div>
    </div>
  </Dialog>;
}
