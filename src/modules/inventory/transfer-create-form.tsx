"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MaterialSearchBox } from "@/components/documents/editor/material-search-box";
import type { EditorMaterial } from "@/components/documents/editor/types";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { createWarehouseTransfersAction } from "./transfer-actions";

type Line = { key: number; materialId: string; uomId: string; quantity: string };
type Warehouse = { id: string; label: string };

/** KiotViet-style "Chuyển hàng": two warehouses, several lines (F3 search), quantity in bao/tấn…, optional "Xuất kho ngay". */
export function TransferCreateForm({ warehouses, materials, operationId, stock }: { warehouses: Warehouse[]; materials: EditorMaterial[]; operationId: string; stock: Record<string, string> }) {
 const router = useRouter();
 const [from, setFrom] = useState(warehouses[0]?.id ?? ""), [to, setTo] = useState(warehouses[1]?.id ?? "");
 const [lines, setLines] = useState<Line[]>([]), [seq, setSeq] = useState(1);
 const [message, setMessage] = useState<string | null>(null), [pending, start] = useTransition();
 const byId = new Map(materials.map(material => [material.id, material]));
 function pick(material: EditorMaterial) {
  const existing = lines.find(line => line.materialId === material.id);
  if (existing) return;
  setLines(current => [...current, { key: seq, materialId: material.id, uomId: material.uoms[material.uoms.length - 1]?.id ?? material.uoms[0]?.id ?? "", quantity: "1" }]);
  setSeq(value => value + 1);
 }
 const update = (key: number, patch: Partial<Line>) => setLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line));
 function submit(form: FormData) {
  setMessage(null);
  start(async () => {
   const outcome = await createWarehouseTransfersAction(form);
   if (outcome.status === "SUCCESS") router.push(`/admin/inventory/transfers?notice=${form.get("shipNow") === "1" ? "shipped" : "created"}`);
   else setMessage(outcome.message ?? "Chưa tạo được phiếu chuyển.");
  });
 }
 return <form action={submit} className="return-layout">
  <input type="hidden" name="operationId" value={operationId} />
  <section className="card card-pad transfer-lines">
   <MaterialSearchBox materials={materials} onPick={pick} hint={material => stock[`${from}:${material.id}`] ? `Tồn kho chuyển: ${stock[`${from}:${material.id}`]}` : null} />
   <div className="table-wrap"><table><thead><tr><th>Hàng hóa</th><th>Đơn vị</th><th>Số lượng chuyển</th><th /></tr></thead><tbody>
    {lines.map(line => { const material = byId.get(line.materialId); return <tr key={line.key}>
     <td><input type="hidden" name="materialId" value={line.materialId} /><strong>{material?.name}</strong><small className="table-subline">{material?.code}{stock[`${from}:${line.materialId}`] ? ` · tồn ${stock[`${from}:${line.materialId}`]}` : ""}</small></td>
     <td><select name="uomId" aria-label={`Đơn vị ${material?.name}`} value={line.uomId} onChange={event => update(line.key, { uomId: event.target.value })}>{material?.uoms.map(uom => <option key={uom.id} value={uom.id}>{uom.symbol}</option>)}</select></td>
     <td><QuantityStepper id={`transfer-${line.key}`} name="quantity" label={`Số lượng chuyển ${material?.name}`} value={line.quantity} onValue={value => update(line.key, { quantity: value })} /></td>
     <td><button type="button" className="icon-button" aria-label={`Bỏ ${material?.name}`} onClick={() => setLines(current => current.filter(item => item.key !== line.key))}><Trash2 size={16} aria-hidden="true" /></button></td>
    </tr>; })}
    {!lines.length && <tr><td colSpan={4} className="muted">Tìm và chọn hàng cần chuyển (F3).</td></tr>}
   </tbody></table></div>
  </section>
  <aside className="card card-pad return-summary">
   <div className="field"><label htmlFor="transfer-from">Từ kho</label><select id="transfer-from" name="fromWarehouseId" value={from} onChange={event => setFrom(event.target.value)}>{warehouses.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
   <div className="field"><label htmlFor="transfer-to">Tới kho</label><select id="transfer-to" name="toWarehouseId" value={to} onChange={event => setTo(event.target.value)}>{warehouses.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
   <label className="check-inline"><input type="checkbox" name="shipNow" value="1" defaultChecked /> Xuất kho ngay</label>
   <div className="field"><label htmlFor="transfer-note">Ghi chú</label><input id="transfer-note" name="note" maxLength={300} /></div>
   {from === to && <p className="form-message" role="alert">Kho chuyển và kho nhận phải khác nhau.</p>}
   {message && <p className="form-message" role="alert">{message}</p>}
   <button className="button button-primary action-full" type="submit" disabled={pending || !lines.length || from === to}>{pending ? "Đang lưu…" : "Hoàn thành"}</button>
  </aside>
 </form>;
}
