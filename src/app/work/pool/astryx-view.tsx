import Link from "next/link";
import { ClaimDeliveryCard } from "@/components/portal/claim-delivery-card";
import { ClaimJobButton } from "@/components/portal/claim-job-button";
import { WxChip, WxEmpty, WxHead } from "@/components/astryx/work-kit";
import { workKindLabel } from "@/modules/portal/presentation";
import type { WorkerJob, WorkerPoolDelivery } from "@/modules/portal/types";

/**
 * "Nhận việc" kiểu Astryx: thẻ việc chờ nhận, mỗi thẻ một nút chính 52px "Nhận việc này". Phiếu giao chờ người nhận dùng lại thẻ
 * Classic (chọn xe + nhận, đã có operationId) đặt trong khung Astryx; việc dịch vụ dùng lại nút nhận việc Classic.
 */
export function AstryxWorkPoolView({ deliveries, jobs }: { deliveries: WorkerPoolDelivery[]; jobs: WorkerJob[] }) {
  const empty = !jobs.length && !deliveries.length;
  return <div className="wx-page">
    <WxHead title="Nhận việc" sub="Chỉ hiện việc ở chi nhánh bạn đang làm. Ai bấm nhận trước thì được việc." />
    {deliveries.length > 0 && <section aria-labelledby="pool-deliveries" className="wx-pool">
      <h2 id="pool-deliveries">Phiếu giao chờ người nhận ({deliveries.length})</h2>
      {deliveries.map((delivery) => <div className="wx-card flush" key={delivery.id}><ClaimDeliveryCard delivery={delivery} /></div>)}
    </section>}
    {jobs.length > 0 && <section aria-labelledby="pool-jobs" className="wx-pool">
      <h2 id="pool-jobs">Việc dịch vụ ({jobs.length})</h2>
      {jobs.map((job) => <article className="wx-card" key={job.id} style={{ display: "grid", gap: 8 }}>
        <div><WxChip tone="w">{workKindLabel(job.kind)}</WxChip></div>
        <h3 style={{ fontSize: 17, fontWeight: 700 }}>{job.title ?? job.number}</h3>
        <p className="wx-sub">{job.number} · {job.site_name ?? job.address ?? "Địa điểm sẽ cập nhật"}</p>
        <div className="wx-actions">
          <ClaimJobButton version={job.version} workItemId={job.id} />
          <Link className="wx-btn o" href={`/work/jobs/${job.id}`}>Xem chi tiết</Link>
        </div>
      </article>)}
    </section>}
    {empty && <WxEmpty title="Hiện chưa có công việc phù hợp để nhận">Việc mới sẽ hiện ở đây khi văn phòng đăng.</WxEmpty>}
  </div>;
}
