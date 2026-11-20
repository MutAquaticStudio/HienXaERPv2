import Link from "next/link";
import type { ReactNode } from "react";
import { ActionNotice } from "@/components/sales/action-notice";
import { AxButtonLink, AxPageHead, AxStatus, toneOf } from "@/components/astryx/ax-kit";
import { AxBar, AxDetails, AxFacts, AxLegacy, AxPanel, AxSteps, AxTable, AxTwoCol } from "@/components/astryx/buystock-kit";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatQuantity } from "@/lib/core/quantity";
import { purchaseStateLabel, purchaseStateTone } from "@/modules/purchasing/presentation";

export type AxPoOrder = { id: string; purchase_order_number: string; supplier_name_snapshot: string; destination_type: string; destination_name_snapshot: string; destination_address_snapshot: string; source_sales_order_id: string | null; state: string; expected_at: string | null; total_cost_vnd: string | null };
export type AxPoLine = { id: string; material_name_snapshot: string; quantity: string; symbol: string; unit_cost_vnd: string | null; line_total_cost_vnd: string | null; allocationText: string; progress: { received: string; supplier: string } | null };
export type AxPoReceipt = { id: string; receipt_number: string; received_at: string; received_base_quantity: string; payable_amount_vnd: string | null };
export type AxPoFulfillment = { id: string; supplier_reference: string | null; verified_at: string; supplier_base_quantity: string; payable_amount_vnd: string | null };

const STEPS = ["DRAFT", "CONFIRMED", "CLOSED"];

