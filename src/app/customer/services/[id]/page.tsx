import Link from "next/link";
import { Check, ChevronLeft, MessageSquare } from "lucide-react";

import { CancelServiceRequestButton } from "@/components/portal/cancel-service-request-button";
import styles from "@/components/portal/portal.module.css";
import { formatPortalMoney as money } from "@/modules/portal/money";
import { getCustomerServiceRequest } from "@/modules/portal/service-actions";
import {
  quantityText, scheduleText, serviceRequestSteps, serviceStageLabel, serviceStageTone, stampText, wishText,
} from "@/modules/portal/service-request";

const notices: Record<string, string> = {
  submitted: "Đã gửi yêu cầu. Cửa hàng sẽ xác nhận lịch cho bạn.",
};

/** "Theo dõi yêu cầu" (D75): the request's stage and the five steps, its details, and "Hủy yêu cầu" while the store has not scheduled it. */
export default async function CustomerServiceRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { id } = await params;
  const notice = notices[(await searchParams).notice ?? ""];
  const request = await getCustomerServiceRequest(id);
  const steps = serviceRequestSteps(request);
  const sees = request.member_role !== "RECEIVER";
  const owner = request.member_role === "OWNER";
  const money_ = (value?: string) => (value ? money(value) : null);
  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <Link className={styles.backButton} href="/customer/orders?kind=services" aria-label="Quay lại"><ChevronLeft aria-hidden size={20} /></Link>
        <div><p>Gửi lúc {stampText(request.submitted_at)} · {request.number}</p><h1>Yêu cầu dịch vụ</h1></div>
      </header>
      {notice && <p className={styles.status} role="status"><Check aria-hidden size={16} /> {notice}</p>}

      <section className={styles.card} aria-labelledby="svc-stage">
        <div className={styles.svcTrackHead}>
          <div><h2 id="svc-stage">{request.service_name} · {quantityText(request.quantity, request.unit_label)}</h2>
            <small>{wishText(request)} · {request.site_name}</small></div>
          <span className={styles.reqChip} data-tone={serviceStageTone(request.stage)}>{serviceStageLabel(request.stage)}</span>
        </div>
        <ol className={styles.journey}>{steps.map((step) => <li key={step.key} data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
          <span aria-hidden="true">{step.state === "done" ? <Check size={12} strokeWidth={3.2} /> : null}</span>
          <span>{step.label}</span><small>{step.at ? stampText(step.at) : ""}</small>
          {step.hint && <span className={styles.journeyHint}>{step.hint}</span>}
        </li>)}</ol>
      </section>

      <section className={styles.card} aria-labelledby="svc-info">
        <h2 id="svc-info">Thông tin yêu cầu</h2>
        <div className={styles.kv}><span>Công trình</span><strong>{request.site_name} — {request.site_address}</strong></div>
        {request.scheduled_start && request.stage !== "SCHEDULE_CANCELLED" && <div className={styles.kv}><span>Lịch của cửa hàng</span><strong>{scheduleText(request.scheduled_start)}</strong></div>}
        <div className={styles.kv}><span>Liên hệ</span><strong>{request.contact_name} · {request.contact_phone}</strong></div>
        {request.note && <div className={styles.kv}><span>Ghi chú</span><strong>{request.note}</strong></div>}
        {sees && (request.stage === "DONE"
          ? <>
            {request.billable_quantity && <div className={styles.kv}><span>Khối lượng tính</span><strong>{quantityText(request.billable_quantity, request.unit_label)}</strong></div>}
            {request.final_amount_vnd && <div className={styles.kv}><span>Thành tiền</span><strong>{money_(request.final_amount_vnd)} · đã ghi vào Công nợ</strong></div>}
          </>
          : request.stage !== "CANCELLED" && request.stage !== "REJECTED" && <div className={styles.kv}><span>Tạm tính</span>
            <strong>{request.estimate_vnd ? money_(request.estimate_vnd) : "Cửa hàng báo giá"}</strong></div>)}
        {sees && request.stage !== "DONE" && <p className={styles.hint}>Bạn chưa bị tính tiền. Số tiền cuối tính theo khối lượng thực tế đã xác nhận.</p>}
      </section>

      <div className={styles.svcActions}>
        <Link className={styles.buttonSecondary} href="/customer/messages"><MessageSquare aria-hidden size={18} />Nhắn tin cho cửa hàng</Link>
        {request.can_cancel && <CancelServiceRequestButton requestId={request.id} />}
        {request.can_cancel && <p className={styles.hint}>Hủy được khi cửa hàng chưa xếp lịch.</p>}
        {!request.can_cancel && (request.stage === "SCHEDULED" || request.stage === "IN_PROGRESS" || request.stage === "CONFIRMING") && (
          <p className={styles.hint}>Cửa hàng đã xếp lịch nên không hủy được trên cổng. Nhắn tin hoặc gọi cửa hàng để đổi hoặc hủy lịch.</p>)}
        {owner && request.stage !== "REJECTED" && request.stage !== "CANCELLED" && <Link className={styles.reorderOutline} href={`/customer/services/new?from=${request.id}`}>Đặt lại yêu cầu này</Link>}
      </div>
    </div>
  );
}
