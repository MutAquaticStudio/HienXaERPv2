"use client";

import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatQuantity } from "@/lib/core/quantity";
import { normalizeDecimalInput } from "@/lib/core/vn-number";
import { completeSupplierReturnAction } from "./supplier-return-actions";

export type ReturnLine = { id: string; materialCode: string; materialName: string; unit: string; received: string; returnable: string; unitCost: string; warehouse: string };
type Account = { id: string; label: string };

/** Value of what goes back at the receipt's price; the database credits the exact share of the received cost. */
export function returnValue(lines: ReturnLine[], quantities: Record<string, string>) {
 return lines.reduce((total, line) => {
  const qty = normalizeDecimalInput(quantities[line.id] ?? "");
  return qty ? total.plus(new Decimal(qty).times(line.unitCost).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)) : total;
 }, new Decimal(0));
}

/** KiotViet-style "Trả hàng nhập": quantities per line on the left, the amount and the refund choice on the right, one "Hoàn thành". */
export function SupplierReturnCompleteForm({ receiptId, operationId, lines, accounts, canRefund }: { receiptId: string; operationId: string; lines: ReturnLine[]; accounts: Account[]; canRefund: boolean }) {
 const router = useRouter();
 const [quantities, setQuantities] = useState<Record<string, string>>({});
 const [refund, setRefund] = useState(false);
 const [message, setMessage] = useState<string | null>(null);
 const [pending, start] = useTransition();
 const total = returnValue(lines, quantities);
 const over = lines.find(line => { const qty = normalizeDecimalInput(quantities[line.id] ?? ""); return qty !== null && new Decimal(qty).gt(line.returnable); });
 const chosen = lines.some(line => { const qty = normalizeDecimalInput(quantities[line.id] ?? ""); return qty !== null && new Decimal(qty).gt(0); });
 function submit(form: FormData) {
  setMessage(null);
  start(async () => {
   const outcome = await completeSupplierReturnAction(form);
   if (outcome.status === "SUCCESS") router.push("/admin/purchases/returns?notice=returned");
   else setMessage(outcome.message ?? "Chưa trả được hàng. Thử lại.");
  });
 }
 return <form action={submit} className="return-layout">
  <input type="hidden" name="receiptId" value={receiptId} /><input type="hidden" name="operationId" value={operationId} />
  <section className="card"><div className="table-wrap"><table><thead><tr><th>Hàng hóa</th><th>ĐVT</th><th className="numeric">Đã nhập</th><th className="numeric">Còn trả được</th><th>Số lượng trả</th><th className="numeric">Giá nhập</th><th className="numeric">Thành tiền</th></tr></thead>
   <tbody>{lines.map(line => {
    const qty = normalizeDecimalInput(quantities[line.id] ?? "");
    const amount = qty ? vnd(new Decimal(qty).times(line.unitCost).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed()) : null;
    return <tr key={line.id}>
     <td><strong>{line.materialName}</strong><small className="table-subline">{line.materialCode} · {line.warehouse}</small></td>
     <td>{line.unit}</td><td className="numeric">{formatQuantity(line.received)}</td><td className="numeric">{formatQuantity(line.returnable)}</td>
     <td><input type="hidden" name="lineId" value={line.id} /><QuantityStepper id={`return-${line.id}`} name="quantity" label={`Số lượng trả ${line.materialName}`} unit={line.unit} min={0} allowEmpty
      value={quantities[line.id] ?? ""} onValue={value => setQuantities(current => ({ ...current, [line.id]: value }))} disabled={new Decimal(line.returnable).lte(0)} /></td>
     <td className="numeric">{formatVnd(vnd(line.unitCost))}</td><td className="numeric">{amount ? formatVnd(amount) : "—"}</td>
    </tr>;
   })}</tbody></table></div></section>
  <aside className="card card-pad return-summary">
   <p className="return-total"><span>Tổng tiền hàng trả</span><strong>{formatVnd(vnd(total.toFixed()))}</strong></p>
   <p className="muted">Hàng xuất khỏi kho và công nợ phải trả nhà cung cấp giảm đúng giá trị trên.</p>
   {canRefund && accounts.length > 0 && <label className="check-inline"><input type="checkbox" checked={refund} onChange={event => setRefund(event.target.checked)} /> Đã trả tiền hàng — NCC hoàn tiền ngay</label>}
   {refund ? <div className="field"><label htmlFor="return-account">Nhận tiền vào quỹ</label><select id="return-account" name="accountId" required>{accounts.map(account => <option key={account.id} value={account.id}>{account.label}</option>)}</select></div>
    : <input type="hidden" name="accountId" value="" />}
   <div className="field"><label htmlFor="return-note">Ghi chú</label><input id="return-note" name="note" maxLength={300} placeholder="Ví dụ: hàng vỡ, sai quy cách" /></div>
   {over && <p className="form-message" role="alert">{over.materialName}: chỉ còn trả được {formatQuantity(over.returnable)} {over.unit}.</p>}
   {message && <p className="form-message" role="alert">{message}</p>}
   <button className="button button-primary action-full" type="submit" disabled={pending || !chosen || Boolean(over)}>{pending ? "Đang lưu…" : "Hoàn thành"}</button>
  </aside>
 </form>;
}
