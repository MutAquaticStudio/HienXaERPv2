"use client";

import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { NumberEntry } from "@/components/documents/editor/number-entry";
import { Dialog } from "@/components/ui/dialog";
import { businessInputValue } from "@/lib/core/business-time";
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
  /** Business "now" when the page was drawn (datetime-local value). */
  defaultScheduledAt: string;
  /** The customer's requested delivery time when it is still ahead: the popup then starts on "Hẹn ngày giờ" at that time. */
  requestedAt?: string | null;
  /** Branch "thời gian mỗi điểm giao" (minutes). */
  stopMinutes?: number;
  /** Purchasing may order a short line straight from a supplier ("Đặt NCC giao thẳng"). */
  canOrderDirect?: boolean;
  /** Present only with the right to assign deliveries. */
  resources?: { employees: { id: string; name: string }[]; vehicles: DeliveryVehicle[] } | null;
};
/** A truck and how much it carries: its capacity ("4 tấn") and, per order line, the same in the line's unit (null: no conversion). */
export type DeliveryVehicle = { id: string; label: string; capacity?: { quantity: string; unit: string; perLine: Record<string, string | null> } | null };

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

const localLabel = (value: string) => { const [date, time] = value.split("T"); const [y, m, d] = date.split("-"); return `${time} ${d}/${m}/${y}`; };