/** Chi tiết đơn mua kiểu Astryx: dữ liệu và nhãn (purchaseStateLabel) như Classic; các form hành động Classic được bao trong thẻ Astryx và giữ nguyên. */
export function AstryxPurchaseOrderDetail({ order, lines, receipts, fulfillments, payable, terms, canReadSales, canReturn, canEvidence, evidence, actions, nextSteps, recovery, notice, error }: {
  order: AxPoOrder; lines: AxPoLine[]; receipts: AxPoReceipt[]; fulfillments: AxPoFulfillment[]; payable: string; terms: string | null;
  canReadSales: boolean; canReturn: boolean; canEvidence: boolean; evidence: ReactNode; actions: ReactNode; nextSteps: ReactNode; recovery: ReactNode; notice?: string; error?: string;
}) {
  const stepAt = STEPS.indexOf(order.state);
  const toWarehouse = order.destination_type === "WAREHOUSE";
  const arrivals = receipts.length + fulfillments.length;
  return <>
    <AxPageHead crumbs={["Mua hàng", "Đơn mua", order.purchase_order_number]} title={order.purchase_order_number}
      actions={<><AxStatus tone={toneOf(purchaseStateTone(order.state))}>{purchaseStateLabel(order.state)}</AxStatus><a className="hx-btn" href={`/api/purchase-orders/${order.id}/pdf`}>Tải PDF đơn mua</a><AxButtonLink href="/admin/purchase-orders">Về danh sách</AxButtonLink></>} />
    <ActionNotice notice={notice} error={error} />
    {nextSteps}
    {recovery}
    <AxFacts items={[
      { label: "Nhà cung cấp", value: order.supplier_name_snapshot, sub: purchaseStateLabel(order.destination_type) },
      { label: "Điểm đến", value: order.destination_name_snapshot, sub: order.expected_at ? `Dự kiến ${formatBusinessDateTime(order.expected_at)}` : "Chưa hẹn ngày" },
      { label: "Đã nhận / NCC giao", value: `${arrivals} lần xác minh` },
      { label: "Phải trả đã phát sinh", value: payable, sub: "Chỉ phần đã nhận hoặc đã xác minh" },
    ]} />
    <AxTwoCol wide left={<>
      <AxPanel title="Điểm đến và dòng mua" pad={false}>
        <div style={{ padding: 16 }}><AxDetails items={[
          { label: "Điểm đến", value: order.destination_name_snapshot },
          { label: "Dự kiến", value: order.expected_at ? formatBusinessDateTime(order.expected_at) : "Chưa hẹn" },
          { label: "Địa chỉ nhận đã lưu", value: order.destination_address_snapshot, full: true },
          { label: "Điều khoản mua", value: terms || "Chưa ghi" },
          { label: "Tổng giá mua", value: order.total_cost_vnd == null ? "Không có quyền xem" : formatVnd(vnd(order.total_cost_vnd)) },
          ...(order.source_sales_order_id ? [{ label: "Đơn bán nguồn", value: canReadSales ? <Link className="hx-code" href={`/admin/orders/${order.source_sales_order_id}`}>Mở đơn bán</Link> : <span className="hx-muted">Không có quyền xem đơn bán</span> }] : []),
        ]} /></div>
        <div className="bs-scroll"><table className="bs-table" aria-label="Dòng mua">
          <thead><tr><th scope="col">Vật tư</th><th scope="col" className="hx-num">Số lượng</th><th scope="col">Tiến độ</th><th scope="col" className="hx-num">Giá mua</th><th scope="col" className="hx-num">Thành tiền</th><th scope="col">Phân nguồn</th></tr></thead>
          <tbody>{lines.map((line) => {
            const done = line.progress ? Number(toWarehouse ? line.progress.received : line.progress.supplier) : null;
            return <tr key={line.id}>
              <td>{line.material_name_snapshot}</td>
              <td className="hx-num">{formatQuantity(line.quantity)} {line.symbol}</td>
              <td>{done == null ? <span className="hx-muted">—</span> : <AxBar label={`Tiến độ ${line.material_name_snapshot}`} value={done} max={Number(line.quantity)} text={`${formatQuantity(String(done))}/${formatQuantity(line.quantity)} ${line.symbol}`} />}</td>
              <td className="hx-num">{line.unit_cost_vnd == null ? "Ẩn theo quyền" : formatVnd(vnd(line.unit_cost_vnd))}</td>
              <td className="hx-num">{line.line_total_cost_vnd == null ? "Ẩn theo quyền" : formatVnd(vnd(line.line_total_cost_vnd))}</td>
              <td>{line.allocationText}</td></tr>;
          })}</tbody></table></div>
      </AxPanel>
      <AxPanel title="Lịch sử nhận hàng và giao thẳng">
        {receipts.map((row) => <p key={row.id} style={{ margin: "0 0 8px" }}><b>{row.receipt_number}</b> · Nhận {formatQuantity(row.received_base_quantity)} đơn vị cơ sở · {row.payable_amount_vnd ? formatVnd(vnd(row.payable_amount_vnd)) : "Giá trị ẩn"} {canReturn && <Link className="hx-code" href={`/admin/purchases/returns/new?receipt=${row.id}`}>Trả hàng</Link>}</p>)}
        {fulfillments.map((row) => <p key={row.id} style={{ margin: "0 0 8px" }}><b>{row.supplier_reference ?? "NCC giao thẳng"}</b> · NCC xác minh {formatQuantity(row.supplier_base_quantity)} đơn vị cơ sở · {row.payable_amount_vnd ? formatVnd(vnd(row.payable_amount_vnd)) : "Giá trị ẩn"}</p>)}
        {arrivals === 0 && <p className="hx-muted" style={{ margin: 0 }}>Chưa có phiếu nhập kho hoặc xác minh nhà cung cấp giao thẳng.</p>}
      </AxPanel>
      {canEvidence && arrivals > 0 && <AxLegacy title="Minh chứng nguồn mua">{evidence}</AxLegacy>}
    </>} right={<>
      {stepAt >= 0 && <AxPanel title="Tiến trình đơn mua"><AxSteps label="Tiến trình đơn mua" steps={STEPS.map(purchaseStateLabel)} at={stepAt} /></AxPanel>}
      <AxLegacy title="Hành động tiếp theo" sub="Nhận hàng ghi tồn và công nợ phải trả theo phần đã nhận">{actions}</AxLegacy>
    </>} />
  </>;
}
