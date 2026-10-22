"use client";

import { ReliableCommandForm } from "@/components/reliable-command-form";
import { createWarehouseTransferAction, recordWarehouseTransferAction } from "./transfer-actions";

type Option = { id: string; label: string };
import { transferEventLabel } from "./transfer-presentation";
export function CreateTransferForm({ operationId, scope, warehouses, materials }: { operationId: string; scope: string; warehouses: Option[]; materials: Option[] }) {
 return <ReliableCommandForm action={createWarehouseTransferAction} command="create_warehouse_transfer" operationId={operationId} scope={scope} className="command-panel">
  <label htmlFor="transfer-from">Kho đi</label><select id="transfer-from" name="fromWarehouseId" required><option value="">Chọn kho đi</option>{warehouses.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
  <label htmlFor="transfer-to">Kho đến</label><select id="transfer-to" name="toWarehouseId" required><option value="">Chọn kho đến</option>{warehouses.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
  <label htmlFor="transfer-material">Vật tư chuyển</label><select id="transfer-material" name="materialId" required><option value="">Chọn vật tư</option>{materials.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
  <label htmlFor="transfer-quantity">Lượng kế hoạch theo đơn vị cơ sở</label><input id="transfer-quantity" name="quantity" inputMode="decimal" required />
  <label htmlFor="transfer-reason">Ghi chú (không bắt buộc)</label><input id="transfer-reason" name="reason" maxLength={500} />
  <button className="button button-primary" type="submit" disabled={warehouses.length < 2 || !materials.length}>Mở phiếu chuyển kho</button>
 </ReliableCommandForm>;
}
export function TransferEventForm({ transferId, kind, version, operationId, scope, lots, issues, canRecord }: {
 transferId: string; kind: keyof typeof transferEventLabel; version: number; operationId: string; scope: string; lots: Option[]; issues: Option[]; canRecord: boolean;
}) {
 const direct = kind === "DISPATCH" || kind === "CLOSE_DISPATCH", closed = kind === "CLOSE_DISPATCH";
 return <ReliableCommandForm action={recordWarehouseTransferAction} command="record_warehouse_transfer_event" operationId={operationId} scope={scope} className="command-panel">
  <input type="hidden" name="transferId" value={transferId} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="version" value={version} />
  {direct ? <><input type="hidden" name="dispatchId" value="" /><input type="hidden" name="issueId" value="" /></> : <><label htmlFor={`transfer-lot-${kind}`}>Đợt xuất nguồn</label><select id={`transfer-lot-${kind}`} name="dispatchId" required><option value="">Chọn đợt xuất</option>{lots.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
   {kind === "REPORT_SHORTAGE" ? <input type="hidden" name="issueId" value="" /> : <><label htmlFor={`transfer-issue-${kind}`}>Hồ sơ thiếu nguồn</label><select id={`transfer-issue-${kind}`} name="issueId" required={kind === "APPROVE_LOSS"}><option value="">Nhận thông thường, chưa có hồ sơ thiếu</option>{issues.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></>}
  </>}
  {closed ? <input type="hidden" name="quantity" value="0" /> : <><label htmlFor={`transfer-q-${kind}`}>Lượng thực tế theo đơn vị cơ sở</label><input id={`transfer-q-${kind}`} name="quantity" inputMode="decimal" required /></>}
  <label htmlFor={`transfer-note-${kind}`}>Ghi chú {transferEventLabel[kind].toLowerCase()} (không bắt buộc)</label><input id={`transfer-note-${kind}`} name="reason" maxLength={500} />
  <button className="button button-primary" type="submit" disabled={!canRecord}>{transferEventLabel[kind]}</button>
 </ReliableCommandForm>;
}
