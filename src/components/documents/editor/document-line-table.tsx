"use client";

import { Fragment, useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import Decimal from "decimal.js";
import { Minus, Plus, X } from "lucide-react";
import { formatVnd, vnd } from "@/lib/core/money";
import { decimalForEditing, normalizeDecimalInput } from "@/lib/core/vn-number";
import { NumberEntry } from "./number-entry";
import type { EditorLine, EditorMaterial, PricedLine } from "./types";
import { MoneyInput } from "@/components/ui/money-input";

type Props<L extends EditorLine> = {
  lines: L[];
  materials: EditorMaterial[];
  canManagePrice: boolean;
  isValidQuantity: (value: string) => boolean;
  priced: (index: number) => PricedLine | null;
  onChange: (key: number, change: Partial<L>) => void;
  onRemove: (key: number) => void;
  /** Called when Enter is pressed in a line, so typing can go straight back to the material search. */
  onDone?: () => void;
  focusKey?: number | null;
  /** Bumped by the parent each time a material is picked, so picking the same material again re-focuses its line. */
  focusSeq?: number;
  fields?: { uom: string; price: string; reason: string };
  labels?: { uom: string; price: string };
  /** Extra hidden inputs that must stay aligned with each line (e.g. salesLineId). */
  hiddenFields?: (line: L) => ReactNode;
  /** A full-width row under a line (stock hint, linked sales price...). */
  detail?: (line: L, index: number) => ReactNode;
  /** Material fixed by its source (e.g. a sales order line). */
  lockedMaterial?: (line: L) => boolean;
  /** Replaces the editable price in the price cell (the sales order opens a price & discount popup instead). */
  renderPrice?: (line: L, index: number, price: PricedLine | null) => ReactNode;
  emptyText?: string;
};

/** Quantity one step up or down (− / + buttons); null when the result would not be a positive quantity. */
export function stepQuantity(value: string, step: 1 | -1): string | null {
  const current = normalizeDecimalInput(value);
  if (!current) return step > 0 ? "1" : null;
  const next = new Decimal(current).plus(step);
  return next.gt(0) ? next.toFixed() : null;
}

const DEFAULT_FIELDS = { uom: "orderedUomId", price: "manualPriceVnd", reason: "manualReason" };
const DEFAULT_LABELS = { uom: "ĐVT", price: "Đơn giá" };

/**
 * Inline-editable document lines (KiotViet style). Every line posts exactly one value per field name,
 * in line order, so the server can read them with FormData.getAll().
 */
export function DocumentLineTable<L extends EditorLine>({ lines, materials, canManagePrice, isValidQuantity, priced, onChange, onRemove, onDone, focusKey, focusSeq = 0,
  fields = DEFAULT_FIELDS, labels = DEFAULT_LABELS, hiddenFields, detail, lockedMaterial, renderPrice, emptyText = "Chưa có dòng hàng. Tìm vật tư ở ô phía trên để thêm (F3)." }: Props<L>) {
  const quantityRefs = useRef(new Map<number, HTMLInputElement>());
  // Focus the picked line's quantity once per pick. Depending on `lines` here would pull the cursor back to the quantity on
  // every keystroke elsewhere in the table (typing a price jumped to the quantity after the first digit).
  useEffect(() => {
    if (focusKey == null) return;
    const input = quantityRefs.current.get(focusKey);
    input?.focus();
    input?.select();
  }, [focusKey, focusSeq]);

  function enterMovesOn(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    onDone?.();
  }

  if (!lines.length) return <p className="doc-editor-empty">{emptyText}</p>;
  return <div className="table-wrap doc-editor-lines"><table>
    <thead><tr><th scope="col">#</th><th scope="col">Vật tư</th><th scope="col">{labels.uom}</th><th scope="col" className="numeric">Số lượng</th><th scope="col" className="numeric">{labels.price}</th><th scope="col" className="numeric">Thành tiền</th><th scope="col"><span className="sr-only">Xóa</span></th></tr></thead>
    <tbody>{lines.map((line, index) => {
      const material = materials.find((item) => item.id === line.materialId);
      const price = priced(index);
      const row = index + 1;
      const quantityValid = isValidQuantity(line.quantity);
      const priceLocked = !canManagePrice && !!line.manualPriceVnd;
      const extra = detail?.(line, index);
      return <Fragment key={line.key}>
        <tr className={quantityValid ? undefined : "doc-editor-line-invalid"}>
          <td className="mono" data-label="#">{row}</td>
          {/* Code sits under the name: beside the side panel there is no room for a separate code column. */}
          <td className="doc-editor-name" data-label="Vật tư">
            <input type="hidden" name="sourceLineId" value={line.sourceLineId} />
            <input type="hidden" name="materialId" value={line.materialId} />
            {hiddenFields?.(line)}
            {!(canManagePrice && line.manualPriceVnd) && <input type="hidden" name={fields.reason} value={canManagePrice ? "" : line.manualReason} />}
            <strong>{material?.name ?? "Vật tư không còn khả dụng"}</strong>
            {material?.code && <small className="table-subline mono">{material.code}</small>}
            {lockedMaterial?.(line) && <small className="table-subline">Theo dòng nguồn</small>}
          </td>
          <td data-label={labels.uom}>
            <select aria-label={`${labels.uom} dòng ${row}`} name={priceLocked ? undefined : fields.uom} value={line.uomId} disabled={priceLocked}
              onChange={(event) => onChange(line.key, { uomId: event.target.value } as Partial<L>)} required>
              {(material?.uoms ?? []).map((uom) => <option key={uom.id} value={uom.id}>{uom.symbol}</option>)}
            </select>
            {priceLocked && <input type="hidden" name={fields.uom} value={line.uomId} />}
          </td>
          <td className="numeric" data-label="Số lượng">
            <input type="hidden" name="quantity" value={line.quantity} />
            <span className="qty-stepper">
              <button type="button" className="qty-step" tabIndex={-1} aria-label={`Giảm số lượng dòng ${row}`} disabled={!stepQuantity(line.quantity, -1)}
                onClick={() => { const next = stepQuantity(line.quantity, -1); if (next) onChange(line.key, { quantity: next } as Partial<L>); }}><Minus size={14} aria-hidden="true" /></button>
              <NumberEntry ref={(element) => { if (element) quantityRefs.current.set(line.key, element); else quantityRefs.current.delete(line.key); }}
                aria-label={`Số lượng dòng ${row}`} inputMode="decimal" value={line.quantity} required normalize={normalizeDecimalInput} display={decimalForEditing}
                aria-invalid={!quantityValid} aria-describedby={quantityValid ? undefined : `qty-error-${line.key}`}
                onValue={(quantity) => onChange(line.key, { quantity } as Partial<L>)} onKeyDown={enterMovesOn} />
              <button type="button" className="qty-step" tabIndex={-1} aria-label={`Tăng số lượng dòng ${row}`}
                onClick={() => onChange(line.key, { quantity: stepQuantity(line.quantity, 1) ?? "1" } as Partial<L>)}><Plus size={14} aria-hidden="true" /></button>
            </span>
          </td>
          <td className="numeric" data-label={labels.price}>
            <input type="hidden" name={fields.price} value={line.manualPriceVnd} />
            {renderPrice ? renderPrice(line, index, price) : canManagePrice
              ? <MoneyInput aria-label={`${labels.price} thủ công dòng ${row}`} value={line.manualPriceVnd}
                placeholder={price ? formatVnd(vnd(price.unitPriceVnd)) : "Giá hệ thống"} onValue={(manualPriceVnd) => onChange(line.key, { manualPriceVnd } as Partial<L>)} onKeyDown={enterMovesOn} />
              : price ? formatVnd(vnd(price.unitPriceVnd)) : "—"}
            {price && !renderPrice && <small className="table-subline">{price.sourceLabel}</small>}
          </td>
          <td className="numeric" data-label="Thành tiền"><strong>{price ? formatVnd(vnd(price.lineTotalVnd)) : "—"}</strong></td>
          <td className="doc-editor-remove"><button type="button" className="icon-button" aria-label={`Xóa dòng ${row}`} onClick={() => onRemove(line.key)}><X size={16} aria-hidden="true" /></button></td>
        </tr>
        {(!quantityValid || (canManagePrice && line.manualPriceVnd) || priceLocked || extra) && <tr className="doc-editor-line-detail"><td /><td colSpan={7}>
          {!quantityValid && <small id={`qty-error-${line.key}`} role="alert" className="field-error">Nhập số lượng lớn hơn 0, tối đa 6 chữ số thập phân (vd 1,5 hoặc 1.250).</small>}
          {canManagePrice && line.manualPriceVnd
            ? <label className="doc-editor-reason">Ghi chú giá thủ công dòng {row} (không bắt buộc)<input name={fields.reason} maxLength={500} value={line.manualReason} placeholder="Ví dụ: Giá công trình đã thỏa thuận"
              onChange={(event) => onChange(line.key, { manualReason: event.target.value } as Partial<L>)} onKeyDown={enterMovesOn} /></label>
            : null}
          {priceLocked && <small className="muted">Giá thủ công đã duyệt: {formatVnd(vnd(line.manualPriceVnd))}. Đổi giá hoặc đơn vị cần quyền quản lý giá.</small>}
          {extra}
        </td></tr>}
      </Fragment>;
    })}</tbody>
  </table></div>;
}