function OrderDeliveryForm({ orderId, lines, warehouses, availability, defaultScheduledAt, requestedAt, stopMinutes = 60, canOrderDirect, resources, onClose }: Props & { onClose: () => void }) {
  const router = useRouter();
  const [operationId] = useState(() => crypto.randomUUID());
  const firstWithStock = warehouses.find((warehouse) => lines.some((line) => availability?.positions.some((row) => row.warehouse_id === warehouse.id && row.material_id === line.materialId && new Decimal(row.available_base_quantity).gt(0))));
  const [warehouseId, setWarehouseId] = useState(firstWithStock?.id ?? warehouses[0]?.id ?? "");
  const suggested = useMemo(() => Object.fromEntries(lines.map((line) => {
    const amount = deliverableBase(line, warehouseId).div(perBase(line)).toDecimalPlaces(6, Decimal.ROUND_DOWN);
    return [line.salesOrderLineId, amount.gt(0) ? amount.toFixed() : ""];
  })), [lines, warehouseId]);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"NOW" | "AT">(requestedAt ? "AT" : "NOW");
  const [scheduledAt, setScheduledAt] = useState(requestedAt ?? defaultScheduledAt);
  // "Giao ngay" keeps the moment it was first pressed, so pressing again after an unclear result sends the same command.
  const pressedAt = useRef<string | null>(null);
  const single = (rows?: { id: string }[]) => rows?.length === 1 ? rows[0].id : "";
  const [assign, setAssign] = useState(!!resources);
  const [employeeId, setEmployeeId] = useState(single(resources?.employees));
  const [vehicleId, setVehicleId] = useState(single(resources?.vehicles));
  const [result, setResult] = useState<OrderDeliveryResult | null>(null);
  const [pending, startTransition] = useTransition();
  const quantityOf = (line: OrderDeliveryLine) => typed[line.salesOrderLineId] ?? suggested[line.salesOrderLineId] ?? "";
  const rows = lines.map((line) => {
    const ratio = perBase(line);
    const left = deliverableBase(line, warehouseId);
    const stock = availability?.positions.find((row) => row.warehouse_id === warehouseId && row.material_id === line.materialId);
    const value = normalizeDecimalInput(quantityOf(line));
    const needBase = value ? new Decimal(value).mul(ratio) : null;
    const short = !!availability && !!needBase && needBase.gt(0) && needBase.gt(stock?.available_base_quantity ?? 0);
    const over = !!needBase && needBase.gt(left);
    return { line, ratio, left, stock, value, short, over };
  });
  const chosen = rows.flatMap((row) => row.value && new Decimal(row.value).gt(0) ? [{ salesOrderLineId: row.line.salesOrderLineId, quantity: row.value }] : []);
  const invalid = lines.some((line) => quantityOf(line) && !normalizeDecimalInput(quantityOf(line)));
  const shortRows = rows.filter((row) => row.short && !row.over);
  const blocked = rows.some((row) => row.short || row.over);
  // FB5: the chosen goods against the chosen truck, each line counted in its own unit (80 bao of a 4 tấn ≈ 80 bao truck is full).
  const vehicle = assign ? resources?.vehicles.find((row) => row.id === vehicleId) : undefined;
  const loadRows = vehicle?.capacity ? rows.filter((row) => row.value && new Decimal(row.value).gt(0)) : [];
  const unconvertible = loadRows.filter((row) => !vehicle?.capacity?.perLine[row.line.salesOrderLineId]);
  const fill = loadRows.reduce((sum, row) => { const carries = vehicle?.capacity?.perLine[row.line.salesOrderLineId];
    return carries && new Decimal(carries).gt(0) ? sum.plus(new Decimal(row.value!).div(carries)) : sum; }, zero);
  const overCapacity = fill.gt(1);
  const ready = !!warehouseId && (mode === "NOW" || !!scheduledAt) && chosen.length > 0 && !invalid && !blocked && (!assign || (employeeId && vehicleId)) && !overCapacity;

  function submit() {
    if (pending || !ready) return;
    if (mode === "NOW") pressedAt.current ??= businessInputValue(new Date());
    const at = mode === "NOW" ? pressedAt.current! : scheduledAt;
    startTransition(async () => {
      try {
        const saved = await createDeliveryForOrderAction({ operationId, orderId, warehouseId, scheduleMode: mode, scheduledAt: at, lines: chosen,
          assignment: assign ? { employeeId, vehicleId } : null });
        setResult(saved);
        if (!saved.success && !saved.outcomeUnknown) pressedAt.current = null;
        if (saved.success && saved.deliveryId) { onClose(); router.push(`/admin/deliveries/${saved.deliveryId}?notice=delivery-planned`); }
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
      <fieldset className="segmented-radio"><legend>Thời gian giao</legend>
        <label><input type="radio" name="order-delivery-mode" value="NOW" checked={mode === "NOW"} onChange={() => { setMode("NOW"); setResult(null); }} disabled={pending} /> Giao ngay</label>
        <label><input type="radio" name="order-delivery-mode" value="AT" checked={mode === "AT"} onChange={() => { setMode("AT"); setResult(null); }} disabled={pending} /> Hẹn ngày giờ</label>
      </fieldset>
      {mode === "AT" && <div className="field"><label htmlFor="order-delivery-at">Giao lúc *</label>
        <input id="order-delivery-at" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} disabled={pending} /></div>}
    </div>
    <div className="table-wrap"><table>
      <thead><tr><th scope="col">Vật tư</th><th scope="col" className="numeric">Còn phải giao</th><th scope="col" className="numeric">Tồn kho xuất</th><th scope="col" className="numeric">Giao lần này</th></tr></thead>
      <tbody>{rows.map(({ line, ratio, left, stock, over, short }) => <tr key={line.salesOrderLineId}>
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
      </tr>)}</tbody>
    </table></div>
    {shortRows.length > 0 && <div className="form-message" role="status">
      <p>Kho này không đủ hàng cho: {shortRows.map((row) => row.line.name).join(", ")}. Giảm số lượng, chọn kho khác{canOrderDirect ? " hoặc đặt NCC giao thẳng phần còn thiếu" : ""}.</p>
      {canOrderDirect && <p className="inline-actions">{shortRows.map((row) => <a key={row.line.salesOrderLineId} className="code-link" href={`/admin/purchase-orders/new?salesLineId=${row.line.salesOrderLineId}`}>Đặt NCC giao thẳng · {row.line.name}</a>)}</p>}
    </div>}
    <p className="muted">Để trống hoặc 0 ở dòng chưa giao lần này. Kho chỉ trừ khi bàn giao hàng lên xe; lập phiếu giữ tồn khả dụng cho phiếu.</p>
    {resources && <fieldset className="order-delivery-assign">
      <legend><label className="check-inline"><input type="checkbox" checked={assign} onChange={(event) => setAssign(event.target.checked)} disabled={pending} /> Phân xe và người giao</label></legend>
      {!assign && <p className="muted">Không chọn: hệ thống tự chọn xe có tài xế mặc định rảnh sớm nhất (theo Cài đặt → Tự điều phối), việc tự sang cổng thợ.</p>}
      {assign && <><div className="form-grid">
        <div className="field"><label htmlFor="order-delivery-employee">Người giao *</label><select id="order-delivery-employee" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} disabled={pending}>
          <option value="">Chọn người giao...</option>{resources.employees.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
        <div className="field"><label htmlFor="order-delivery-vehicle">Xe *</label><select id="order-delivery-vehicle" value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} disabled={pending}>
          <option value="">Chọn xe...</option>{resources.vehicles.map((row) => <option key={row.id} value={row.id}>{row.label}{row.capacity ? ` · chở ${formatQuantity(row.capacity.quantity)} ${row.capacity.unit}` : ""}</option>)}</select></div>
      </div>
      {vehicle?.capacity && <ul className="order-delivery-capacity">{lines.map((line) => { const carries = vehicle.capacity!.perLine[line.salesOrderLineId];
        return <li key={line.salesOrderLineId}>{carries ? `Xe chở tối đa ${formatQuantity(vehicle.capacity!.quantity)} ${vehicle.capacity!.unit} ≈ ${formatQuantity(carries)} ${line.symbol} ${line.name}`
          : `Chưa quy đổi được ${line.name} (${line.symbol}) sang ${vehicle.capacity!.unit} — thêm quy đổi trong Đơn vị tính của vật tư (vd 1 tấn = 20 bao).`}</li>; })}</ul>}
      {overCapacity && <p className="form-message" role="alert">Hàng chọn vượt sức chở của xe (khoảng {fill.mul(100).toDecimalPlaces(0, Decimal.ROUND_UP).toFixed()}%). Chọn xe khác, giảm số lượng hoặc tách thành hai phiếu.</p>}
      {unconvertible.length > 0 && !overCapacity && <p className="muted">Hệ thống sẽ kiểm tải khi lập phiếu; dòng chưa quy đổi được cần thêm quy đổi trước.</p>}
      <p className="muted">Việc tự hiện ở cổng thợ của người giao. Mỗi điểm giao tính {stopMinutes} phút{mode === "NOW" ? "; người hoặc xe đang bận thì tự xếp ngay sau việc trước" : ""}.</p></>}
    </fieldset>}
    {result && !result.success && <div className="form-message" role="alert"><p>{result.message}</p>
      {result.nextFreeAt && <button type="button" className="button button-secondary" onClick={() => { setMode("AT"); setScheduledAt(result.nextFreeAt!); setResult(null); }}>Hẹn lúc {localLabel(result.nextFreeAt)}</button>}</div>}
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
