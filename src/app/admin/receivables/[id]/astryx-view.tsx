import Link from "next/link";
import type { ReactNode } from "react";
import { AxButtonLink, AxPageHead } from "@/components/astryx/ax-kit";
import { AxCard, AxKV, AxKpi } from "@/components/astryx/fin-kit";
import { MoneyInput } from "@/components/ui/money-input";
import { formatBusinessDate } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import { financeStateLabel } from "@/modules/finance/presentation";

export type AxReceivableDetail = { id: string; customer_id: string; customer_name: string; site_name: string | null; source_label: string; source_id: string; delivery_id: string | null; original_amount_vnd: string; adjustment_amount_vnd: string; allocated_amount_vnd: string; outstanding_amount_vnd: string; due_date: string; state: string };
export type AxAllocation = { id: string; payment_id: string; amount_delta_vnd: string; allocated_at: string };
export type AxAdjustment = { id: string; amount_delta_vnd: string; adjustment_kind: string; return_case_id: string | null; reason: string | null; evidence_object_id: string | null };

/** Chi tiết khoản phải thu kiểu Astryx: số liệu, nguồn, phân bổ, điều chỉnh có kiểm chứng (cùng action và cùng trường với Classic). */
export function AstryxReceivableDetailView({ row, allocations, adjustments, canAdjust, adjustAction, operationId, notice }: {
  row: AxReceivableDetail; allocations: AxAllocation[]; adjustments: AxAdjustment[]; canAdjust: boolean; adjustAction: (formData: FormData) => void | Promise<void>; operationId: string; notice: ReactNode;
}) {
  const overdue = row.state === "OVERDUE";
  return <>
    <AxPageHead crumbs={["Tài chính", "Công nợ", "Phải thu", row.customer_name]} title={row.customer_name}
      actions={<><a className="hx-btn p" href={`/api/customers/${row.customer_id}/debt-statement/pdf`}>Đối chiếu công nợ</a>
        <AxButtonLink href={`/admin/receivables?customer=${row.customer_id}`} kind="commerce">Ghi thu</AxButtonLink><AxButtonLink href="/admin/receivables">Về danh sách</AxButtonLink></>} />
    <p className="hx-muted" style={{ margin: "-8px 0 16px" }}>{row.site_name ?? "Chưa gắn công trình"} · {row.source_label}</p>
    {notice}
    <div className="fk-kpis">
      <AxKpi label="Gốc" value={formatVnd(vnd(row.original_amount_vnd))} tone="n" />
      <AxKpi label="Điều chỉnh" value={formatVnd(vnd(row.adjustment_amount_vnd))} tone="n" />
      <AxKpi label="Đã phân bổ" value={formatVnd(vnd(row.allocated_amount_vnd))} tone="g" />
      <AxKpi lead label="Còn lại" value={formatVnd(vnd(row.outstanding_amount_vnd))} tone={overdue ? "r" : "b"} note={financeStateLabel(row.state)} />
    </div>
    <div className="fk-cols">
      <div className="fk-main">
        <AxCard title="Nguồn và lịch sử">
          <AxKV rows={[["Hạn trả", formatBusinessDate(row.due_date)], ["Trạng thái", financeStateLabel(row.state)],
            ["Nguồn chính xác", row.delivery_id ? <Link key="s" className="hx-code" href={`/admin/deliveries/${row.delivery_id}`}>Mở kết quả giao hàng đã xác minh</Link> : <span key="s">{row.source_id}</span>]]} />
        </AxCard>
        <AxCard title="Phân bổ thanh toán">
          {allocations.length ? <ul className="fk-ul">{allocations.map((item) => <li key={item.id}><b className="hx-num">{formatVnd(vnd(item.amount_delta_vnd))}</b><div className="hx-muted">Phiếu thu/chi {item.payment_id} · {formatBusinessDate(item.allocated_at)}</div></li>)}</ul>
            : <p className="hx-muted" style={{ margin: 0 }}>Chưa có khoản thu nào được phân bổ.</p>}
        </AxCard>
        <AxCard title="Điều chỉnh">
          {adjustments.length ? <ul className="fk-ul">{adjustments.map((item) => <li key={item.id}><b className="hx-num">{formatVnd(vnd(item.amount_delta_vnd))}</b>
            <div className="hx-muted">{item.return_case_id ? "Trả hàng" : item.adjustment_kind === "PRICE" ? "Điều chỉnh giá" : item.adjustment_kind === "WRITE_OFF" ? "Xóa nợ" : "Điều chỉnh nghĩa vụ khác"} · {item.reason} · {item.evidence_object_id ? "Có minh chứng" : "Chưa có minh chứng"}</div></li>)}</ul>
            : <p className="hx-muted" style={{ margin: 0 }}>Chưa có điều chỉnh.</p>}
        </AxCard>
      </div>
      <div className="fk-aside">
        <AxCard title="Điều chỉnh có kiểm chứng">
          {canAdjust ? <form action={adjustAction} style={{ display: "grid", gap: 12 }}>
            <input type="hidden" name="obligationId" value={row.id} /><input type="hidden" name="operationId" value={operationId} />
            <label className="hx-label">Bản chất điều chỉnh<select className="hx-in" name="adjustmentKind" defaultValue="OTHER" required style={{ width: "100%" }}>
              <option value="OTHER">Điều chỉnh nghĩa vụ khác</option><option value="PRICE">Điều chỉnh giá theo nguồn đã duyệt</option><option value="WRITE_OFF">Xóa nợ</option></select></label>
            <p className="hx-muted" style={{ margin: 0 }}>Hàng trả dùng hồ sơ riêng và khoản có. Điều chỉnh giá ảnh hưởng doanh thu; xóa nợ và nghĩa vụ khác được theo dõi riêng.</p>
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
