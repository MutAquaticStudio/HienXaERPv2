"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatQuantity } from "@/lib/core/quantity";
import { splitDeliveryAction } from "@/modules/delivery/split-actions";
import { buildSplitPlan, remainderOf, SPLIT_MAX_PARTS, SPLIT_MIN_PARTS, type SplitAssignment, type SplitQuantities } from "@/modules/delivery/split";

export type SplitFormLine = { id: string; name: string; planned: string; unit: string };
export type SplitOption = { id: string; label: string };

/**
 * D46 "Tách phiếu giao": one row per line, one column per new note. Part 1 keeps whatever the other parts do not take.
 * Each part may get a driver, vehicle and time now; left empty it waits for dispatch like a new note.
 */
export function SplitDeliveryForm({ deliveryId, version, lines, employees, vehicles, allowAssign, defaultStart }: {
  deliveryId: string; version: number; lines: SplitFormLine[]; employees: SplitOption[]; vehicles: SplitOption[];
  /** False for supplier-direct notes: they are handed to the supplier's carrier on each new note afterwards. */
  allowAssign: boolean; defaultStart: string;
}) {
  const [partCount, setPartCount] = useState(SPLIT_MIN_PARTS);
  const [quantities, setQuantities] = useState<SplitQuantities>({});
  const [assignments, setAssignments] = useState<SplitAssignment[]>(() => Array.from({ length: SPLIT_MAX_PARTS }, () => ({ employeeId: "", vehicleId: "", scheduledStart: "" })));
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; number: string; state: string }[] | null>(null);
  const partNumbers = Array.from({ length: partCount }, (_, index) => index + 1);
  const plan = useMemo(() => buildSplitPlan(lines.map((line) => ({ id: line.id, planned: line.planned })), partCount, quantities, assignments),
    [lines, partCount, quantities, assignments]);

  // Any change to what will be sent is a new command; the same click again (after an unknown result) reuses the id.
  function changed() { setOperationId(crypto.randomUUID()); setMessage(null); }
  /** `index` is 0 for Phiếu 1 (never typed: it keeps the rest), 1 for Phiếu 2… */
  function setQuantity(lineId: string, index: number, value: string) {
    setQuantities((current) => {
      const row = [...(current[lineId] ?? [])];
      row[index] = value;
      return { ...current, [lineId]: row };
    });
    changed();
  }
  function setAssignment(part: number, field: keyof SplitAssignment, value: string) {
    setAssignments((current) => current.map((item, index) => index === part ? { ...item, [field]: value,
      ...(field === "employeeId" && value && !item.scheduledStart ? { scheduledStart: defaultStart } : {}) } : item));
    changed();
  }
  async function submit() {
    if (!plan.ok) { setMessage(plan.message); return; }
    setBusy(true); setMessage(null);
    const result = await splitDeliveryAction({ deliveryId, version, parts: plan.parts, operationId }).catch(() => null);
    setBusy(false);
    if (result?.status === "SUCCESS") { setDone(result.deliveries); return; }
    if (result?.status === "FAILED") setOperationId(crypto.randomUUID());
    setMessage(result?.message ?? "Chưa xác định được kết quả. Bấm lại đúng nút này để kiểm tra — hệ thống không tách trùng.");
  }

  if (done) return <section className="card card-pad" aria-live="polite">
    <h2>Đã tách thành {done.length} phiếu</h2>
    <p className="muted">Phiếu gốc đã hủy, hàng giữ chỗ chuyển sang các phiếu mới. Công nợ phát sinh theo từng phiếu khi xác minh giao.</p>
    <ul className="split-result">{done.map((item) => <li key={item.id}><Link className="code-link" href={`/admin/deliveries/${item.id}`}>{item.number}</Link>
      <span className="muted"> · {item.state === "ASSIGNED" ? "Đã phân người và xe" : "Chờ điều phối"}</span></li>)}</ul>
    <p><Link className="button button-secondary" href="/admin/dispatch">Mở bảng điều phối</Link></p>
  </section>;

  return <section className="card card-pad split-form">
    <div className="field">
      <span className="field-label" id="split-count-label">Tách thành</span>
      <div className="segmented" role="group" aria-labelledby="split-count-label">
        {Array.from({ length: SPLIT_MAX_PARTS - SPLIT_MIN_PARTS + 1 }, (_, index) => index + SPLIT_MIN_PARTS).map((count) =>
          <button key={count} type="button" className={count === partCount ? "active" : undefined} aria-pressed={count === partCount}
            onClick={() => { setPartCount(count); changed(); }}>{count} phiếu</button>)}
      </div>
    </div>
    <p className="muted">Nhập số lượng cho Phiếu 2 trở đi. Phần còn lại của mỗi dòng tự để ở Phiếu 1. Được chia lẻ một dòng cho nhiều phiếu.</p>
    <div className="table-wrap"><table>
      <thead><tr><th>Dòng hàng</th><th className="numeric">Kế hoạch</th>{partNumbers.map((part) => <th key={part} className="numeric">Phiếu {part}</th>)}</tr></thead>
      <tbody>{lines.map((line) => {
        const row = quantities[line.id] ?? [];
        const left = remainderOf({ id: line.id, planned: line.planned }, row.slice(1, partCount));
        return <tr key={line.id}>
          <td>{line.name}</td>
          <td className="numeric">{formatQuantity(line.planned)} {line.unit}</td>
          <td className={`numeric${left.isNegative() ? " text-danger" : ""}`} aria-label={`Phiếu 1 giữ lại của ${line.name}`}>{formatQuantity(left.toFixed())} {line.unit}</td>
          {partNumbers.slice(1).map((part) => <td key={part} className="numeric">
            <input inputMode="decimal" aria-label={`${line.name} cho Phiếu ${part} (${line.unit})`} placeholder="0"
              value={row[part - 1] ?? ""} onChange={(event) => setQuantity(line.id, part - 1, event.target.value)} />
          </td>)}
        </tr>;
      })}</tbody>
    </table></div>
    {allowAssign ? <div className="split-assign-grid">
      {partNumbers.map((part) => {
        const assignment = assignments[part - 1];
        return <fieldset key={part} className="split-assign">
          <legend>Phiếu {part}</legend>
          <div className="field"><label htmlFor={`split-employee-${part}`}>Người giao</label>
            <select id={`split-employee-${part}`} value={assignment.employeeId} onChange={(event) => setAssignment(part - 1, "employeeId", event.target.value)}>
              <option value="">Điều phối sau</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
          <div className="field"><label htmlFor={`split-vehicle-${part}`}>Xe</label>
            <select id={`split-vehicle-${part}`} value={assignment.vehicleId} onChange={(event) => setAssignment(part - 1, "vehicleId", event.target.value)}>
              <option value="">Chọn xe</option>{vehicles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
          <div className="field"><label htmlFor={`split-start-${part}`}>Giờ bắt đầu giao</label>
            <input id={`split-start-${part}`} type="datetime-local" value={assignment.scheduledStart} onChange={(event) => setAssignment(part - 1, "scheduledStart", event.target.value)} /></div>
        </fieldset>;
      })}
    </div> : <p className="muted">Phiếu NCC giao thẳng: sau khi tách, phân đầu mối NCC/xe ngoài trên từng phiếu mới.</p>}
    {allowAssign && <p className="muted">Để trống người giao: phiếu vào “Chờ điều phối” và đi theo chế độ tự điều phối của chi nhánh. Giờ Việt Nam.</p>}
    {message && <p className="form-message" role="alert">{message}</p>}
    <button className="button button-primary" type="button" disabled={busy} onClick={submit}>{busy ? "Đang tách…" : `Tách thành ${partCount} phiếu`}</button>
  </section>;
}
