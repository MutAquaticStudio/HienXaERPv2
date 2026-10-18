import Decimal from "decimal.js";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { formatQuantity } from "@/lib/core/quantity";
import { autoSourceOrderAction } from "@/modules/sales/actions";

export type SourcingLine = { id: string; name: string; required: string; baseSymbol: string };
export type SourcingAllocation = { lineId: string; mode: string; quantity: string; warehouseName: string | null;
  purchaseOrder: { id: string; number: string; state: string } | null };
export type SourcingRun = { createdAt: string; reasons: Record<string, string> };

const purchaseState: Record<string, string> = { DRAFT: "nháp chờ duyệt", CONFIRMED: "đã duyệt", CLOSED: "đã đóng", CANCELLED: "đã hủy" };

/**
 * D19 "Nguồn hàng": what each line is sourced from (warehouse, supplier-direct purchase order) and why, as decided by the
 * system; the user only looks and acts on exceptions.
 */
export function OrderSourcingPanel({ orderId, lines, allocations, run, canSource, confirmed }: {
  orderId: string; lines: SourcingLine[]; allocations: SourcingAllocation[]; run: SourcingRun | null; canSource: boolean; confirmed: boolean;
}) {
  const remaining = new Map(lines.map((line) => [line.id, allocations.filter((item) => item.lineId === line.id)
    .reduce((left, item) => left.minus(item.quantity), new Decimal(line.required))]));
  const missing = lines.some((line) => remaining.get(line.id)!.gt(0));
  return <section className="card card-pad order-sourcing" aria-labelledby="order-sourcing-title">
    <div className="section-head flush"><h2 id="order-sourcing-title">Nguồn hàng</h2>
      {confirmed && canSource && missing && <form action={autoSourceOrderAction}><input type="hidden" name="entityId" value={orderId} />
        <input type="hidden" name="operationId" value={randomUUID()} /><button className="button button-secondary" type="submit">Tự phân nguồn</button></form>}</div>
    {run && <p className="muted">Hệ thống tự phân nguồn lúc {formatBusinessDateTime(run.createdAt)}: ưu tiên kho, phần thiếu đặt NCC giao thẳng giá thấp nhất.</p>}
    {!confirmed && <p className="muted">Xác nhận đơn để hệ thống tự phân nguồn: lấy kho trước, phần thiếu tạo đơn mua NCC giao thẳng chờ duyệt.</p>}
    <ul className="sourcing-lines">
      {lines.map((line) => {
        const rows = allocations.filter((item) => item.lineId === line.id);
        const left = remaining.get(line.id)!;
        return <li key={line.id}>
          <div className="sourcing-line-head"><strong>{line.name}</strong>
            {left.lte(0) ? <StatusBadge tone="success">Đủ nguồn</StatusBadge> : <StatusBadge tone="warning">{`Thiếu ${formatQuantity(left.toFixed())} ${line.baseSymbol}`}</StatusBadge>}</div>
          {rows.length > 0 && <ul className="sourcing-sources">{rows.map((item, index) => <li key={index}>
            {item.mode === "SUPPLIER_DIRECT"
              ? <>NCC giao thẳng · {item.purchaseOrder ? <Link className="code-link mono" href={`/admin/purchase-orders/${item.purchaseOrder.id}`}>{item.purchaseOrder.number}</Link> : "đơn mua"}
                {item.purchaseOrder && ` (${purchaseState[item.purchaseOrder.state] ?? item.purchaseOrder.state})`}</>
              : <>{item.warehouseName ?? "Kho"}</>}
            {" · "}<span className="mono">{formatQuantity(item.quantity)} {line.baseSymbol}</span></li>)}</ul>}
          {run?.reasons[line.id] && <p className="muted">{run.reasons[line.id]}</p>}
        </li>;
      })}
    </ul>
  </section>;
}

/** Reasons of the latest run per line, from the stored plan. */
export function sourcingRun(row: { created_at: string; plan: { lines?: { line_id: string; reason?: string }[] } } | null): SourcingRun | null {
  if (!row) return null;
  return { createdAt: row.created_at, reasons: Object.fromEntries((row.plan.lines ?? []).filter((line) => line.reason).map((line) => [line.line_id, line.reason!])) };
}
