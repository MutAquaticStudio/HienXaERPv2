"use client";

import Decimal from "decimal.js";
import { useState } from "react";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatQuantity } from "@/lib/core/quantity";
import { normalizeDecimalInput } from "@/lib/core/vn-number";
import { PRICE_SOURCE } from "./price-source";
import { ReliableCommandForm } from "@/components/reliable-command-form";
import { registerSupplierDocumentAction, reviewSupplierDocumentAction } from "./document-actions";

export type DocumentSource = { source_kind: string; source_id: string; supplier_id: string; supplier_name: string; source_number: string; material_name: string; uom_symbol: string; source_quantity: string; source_unit_cost: string; source_value_vnd: string; document_kind: string;
 purchase_order_number?: string | null; ordered_quantity?: string | null; received_quantity?: string | null; ordered_unit_cost?: string | null; price_source_type?: string | null };
type Entry = { source_kind: string; source_id: string; document_quantity: string; document_unit_cost: string; document_value_vnd: string };
const same = (left: string, right: string) => { try { return new Decimal(left || "0").eq(right || "0"); } catch { return false; } };
const show = (value: string | null | undefined) => { try { return value ? formatQuantity(value) : "—"; } catch { return value ?? "—"; } };
const money = (value: string) => /^\d+$/.test(value) ? formatVnd(vnd(value)) : value;
/** Line value from the invoice quantity and price, rounded to whole đồng; typing the value directly still wins. */
export function lineValue(quantity: string, unitCost: string) {
 const q = normalizeDecimalInput(quantity), p = normalizeDecimalInput(unitCost);
 return q && p ? new Decimal(q).times(p).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed() : "";
}
/** FB10 (4.7): ordered · received · invoiced side by side, the order price and where it came from, differences highlighted. */
export function SupplierDocumentForm({ sources, operationId, scope, today }: { sources: DocumentSource[]; operationId: string; scope: string; today: string }) {
 const [kind, setKind] = useState("INVOICE"), [supplier, setSupplier] = useState(""), [entries, setEntries] = useState<Entry[]>([]);
 const suppliers = [...new Map(sources.map(s => [s.supplier_id, s.supplier_name])).entries()];
 const available = sources.filter(s => s.document_kind === kind && s.supplier_id === supplier);
 const key = (s: { source_kind: string; source_id: string }) => `${s.source_kind}:${s.source_id}`;
 const total = entries.every(e => /^\d+$/.test(e.document_value_vnd)) ? entries.reduce((v, e) => v + BigInt(e.document_value_vnd), 0n).toString() : "";
 const sourceTotal = available.filter(s => entries.some(e => key(e) === key(s))).reduce((v, s) => v + BigInt(s.source_value_vnd), 0n);
 const mismatched = available.filter(s => { const e = entries.find(x => key(x) === key(s)); return e && (!same(e.document_quantity, s.source_quantity) || !same(e.document_unit_cost, s.source_unit_cost) || e.document_value_vnd !== s.source_value_vnd); }).length;
 function select(s: DocumentSource, enabled: boolean) { setEntries(previous => enabled ? [...previous, { source_kind: s.source_kind, source_id: s.source_id, document_quantity: s.source_quantity, document_unit_cost: s.source_unit_cost, document_value_vnd: s.source_value_vnd }] : previous.filter(e => key(e) !== key(s))); }
 function update(s: DocumentSource, field: keyof Pick<Entry, "document_quantity" | "document_unit_cost" | "document_value_vnd">, value: string) {
  setEntries(previous => previous.map(e => {
   if (key(e) !== key(s)) return e;
   const next = { ...e, [field]: value };
   if (field !== "document_value_vnd") next.document_value_vnd = lineValue(next.document_quantity, next.document_unit_cost) || next.document_value_vnd;
   return next;
  }));
 }
 return <ReliableCommandForm action={registerSupplierDocumentAction} command="register_supplier_document" operationId={operationId} scope={scope} className="command-panel" onRestore={saved => {
  const data = Object.fromEntries(saved); setKind(data.kind || "INVOICE"); setSupplier(data.supplierId || ""); try { setEntries(JSON.parse(data.lines || "[]")); } catch { setEntries([]); }
 }} onNew={() => setEntries([])}>
  <div className="form-grid">
   <div className="field"><label htmlFor="supplier-doc-kind">Loại chứng từ</label><select id="supplier-doc-kind" name="kind" value={kind} onChange={e => { setKind(e.target.value); setEntries([]); }}><option value="INVOICE">Hóa đơn mua hàng</option><option value="CREDIT_NOTE">Chứng từ giảm (hàng trả)</option></select></div>
   <div className="field"><label htmlFor="supplier-doc-party">Nhà cung cấp</label><select id="supplier-doc-party" name="supplierId" value={supplier} onChange={e => { setSupplier(e.target.value); setEntries([]); }} required><option value="">Chọn nhà cung cấp</option>{suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
   <div className="field"><label htmlFor="supplier-doc-number">Số hóa đơn</label><input id="supplier-doc-number" name="number" minLength={2} maxLength={100} required /></div>
   <div className="field"><label htmlFor="supplier-doc-date">Ngày hóa đơn</label><input id="supplier-doc-date" name="date" type="date" defaultValue={today} required /></div>
  </div>
  <input type="hidden" name="lines" value={JSON.stringify(entries)} /><input type="hidden" name="total" value={total} />
  {supplier && !available.length && <p className="muted">Nhà cung cấp này không còn phiếu nhập chưa đối chiếu.</p>}
  {available.length > 0 && <div className="table-wrap"><table className="matching-table"><thead><tr><th>Phiếu nhập / đơn mua</th><th>Hàng · ĐVT</th><th className="numeric">SL đặt</th><th className="numeric">SL đã nhận</th><th className="numeric">SL hóa đơn</th><th className="numeric">Giá đơn mua</th><th className="numeric">Giá hóa đơn</th><th className="numeric">Thành tiền hóa đơn</th></tr></thead><tbody>{available.map(s => {
   const entry = entries.find(e => key(e) === key(s));
   const qtyOff = entry && !same(entry.document_quantity, s.source_quantity), priceOff = entry && !same(entry.document_unit_cost, s.source_unit_cost), valueOff = entry && entry.document_value_vnd !== s.source_value_vnd;
   return <tr key={key(s)} className={entry ? "selected" : undefined}>
    <td><label className="check-inline"><input type="checkbox" checked={Boolean(entry)} onChange={e => select(s, e.target.checked)} disabled={!entry && entries.length >= 50} aria-label={`Chọn ${s.source_number} ${s.material_name}`} /> <span className="code-link">{s.source_number}</span></label>{s.purchase_order_number && <small className="table-subline">Đơn mua {s.purchase_order_number}</small>}</td>
    <td>{s.material_name}<small className="table-subline">{s.uom_symbol}</small></td>
    <td className="numeric">{show(s.ordered_quantity)}</td>
    <td className="numeric">{show(s.source_quantity)}{s.received_quantity && !same(s.received_quantity, s.source_quantity) && <small className="table-subline">Cả đơn: {show(s.received_quantity)}</small>}</td>
    <td className={`numeric${qtyOff ? " variance" : ""}`}>{entry ? <input aria-label={`SL hóa đơn ${s.source_number} ${s.material_name}`} inputMode="decimal" value={entry.document_quantity} onChange={e => update(s, "document_quantity", e.target.value)} required /> : "—"}</td>
    <td className="numeric">{money(s.source_unit_cost)}{s.price_source_type && <small className="table-subline">{PRICE_SOURCE[s.price_source_type] ?? s.price_source_type}</small>}</td>
    <td className={`numeric${priceOff ? " variance" : ""}`}>{entry ? <input aria-label={`Giá hóa đơn ${s.source_number} ${s.material_name}`} inputMode="decimal" value={entry.document_unit_cost} onChange={e => update(s, "document_unit_cost", e.target.value)} required /> : "—"}</td>
    <td className={`numeric${valueOff ? " variance" : ""}`}>{entry ? <input aria-label={`Thành tiền hóa đơn ${s.source_number} ${s.material_name}`} inputMode="numeric" value={entry.document_value_vnd} onChange={e => update(s, "document_value_vnd", e.target.value)} required /> : money(s.source_value_vnd)}</td>
   </tr>;
  })}</tbody></table></div>}
  {entries.length > 0 && <p className={`form-message${mismatched ? " warning" : " success"}`}>Hóa đơn {total ? formatVnd(vnd(total)) : "chưa hợp lệ"} · theo phiếu nhập {formatVnd(vnd(sourceTotal.toString()))} · {mismatched ? `${mismatched} dòng lệch (tô màu)` : "Khớp"}</p>}
  <button className="button button-primary" type="submit" disabled={!entries.length || !total}>Lưu đối chiếu</button>
 </ReliableCommandForm>;
}
export function SupplierDocumentReviewForm({ documentId, version, decision, operationId, scope, canReview }: { documentId: string; version: number; decision: "APPROVE_MATCH" | "CANCEL"; operationId: string; scope: string; canReview: boolean }) {
 return <ReliableCommandForm action={reviewSupplierDocumentAction} command="review_supplier_document" operationId={operationId} scope={scope} className="command-panel">
  <input type="hidden" name="documentId" value={documentId} /><input type="hidden" name="version" value={version} /><input type="hidden" name="decision" value={decision} />
  <div className="field"><label htmlFor={`doc-reason-${decision}`}>{decision === "APPROVE_MATCH" ? "Ghi chú duyệt (không bắt buộc)" : "Ghi chú hủy (không bắt buộc)"}</label><input id={`doc-reason-${decision}`} name="reason" maxLength={500} /></div>
  <button className="button button-secondary" type="submit" disabled={!canReview}>{decision === "APPROVE_MATCH" ? "Duyệt đã khớp nguồn nội bộ" : "Hủy bản đối chiếu nháp"}</button>
 </ReliableCommandForm>;
}
