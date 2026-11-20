import Link from "next/link";
import type { ReactNode } from "react";
import { ActionNotice } from "@/components/sales/action-notice";
import { AxButtonLink, AxPageHead, AxStatus, toneOf } from "@/components/astryx/ax-kit";
import { AxDialogButton } from "@/components/astryx/sales-dialog";
import { AxBanner, AxFacts, AxPanel } from "@/components/astryx/sales-kit";

/** Chi tiết yêu cầu dịch vụ của khách (D75) kiểu Astryx: băng chờ xác nhận lịch với "Xếp lịch" / "Từ chối", thông tin khách yêu cầu và form xếp lịch. */
export function AstryxServiceRequestDetailView({ title, number, customer, site, stateLabel, stateTone, notice, error, canSchedule, readOnlyOpen, info, scheduleForm, rejectForm }: {
  title: string; number: string; customer: string; site: string; stateLabel: string; stateTone: "success" | "warning" | "info" | "danger"; notice?: string; error?: string; canSchedule: boolean; readOnlyOpen: boolean;
  info: { sentAt: string; siteAddress: string; wish: string; contactName: string; contactPhone: string; note: string | null; estimate: string; cancelled: string | null; rejected: string | null | undefined; job: { id: string; number: string } | null };
  scheduleForm: ReactNode; rejectForm: ReactNode;
}) {
  return <>
    <AxPageHead crumbs={["Bán hàng", "Dịch vụ", "Yêu cầu", number]} title={title}
      actions={<><a className="hx-btn" href={`tel:${info.contactPhone.replace(/[^\d+]/g, "")}`}>Gọi khách</a><AxButtonLink href="/admin/service-jobs/requests">Về danh sách</AxButtonLink></>} />
    <div style={{ marginTop: -12, marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <AxStatus tone={toneOf(stateTone)}>{stateLabel}</AxStatus><span className="hx-muted">{number} · {customer} · {site}</span></div>
    <ActionNotice notice={notice} error={error} />
    {canSchedule && <AxBanner status="warning" title="Yêu cầu đang chờ xác nhận lịch"
      description="Xếp lịch sẽ tạo đơn dịch vụ từ yêu cầu này và khách thấy lịch trên cổng khách; từ chối phải có lý do để khách đọc."
      actions={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><AxDialogButton label="Từ chối" title="Từ chối yêu cầu?" subtitle={number} kind="danger" width={500}>{rejectForm}</AxDialogButton><a className="hx-btn g" href="#request-schedule">Xếp lịch</a></div>} />}
    <div className="sx-stack sx-legacy">
      <AxPanel id="request-info" title="Khách yêu cầu" right={<span className="sx-tag i">Từ cổng khách</span>}>
        <AxFacts items={[
          { label: "Mã yêu cầu", value: `${number} · gửi ${info.sentAt}` }, { label: "Công trình", value: info.siteAddress },
          { label: "Khách mong muốn", value: info.wish, sub: "Chỉ là mong muốn, cửa hàng xác nhận lại" },
          { label: "Người liên hệ", value: <>{info.contactName} · <a className="hx-code" href={`tel:${info.contactPhone.replace(/[^\d+]/g, "")}`}>{info.contactPhone}</a></> },
          info.note ? { label: "Ghi chú của khách", value: info.note } : null,
          { label: "Tạm tính khách đã thấy", value: info.estimate },
          info.cancelled ? { label: "Khách hủy", value: info.cancelled } : null,
          info.rejected ? { label: "Lý do từ chối (khách đọc được)", value: info.rejected } : null,
          info.job ? { label: "Đơn dịch vụ", value: <Link className="hx-code" href={`/admin/service-jobs/${info.job.id}`}>{info.job.number}</Link> } : null,
        ]} />
      </AxPanel>
      {canSchedule && <AxPanel id="request-schedule" title="Xếp lịch" sub="Tạo đơn dịch vụ từ yêu cầu này: chọn giờ, xe hoặc máy, nhân viên phụ trách. Sau đó giao việc cho thợ như mọi đơn dịch vụ.">{scheduleForm}</AxPanel>}
      {readOnlyOpen && <p className="hx-muted">Bạn có quyền xem, chưa có quyền xếp lịch hoặc từ chối yêu cầu dịch vụ.</p>}
    </div>
  </>;
}
