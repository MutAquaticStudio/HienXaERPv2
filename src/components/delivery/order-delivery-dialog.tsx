"use client";

import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { NumberEntry } from "@/components/documents/editor/number-entry";
import { Dialog } from "@/components/ui/dialog";
import { formatQuantity } from "@/lib/core/quantity";
import { decimalForEditing, normalizeDecimalInput } from "@/lib/core/vn-number";
import type { WarehouseAvailability } from "@/modules/inventory/availability";
import { createDeliveryForOrderAction, type OrderDeliveryResult } from "@/modules/delivery/order-delivery-actions";

export type OrderDeliveryLine = {
  salesOrderLineId: string; lineNumber: number; name: string; materialId: string;
  /** Unit the line was sold in and its ratio to the base unit (1 bao = 50 kg). */
  symbol: string; baseSymbol: string; ratio: { numerator: string; denominator: string };
  requiredBase: string;
  allocations: { id: string; mode: string; warehouseId: string | null; allocatedBase: string; consumedBase: string }[];
};
type Props = {
  orderId: string; lines: OrderDeliveryLine[]; warehouses: { id: string; name: string }[]; availability?: WarehouseAvailability;
  defaultScheduledAt: string;
  /** Present only with the right to assign deliveries. */
  resources?: { employees: { id: string; name: string }[]; vehicles: { id: string; label: string }[] } | null;
};

const zero = new Decimal(0);
const perBase = (line: OrderDeliveryLine) => new Decimal(line.ratio.numerator).div(line.ratio.denominator);

/**
 * What one line can still get from a warehouse: left to deliver, minus what other sources (other warehouses, supplier
 * direct) are already allocated to cover. In base units.
 */
export function deliverableBase(line: OrderDeliveryLine, warehouseId: string): Decimal {
  const consumed = line.allocations.reduce((sum, item) => sum.plus(item.consumedBase), zero);
  const remaining = new Decimal(line.requiredBase).minus(consumed);
  const otherSources = line.allocations.filter((item) => !(item.mode === "WAREHOUSE" && item.warehouseId === warehouseId))
    .reduce((sum, item) => sum.plus(Decimal.max(0, new Decimal(item.allocatedBase).minus(item.consumedBase))), zero);
  return Decimal.max(0, remaining.minus(otherSources));
}

function addHours(local: string, hours: number) {
  const [date, time] = local.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const value = new Date(Date.UTC(y, m - 1, d, hh + hours, mm));
  return value.toISOString().slice(0, 16);
}

