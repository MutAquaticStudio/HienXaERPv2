import Link from "next/link";
import type { ReactNode } from "react";
import { AxButtonLink, AxPageHead } from "@/components/astryx/ax-kit";
import { AxCard, AxKV, AxKpi } from "@/components/astryx/fin-kit";
import { MoneyInput } from "@/components/ui/money-input";
import { formatBusinessDate } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import { financeStateLabel } from "@/modules/finance/presentation";

export type AxPayableDetail = { id: string; supplier_id?: string; supplier_name: string; source_label: string; source_id: string; purchase_order_id: string | null; expense_id: string | null; original_amount_vnd: string; adjustment_amount_vnd: string; allocated_amount_vnd: string; outstanding_amount_vnd: string; due_date: string; state: string };

/** Chi tiết khoản phải trả kiểu Astryx: số liệu, nguồn, phân bổ, điều chỉnh có kiểm chứng (cùng action và trường với Classic). */
export function AstryxPayableDetailView({ row, allocations, adjustments, canAdjust, adjustAction, operationId, notice }: {
  row: AxPayableDetail; allocations: { id: string; payment_id: string; amount_delta_vnd: string; allocated_at: string }[]; adjustments: { id: string; amount_delta_vnd: string; reason: string | null; evidence_object_id: string | null }[];
  canAdjust: boolean; adjustAction: (formData: FormData) => void | Promise<void>; operationId: string; notice: ReactNode;
}) {
  return <>
    <AxPageHead crumbs={["Tài chính", "Công nợ", "Phải trả", row.supplier_name]} title={row.supplier_name}
      actions={<>{row.purchase_order_id && <AxButtonLink href={`/admin/purchase-orders/${row.purchase_order_id}`}>Xem đơn mua</AxButtonLink>}<AxButtonLink href="/admin/payables">Về danh sách</AxButtonLink></>} />
    <p className="hx-muted" style={{ margin: "-8px 0 16px" }}>{row.source_label}; công nợ phải trả được theo dõi riêng với chi phí trong kỳ.</p>
    {notice}
    <div className="fk-kpis">
      <AxKpi label="Gốc" value={formatVnd(vnd(row.original_amount_vnd))} tone="n" />
      <AxKpi label="Điều chỉnh" value={formatVnd(vnd(row.adjustment_amount_vnd))} tone="n" />
      <AxKpi label="Đã phân bổ" value={formatVnd(vnd(row.allocated_amount_vnd))} tone="g" />
      <AxKpi lead label="Còn lại" value={formatVnd(vnd(row.outstanding_amount_vnd))} tone={row.state === "OVERDUE" ? "r" : "b"} note={financeStateLabel(row.state)} />
    </div>
    <div className="fk-cols">
      <div className="fk-main">
        <AxCard title="Nguồn và lịch sử"><AxKV rows={[["Hạn trả", formatBusinessDate(row.due_date)], ["Trạng thái", financeStateLabel(row.state)],
          ["Nguồn chính xác", row.purchase_order_id ? <Link key="s" className="hx-code" href={`/admin/purchase-orders/${row.purchase_order_id}`}>Mở đơn mua và tình trạng nhận hàng</Link>
            : row.expense_id ? <Link key="s" className="hx-code" href={`/admin/expenses?focus=${row.expense_id}`}>Mở chi phí đã duyệt</Link> : <span key="s">{row.source_id}</span>]]} /></AxCard>
        <AxCard title="Phân bổ thanh toán">{allocations.length ? <ul className="fk-ul">{allocations.map((item) => <li key={item.id}><b className="hx-num">{formatVnd(vnd(item.amount_delta_vnd))}</b><div className="hx-muted">Phiếu thu/chi {item.payment_id} · {formatBusinessDate(item.allocated_at)}</div></li>)}</ul>
          : <p className="hx-muted" style={{ margin: 0 }}>Chưa có khoản chi nào được phân bổ.</p>}</AxCard>
        <AxCard title="Điều chỉnh">{adjustments.length ? <ul className="fk-ul">{adjustments.map((item) => <li key={item.id}><b className="hx-num">{formatVnd(vnd(item.amount_delta_vnd))}</b>
          <div className="hx-muted">{item.reason} · {item.evidence_object_id ? "Có minh chứng" : "Chưa có minh chứng"}</div></li>)}</ul> : <p className="hx-muted" style={{ margin: 0 }}>Chưa có điều chỉnh.</p>}</AxCard>
      </div>
      <div className="fk-aside">
        <AxCard title="Điều chỉnh có kiểm chứng">
          {canAdjust ? <form action={adjustAction} style={{ display: "grid", gap: 12 }}>
            <input type="hidden" name="obligationId" value={row.id} /><input type="hidden" name="operationId" value={operationId} />
            <div className="field"><label>Số tiền điều chỉnh (VND)</label><MoneyInput name="amount" allowNegative placeholder="-100.000 hoặc 100.000" required /></div>
            <label className="hx-label">Ghi chú (không bắt buộc)<textarea className="hx-in" name="reason" maxLength={500} style={{ width: "100%", padding: 12 }} /></label>
            <label className="hx-label">Mã minh chứng đã xác minh<input className="hx-in" name="evidenceId" style={{ width: "100%" }} /></label>
            <button className="hx-btn d" type="submit">Ghi điều chỉnh</button></form>
            : <p className="hx-muted" style={{ margin: 0 }}>Bạn không có quyền điều chỉnh.</p>}
        </AxCard>
      </div>
    </div>
  </>;
}
