import Link from "next/link";
import type { ReactNode } from "react";
import { ActionNotice } from "@/components/sales/action-notice";
import { AxButtonLink, AxPageHead, AxStatus, type AxTone } from "@/components/astryx/ax-kit";
import { AxFacts, AxPanel, AxStrip } from "@/components/astryx/sales-kit";

const tone = (state: string): AxTone => state === "VERIFIED" ? "success" : state === "CANCELLED" ? "error" : state === "RESULT_SUBMITTED" ? "warning" : "info";

/** Chi tiết đơn dịch vụ kiểu Astryx: tiến độ, bốn số liệu, thông tin việc và khối "Việc cần làm" (các form giao việc / xác minh / hủy giữ nguyên). */
export function AstryxServiceJobDetailView({ number, title, customer, site, origin, state, stateLabel, notice, error, progress, metrics, info, actions }: {
  number: string; title: string; customer: string; site: string; origin: { id: string; number: string } | null; state: string; stateLabel: string; notice?: string; error?: string; progress: ReactNode;
  metrics: { planned: string; actual: string; billable: string; amountLabel: string; amount: string };
  info: { schedule: string; operator: string; workNumber: string | null; resourceLabel: string; resource: string | null; unitPrice: string; description: string | null; compensable: string | null; receivableId: string | null };
  actions: ReactNode;
}) {
  return <>
    <AxPageHead crumbs={["Bán hàng", "Dịch vụ", number]} title={title} actions={<AxButtonLink href="/admin/service-jobs">Về danh sách</AxButtonLink>} />
    <div style={{ marginTop: -12, marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <AxStatus tone={tone(state)}>{stateLabel}</AxStatus>
      <span className="hx-muted">{number} · {customer} · {site}</span>
      {origin && <Link className="hx-code" href={`/admin/service-jobs/requests/${origin.id}`}>Từ yêu cầu của khách {origin.number}</Link>}
    </div>
    <ActionNotice notice={notice} error={error} />
    <div className="sx-stack sx-legacy">
      {progress}
      <AxStrip items={[{ label: "Dự kiến", value: metrics.planned }, { label: "Thợ báo", value: metrics.actual }, { label: "Tính khách", value: metrics.billable }, { label: metrics.amountLabel, value: metrics.amount, num: true }]} />
      <div className="sx-cols">
        <AxPanel title="Thông tin">
          <AxFacts items={[
            { label: "Lịch", value: info.schedule },
            { label: "Người làm", value: info.operator, sub: info.workNumber ? `Phiếu việc ${info.workNumber}` : undefined },
            info.resource ? { label: info.resourceLabel, value: info.resource } : null,
            { label: "Đơn giá", value: info.unitPrice },
            { label: "Ghi chú", value: info.description || "Không có", full: true },
            info.compensable ? { label: "Tính công cho thợ", value: info.compensable } : null,
            info.receivableId ? { label: "Công nợ khách", value: <Link className="hx-code" href={`/admin/receivables/${info.receivableId}`}>Mở khoản phải thu</Link> } : null,
          ]} />
        </AxPanel>
        <AxPanel title="Việc cần làm"><div className="sx-act">{actions}</div></AxPanel>
      </div>
    </div>
  </>;
}
