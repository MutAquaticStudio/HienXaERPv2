"use client";

import { ReliableCommandForm } from "@/components/reliable-command-form";
import { recordWarehouseTransferAction } from "./transfer-actions";

type Option = { id: string; label: string };
import { transferEventLabel } from "./transfer-presentation";
export function TransferEventForm({ transferId, kind, version, operationId, scope, lots, issues, canRecord }: {
 transferId: string; kind: keyof typeof transferEventLabel; version: number; operationId: string; scope: string; lots: Option[]; issues: Option[]; canRecord: boolean;
}) {
 const direct = kind === "DISPATCH" || kind === "CLOSE_DISPATCH", closed = kind === "CLOSE_DISPATCH";
 return <ReliableCommandForm action={recordWarehouseTransferAction} command="record_warehouse_transfer_event" operationId={operationId} scope={scope} className="command-panel">
  <input type="hidden" name="transferId" value={transferId} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="version" value={version} />
  {direct ? <><input type="hidden" name="dispatchId" value="" /><input type="hidden" name="issueId" value="" /></> : <><label htmlFor={`transfer-lot-${kind}`}>Đợt xuất</label><select id={`transfer-lot-${kind}`} name="dispatchId" required><option value="">Chọn đợt xuất</option>{lots.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
   {kind === "REPORT_SHORTAGE" ? <input type="hidden" name="issueId" value="" /> : <><label htmlFor={`transfer-issue-${kind}`}>Báo thiếu</label><select id={`transfer-issue-${kind}`} name="issueId" required={kind === "APPROVE_LOSS"}><option value="">Nhận bình thường</option>{issues.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></>}
  </>}
  {closed ? <input type="hidden" name="quantity" value="0" /> : <><label htmlFor={`transfer-q-${kind}`}>Số lượng (đơn vị gốc)</label><input id={`transfer-q-${kind}`} name="quantity" inputMode="decimal" required /></>}
  <label htmlFor={`transfer-note-${kind}`}>Ghi chú {transferEventLabel[kind].toLowerCase()} (không bắt buộc)</label><input id={`transfer-note-${kind}`} name="reason" maxLength={500} />
  <button className="button button-primary" type="submit" disabled={!canRecord}>{transferEventLabel[kind]}</button>
 </ReliableCommandForm>;
}