function OrderDeliveryForm({ orderId, lines, warehouses, availability, defaultScheduledAt, resources, onClose }: Props & { onClose: () => void }) {
  const router = useRouter();
  const [operationId] = useState(() => crypto.randomUUID());
  const firstWithStock = warehouses.find((warehouse) => lines.some((line) => availability?.positions.some((row) => row.warehouse_id === warehouse.id && row.material_id === line.materialId && new Decimal(row.available_base_quantity).gt(0))));
  const [warehouseId, setWarehouseId] = useState(firstWithStock?.id ?? warehouses[0]?.id ?? "");
  const suggested = useMemo(() => Object.fromEntries(lines.map((line) => {
    const amount = deliverableBase(line, warehouseId).div(perBase(line)).toDecimalPlaces(6, Decimal.ROUND_DOWN);
    return [line.salesOrderLineId, amount.gt(0) ? amount.toFixed() : ""];
  })), [lines, warehouseId]);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt);
  const [assign, setAssign] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState<string | null>(null);
  const [result, setResult] = useState<OrderDeliveryResult | null>(null);
  const [pending, startTransition] = useTransition();
  const quantityOf = (line: OrderDeliveryLine) => typed[line.salesOrderLineId] ?? suggested[line.salesOrderLineId] ?? "";
  const chosen = lines.flatMap((line) => {
    const value = normalizeDecimalInput(quantityOf(line));
    return value && new Decimal(value).gt(0) ? [{ salesOrderLineId: line.salesOrderLineId, quantity: value }] : [];
  });
  const invalid = lines.some((line) => quantityOf(line) && !normalizeDecimalInput(quantityOf(line)));
  const ready = !!warehouseId && !!scheduledAt && chosen.length > 0 && !invalid && (!assign || (employeeId && vehicleId));

  function submit() {
    if (pending || !ready) return;
    startTransition(async () => {
      try {
        const saved = await createDeliveryForOrderAction({ operationId, orderId, warehouseId, scheduledAt, lines: chosen,
          assignment: assign ? { employeeId, vehicleId, scheduledEnd: scheduledEnd ?? addHours(scheduledAt, 4) } : null });
        setResult(saved);
        if (saved.success && saved.deliveryId) { onClose(); router.push(`/admin/deliveries/${saved.deliveryId}`); }
      } catch {
        setResult({ success: false, outcomeUnknown: true, message: "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra; hệ thống không tạo trùng phiếu." });
      }
    });
  }

  return <div className="order-delivery material-units">
    <div className="form-grid">
      <div className="field"><label htmlFor="order-delivery-warehouse">Kho xuất *</label>
        <select id="order-delivery-warehouse" value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); setTyped({}); }} disabled={pending}>
          {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></div>
      <div className="field"><label htmlFor="order-delivery-at">Giao lúc *</label>
        <input id="order-delivery-at" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} disabled={pending} /></div>
    </div>
    <div className="table-wrap"><table>
      <thead><tr><th scope="col">Vật tư</th><th scope="col" className="numeric">Còn phải giao</th><th scope="col" className="numeric">Tồn kho xuất</th><th scope="col" className="numeric">Giao lần này</th></tr></thead>
      <tbody>{lines.map((line) => {
        const ratio = perBase(line);
        const left = deliverableBase(line, warehouseId);
        const stock = availability?.positions.find((row) => row.warehouse_id === warehouseId && row.material_id === line.materialId);
        const value = normalizeDecimalInput(quantityOf(line));
        const needBase = value ? new Decimal(value).mul(ratio) : null;
        const short = !!stock && !!needBase && needBase.gt(stock.available_base_quantity);
        const over = !!needBase && needBase.gt(left);
        return <tr key={line.salesOrderLineId}>
          <td data-label="Vật tư"><strong>{line.name}</strong><small className="table-subline">Dòng {line.lineNumber}</small></td>
          <td className="numeric" data-label="Còn phải giao">{formatQuantity(left.div(ratio).toDecimalPlaces(6, Decimal.ROUND_DOWN).toFixed())} {line.symbol}
            {line.symbol !== line.baseSymbol && <small className="table-subline">{formatQuantity(left.toFixed())} {line.baseSymbol}</small>}</td>
          <td className="numeric" data-label="Tồn kho xuất">{stock ? <>{formatQuantity(stock.available_base_quantity)} {line.baseSymbol}</> : availability ? <span className="muted">Chưa có tồn</span> : <span className="muted">—</span>}</td>
          <td className="numeric" data-label="Giao lần này">
            <span className="unit-ratio"><NumberEntry aria-label={`Số lượng giao ${line.name}`} inputMode="decimal" value={quantityOf(line)} normalize={normalizeDecimalInput} display={decimalForEditing}
              placeholder="0" onValue={(next) => setTyped((all) => ({ ...all, [line.salesOrderLineId]: next }))} disabled={pending || left.lte(0)} /><span>{line.symbol}</span></span>
            {over && <small className="field-error" role="alert">Vượt phần còn phải giao.</small>}
            {!over && short && <small className="field-error" role="alert">Tồn kho xuất không đủ.</small>}
          </td>
        </tr>;
      })}</tbody>
    </table></div>
    <p className="muted">Để trống hoặc 0 ở dòng chưa giao lần này. Kho chỉ trừ khi bàn giao hàng lên xe; lập phiếu giữ tồn khả dụng cho phiếu.</p>
    {resources && <fieldset className="order-delivery-assign">
      <legend><label className="check-inline"><input type="checkbox" checked={assign} onChange={(event) => setAssign(event.target.checked)} disabled={pending} /> Phân xe và người giao ngay</label></legend>
      {assign && <div className="form-grid">
        <div className="field"><label htmlFor="order-delivery-employee">Người giao *</label><select id="order-delivery-employee" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} disabled={pending}>
          <option value="">Chọn người giao...</option>{resources.employees.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
        <div className="field"><label htmlFor="order-delivery-vehicle">Xe *</label><select id="order-delivery-vehicle" value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} disabled={pending}>
          <option value="">Chọn xe...</option>{resources.vehicles.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></div>
        <div className="field"><label htmlFor="order-delivery-end">Dự kiến xong *</label>
          <input id="order-delivery-end" type="datetime-local" value={scheduledEnd ?? addHours(scheduledAt, 4)} onChange={(event) => setScheduledEnd(event.target.value)} disabled={pending} /></div>
      </div>}
    </fieldset>}
    {result && !result.success && <p className="form-message" role="alert">{result.message}</p>}
    <div className="form-actions">
      <button type="button" className="button button-primary" disabled={pending || !ready} onClick={submit}>
        {pending ? "Đang lập phiếu..." : result?.outcomeUnknown ? "Lập lại đúng thao tác" : `Lập phiếu giao (${chosen.length} dòng)`}</button>
    </div>
  </div>;
}

/** "Lập phiếu giao" on a confirmed order: one popup instead of allocating per line and then creating the delivery. */
export function OrderDeliveryButton(props: Props) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="button button-primary action-full" onClick={() => setOpen(true)}>Lập phiếu giao</button>
    {open && <Dialog size="lg" eyebrow="Đơn bán" title="Lập phiếu giao" onClose={() => setOpen(false)} initialFocusId="order-delivery-warehouse"
      description="Lượng còn phải giao được điền sẵn theo đơn vị đã bán; sửa nếu giao một phần.">
      <OrderDeliveryForm {...props} onClose={() => setOpen(false)} />
    </Dialog>}
  </>;
}
