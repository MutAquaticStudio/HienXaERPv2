"use client";

import { useState } from "react";
import { ReliableCommandForm } from "@/components/reliable-command-form";
import { registerSupplierDocumentAction, reviewSupplierDocumentAction } from "./document-actions";

export type DocumentSource = { source_kind: string; source_id: string; supplier_id: string; supplier_name: string; source_number: string; material_name: string; uom_symbol: string; source_quantity: string; source_unit_cost: string; source_value_vnd: string; document_kind: string };
type Entry = { source_kind: string; source_id: string; document_quantity: string; document_unit_cost: string; document_value_vnd: string };
export function SupplierDocumentForm({ sources, operationId, scope, today }: { sources: DocumentSource[]; operationId: string; scope: string; today: string }) {
 const [kind, setKind] = useState("INVOICE"), [supplier, setSupplier] = useState(""), [entries, setEntries] = useState<Entry[]>([]);
 const suppliers = [...new Map(sources.map(s => [s.supplier_id, s.supplier_name])).entries()];
 const available = sources.filter(s => s.document_kind === kind && s.supplier_id === supplier);
 const key = (s: { source_kind: string; source_id: string }) => `${s.source_kind}:${s.source_id}`;
 const total = entries.every(e => /^\d+$/.test(e.document_value_vnd)) ? entries.reduce((v, e) => v + BigInt(e.document_value_vnd), 0n).toString() : "";
 function select(s: DocumentSource, enabled: boolean) { setEntries(previous => enabled ? [...previous, { source_kind: s.source_kind, source_id: s.source_id, document_quantity: s.source_quantity, document_unit_cost: s.source_unit_cost, document_value_vnd: s.source_value_vnd }] : previous.filter(e => key(e) !== key(s))); }
 function update(s: DocumentSource, field: keyof Pick<Entry, "document_quantity" | "document_unit_cost" | "document_value_vnd">, value: string) { setEntries(previous => previous.map(e => key(e) === key(s) ? { ...e, [field]: value } : e)); }
 return <ReliableCommandForm action={registerSupplierDocumentAction} command="register_supplier_document" operationId={operationId} scope={scope} className="command-panel" onRestore={saved => {
  const data = Object.fromEntries(saved); setKind(data.kind || "INVOICE"); setSupplier(data.supplierId || ""); try { setEntries(JSON.parse(data.lines || "[]")); } catch { setEntries([]); }
 }} onNew={() => setEntries([])}>
  <div className="field"><label htmlFor="supplier-doc-kind">Loại chứng từ đối chiếu</label><select id="supplier-doc-kind" name="kind" value={kind} onChange={e => { setKind(e.target.value); setEntries([]); }}><option value="INVOICE">Hóa đơn / chứng từ mua</option><option value="CREDIT_NOTE">Chứng từ giảm theo khoản trả đã duyệt</option></select></div>
  <div className="field"><label htmlFor="supplier-doc-party">Nhà cung cấp trên chứng từ</label><select id="supplier-doc-party" name="supplierId" value={supplier} onChange={e => { setSupplier(e.target.value); setEntries([]); }} required><option value="">Chọn nhà cung cấp</option>{suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
  <div className="field"><label htmlFor="supplier-doc-number">Số tham chiếu chứng từ</label><input id="supplier-doc-number" name="number" minLength={2} maxLength={100} required /></div>
  <div className="field"><label htmlFor="supplier-doc-date">Ngày chứng từ</label><input id="supplier-doc-date" name="date" type="date" defaultValue={today} required /></div>
  <input type="hidden" name="lines" value={JSON.stringify(entries)} /><input type="hidden" name="total" value={total} />
  <p>Giá trị khai báo theo các dòng: {total || "Chưa hợp lệ"} VND. Các dòng mua dùng đơn vị mua gốc; chứng từ giảm dùng đơn vị cơ sở của lượng trả.</p>
  <div className="table-wrap"><table><thead><tr><th>Chọn nguồn</th><th>Lượng trên chứng từ</th><th>Giá trên chứng từ</th><th>Giá trị dòng</th></tr></thead><tbody>{available.map(s => {
   const entry = entries.find(e => key(e) === key(s));
   return <tr key={key(s)}><td><label><input type="checkbox" checked={Boolean(entry)} onChange={e => select(s, e.target.checked)} disabled={!entry && entries.length >= 50} /> {s.source_number} · {s.material_name} · {s.uom_symbol}</label><small className="table-subline">Nguồn {s.source_quantity} × {s.source_unit_cost}; giá trị {s.source_value_vnd} VND</small></td><td>{entry && <input aria-label={`Lượng chứng từ ${s.source_id}`} inputMode="decimal" value={entry.document_quantity} onChange={e => update(s, "document_quantity", e.target.value)} required />}</td><td>{entry && <input aria-label={`Giá chứng từ ${s.source_id}`} inputMode="decimal" value={entry.document_unit_cost} onChange={e => update(s, "document_unit_cost", e.target.value)} required />}</td><td>{entry && <input aria-label={`Giá trị chứng từ ${s.source_id}`} inputMode="numeric" value={entry.document_value_vnd} onChange={e => update(s, "document_value_vnd", e.target.value)} required />}</td></tr>;
  })}</tbody></table></div>
  <p className="muted">Lệch lượng, giá hoặc giá trị được giữ thành ngoại lệ. Ghi và duyệt đối chiếu không tạo công nợ lần nữa; phần phát hành / xác minh pháp lý cần kết nối riêng.</p>
  <button className="button button-primary" type="submit" disabled={!entries.length || !total}>Ghi đối chiếu chứng từ nhà cung cấp</button>
 </ReliableCommandForm>;
}
export function SupplierDocumentReviewForm({ documentId, version, decision, operationId, scope, canReview }: { documentId: string; version: number; decision: "APPROVE_MATCH" | "CANCEL"; operationId: string; scope: string; canReview: boolean }) {
 return <ReliableCommandForm action={reviewSupplierDocumentAction} command="review_supplier_document" operationId={operationId} scope={scope} className="command-panel">
  <input type="hidden" name="documentId" value={documentId} /><input type="hidden" name="version" value={version} /><input type="hidden" name="decision" value={decision} />
  <div className="field"><label htmlFor={`doc-reason-${decision}`}>{decision === "APPROVE_MATCH" ? "Ghi chú duyệt (không bắt buộc)" : "Ghi chú hủy (không bắt buộc)"}</label><input id={`doc-reason-${decision}`} name="reason" maxLength={500} /></div>
  <button className="button button-secondary" type="submit" disabled={!canReview}>{decision === "APPROVE_MATCH" ? "Duyệt đã khớp nguồn nội bộ" : "Hủy bản đối chiếu nháp"}</button>
 </ReliableCommandForm>;
}
