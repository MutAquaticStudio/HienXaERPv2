"use client";

import { Fragment, useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { formatVnd, vnd } from "@/lib/core/money";
import type { EditorLine, EditorMaterial, PricedLine } from "./types";

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
  fields?: { uom: string; price: string; reason: string };
  labels?: { uom: string; price: string };
  /** Extra hidden inputs that must stay aligned with each line (e.g. salesLineId). */
  hiddenFields?: (line: L) => ReactNode;
  /** A full-width row under a line (stock hint, linked sales price...). */
  detail?: (line: L, index: number) => ReactNode;
  /** Material fixed by its source (e.g. a sales order line). */
  lockedMaterial?: (line: L) => boolean;
  emptyText?: string;
};

const DEFAULT_FIELDS = { uom: "orderedUomId", price: "manualPriceVnd", reason: "manualReason" };
const DEFAULT_LABELS = { uom: "ĐVT", price: "Đơn giá" };

/**
 * Inline-editable document lines (KiotViet style). Every line posts exactly one value per field name,
 * in line order, so the server can read them with FormData.getAll().
 */
export function DocumentLineTable<L extends EditorLine>({ lines, materials, canManagePrice, isValidQuantity, priced, onChange, onRemove, onDone, focusKey,
  fields = DEFAULT_FIELDS, labels = DEFAULT_LABELS, hiddenFields, detail, lockedMaterial, emptyText = "Chưa có dòng hàng. Tìm vật tư ở ô phía trên để thêm (F3)." }: Props<L>) {
  const quantityRefs = useRef(new Map<number, HTMLInputElement>());
  useEffect(() => {
    if (focusKey == null) return;
    const input = quantityRefs.current.get(focusKey);
    input?.focus();
    input?.select();
  }, [focusKey, lines]);

  function enterMovesOn(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    onDone?.();
  }

  if (!lines.length) return <p className="doc-editor-empty">{emptyText}</p>;
  return <div className="table-wrap doc-editor-lines"><table>
    <thead><tr><th scope="col">#</th><th scope="col">Mã</th><th scope="col">Tên vật tư</th><th scope="col">{labels.uom}</th><th scope="col" className="numeric">Số lượng</th><th scope="col" className="numeric">{labels.price}</th><th scope="col" className="numeric">Thành tiền</th><th scope="col"><span className="sr-only">Xóa</span></th></tr></thead>
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
          <td className="mono" data-label="Mã">{material?.code ?? "—"}</td>
          <td className="doc-editor-name" data-label="Tên vật tư">
            <input type="hidden" name="sourceLineId" value={line.sourceLineId} />
            <input type="hidden" name="materialId" value={line.materialId} />
            {hiddenFields?.(line)}
            {!(canManagePrice && line.manualPriceVnd) && <input type="hidden" name={fields.reason} value={canManagePrice ? "" : line.manualReason} />}
            <strong>{material?.name ?? "Vật tư không còn khả dụng"}</strong>
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
            <input ref={(element) => { if (element) quantityRefs.current.set(line.key, element); else quantityRefs.current.delete(line.key); }}
              aria-label={`Số lượng dòng ${row}`} name="quantity" inputMode="decimal" value={line.quantity} required
              aria-invalid={!quantityValid} aria-describedby={quantityValid ? undefined : `qty-error-${line.key}`}
              onChange={(event) => onChange(line.key, { quantity: event.target.value } as Partial<L>)} onKeyDown={enterMovesOn} />
          </td>
          <td className="numeric" data-label={labels.price}>
            {canManagePrice
              ? <input aria-label={`${labels.price} thủ công dòng ${row}`} name={fields.price} inputMode="numeric" value={line.manualPriceVnd}
                placeholder={price ? formatVnd(vnd(price.unitPriceVnd)) : "Giá hệ thống"} onChange={(event) => onChange(line.key, { manualPriceVnd: event.target.value } as Partial<L>)} onKeyDown={enterMovesOn} />
              : <><input type="hidden" name={fields.price} value={line.manualPriceVnd} />{price ? formatVnd(vnd(price.unitPriceVnd)) : "—"}</>}
            {price && <small className="table-subline">{price.sourceLabel}</small>}
          </td>
          <td className="numeric" data-label="Thành tiền"><strong>{price ? formatVnd(vnd(price.lineTotalVnd)) : "—"}</strong></td>
          <td className="doc-editor-remove"><button type="button" className="icon-button" aria-label={`Xóa dòng ${row}`} onClick={() => onRemove(line.key)}><X size={16} aria-hidden="true" /></button></td>
        </tr>
        {(!quantityValid || (canManagePrice && line.manualPriceVnd) || priceLocked || extra) && <tr className="doc-editor-line-detail"><td /><td colSpan={7}>
          {!quantityValid && <small id={`qty-error-${line.key}`} role="alert" className="field-error">Nhập số lượng lớn hơn 0, tối đa 6 chữ số thập phân.</small>}
          {canManagePrice && line.manualPriceVnd
            ? <label className="doc-editor-reason">Lý do giá thủ công dòng {row}<input name={fields.reason} maxLength={500} value={line.manualReason} placeholder="Bắt buộc khi giá khác bảng giá"
              onChange={(event) => onChange(line.key, { manualReason: event.target.value } as Partial<L>)} onKeyDown={enterMovesOn} /></label>
            : null}
          {priceLocked && <small className="muted">Giá thủ công đã duyệt: {formatVnd(vnd(line.manualPriceVnd))}. Đổi giá hoặc đơn vị cần quyền quản lý giá.</small>}
          {extra}
        </td></tr>}
      </Fragment>;
    })}</tbody>
  </table></div>;
}
