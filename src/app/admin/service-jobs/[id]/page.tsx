import { formatQuantity } from "@/lib/core/quantity";
import { serviceStateLabel, earningTypeLabel } from "@/modules/workforce/presentation";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { ActionNotice } from "@/components/sales/action-notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatServiceSchedule } from "@/modules/workforce/service-schedule";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  assignWorkItemAction, calculateEarningAction, claimWorkItemAction, heartbeatWorkItemAction,
  cancelScheduledServiceJobAction, publishWorkItemAction, startWorkItemAction,
  submitWorkResultAction, verifyServiceJobAction,
} from "@/modules/workforce/actions";
import { ServiceBillingFields } from "@/components/workforce/service-billing-fields";

type Job = {
  id: string; job_number: string; customer_name: string; site_name: string; service_type: string;
  description: string; scheduled_start: string; planned_quantity: string; unit_label: string;
  execution_state: string; version: number; work_item_id: string | null; work_number: string | null;
  work_state: string | null; work_version: number | null; operator_name: string | null;
  actual_quantity: string | null; billable_quantity: string | null; compensable_quantity: string | null;
  billable_amount_vnd: string | null; service_verification_id: string | null; receivable_obligation_id: string | null;
};
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

const workStateLabel = (state: string) => ({ AVAILABLE: "Chờ nhận", CLAIMED: "Đã nhận", IN_PROGRESS: "Đang làm", DONE: "Hoàn tất", VERIFIED: "Đã xác minh", CANCELLED: "Đã hủy" } as Record<string, string>)[state] ?? "Trạng thái đang cập nhật";

export default async function ServiceJobDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("service.read");
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createServerSupabase();
  const [{ data }, { data: employees }, { data: rules }, { data: pricing }] = await Promise.all([
    supabase.from("service_job_read").select("id,branch_id,job_number,customer_id,customer_name,site_id,site_name,sales_employee_id,service_type,description,scheduled_start,scheduled_end,planned_quantity::text,unit_label,vehicle_id,plate_number,machine_id,machine_name,execution_state,version,work_item_id,work_number,work_state,work_version,employee_id,operator_name,actual_quantity::text,billable_quantity::text,compensable_quantity::text,billable_amount_vnd::text,service_verification_id,receivable_obligation_id").eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
    supabase.from("workforce_read").select("id, code, display_name").eq("branch_id", access.branchId).eq("active", true).order("display_name"),
    supabase.from("compensation_rules").select("id, code, name, version, earning_type").eq("branch_id", access.branchId).order("created_at", { ascending: false }),
    // D23: unit price copied from the service type when the job was scheduled (older jobs have none).
    supabase.from("service_jobs").select("unit_price_vnd::text").eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
  ]);
  if (!data) notFound();
  const job = data as Job;
  const unitPrice = (pricing as { unit_price_vnd: string | null } | null)?.unit_price_vnd ?? null;
  const canManage = access.permissions.has("work.manage");
  const canClaim = access.permissions.has("work.claim");
  const canVerify = access.permissions.has("service.verify");
  const canComp = access.permissions.has("compensation.manage");
  return <>
    <header className="page-heading"><div><p className="eyebrow">{job.job_number}</p><h1>{job.service_type}</h1><p className="lede">{job.customer_name} · {job.site_name}</p></div><Link className="button button-secondary" href="/admin/service-jobs">Về danh sách</Link></header>
    <ActionNotice notice={query.notice} error={query.error} />
    <section className="metric-grid">
      <article className="card metric-card"><span className="metric-label">Kế hoạch</span><strong className="metric-value">{formatQuantity(String(job.planned_quantity))} {job.unit_label}</strong></article>
      <article className="card metric-card"><span className="metric-label">Thực tế</span><strong className="metric-value">{job.actual_quantity ?? "Chưa có"}</strong></article>
      <article className="card metric-card"><span className="metric-label">Tính khách</span><strong className="metric-value">{job.billable_quantity ?? "Chưa xác minh"}</strong></article>
      <article className="card metric-card"><span className="metric-label">Tính công</span><strong className="metric-value">{job.compensable_quantity ?? "Chưa xác minh"}</strong></article>
    </section>
    <div className="two-column">
      <section className="card card-pad"><div className="section-head"><h2>Nguồn và thực hiện</h2><StatusBadge tone={job.execution_state === "VERIFIED" ? "success" : "warning"}>{serviceStateLabel(job.execution_state)}</StatusBadge></div>
        <dl className="detail-grid">
          <div className="detail-item"><dt>Lịch</dt><dd>{formatServiceSchedule(job.scheduled_start)}</dd></div>
          <div className="detail-item"><dt>Phiếu việc</dt><dd>{job.work_number ?? "Chưa phát hành"}</dd></div>
          <div className="detail-item"><dt>Người thực hiện</dt><dd>{job.operator_name ?? "Chưa nhận"}</dd></div>
          <div className="detail-item"><dt>Trạng thái việc</dt><dd>{job.work_state ? workStateLabel(job.work_state) : "Chưa có"}</dd></div>
          {unitPrice != null && <div className="detail-item"><dt>Đơn giá</dt><dd>{formatVnd(vnd(unitPrice))}/{job.unit_label}</dd></div>}
          <div className="detail-item field-full"><dt>Mô tả</dt><dd>{job.description}</dd></div>
          {job.billable_amount_vnd != null && <div className="detail-item"><dt>Khoản tính khách</dt><dd>{formatVnd(vnd(String(job.billable_amount_vnd)))}</dd></div>}
          {job.receivable_obligation_id && <div className="detail-item"><dt>Khoản phải thu</dt><dd><Link className="code-link" href={"/admin/receivables/" + job.receivable_obligation_id}>Mở khoản phải thu</Link></dd></div>}
        </dl>
      </section>
      <aside className="card card-pad command-panel"><h2>Điều phối và xác minh</h2>
        {job.execution_state === "SCHEDULED" && !job.work_item_id && canManage && <form className="command-panel" action={publishWorkItemAction}>
          <input type="hidden" name="serviceJobId" value={job.id} /><input type="hidden" name="operationId" value={randomUUID()} />
          <div className="field"><label>Chế độ</label><select name="assignmentMode"><option value="POOL_CLAIM">Đưa vào danh sách nhận việc</option><option value="DIRECT">Giao trực tiếp</option></select></div>
          <div className="field"><label>Nhân viên khi giao trực tiếp</label><select name="employeeId"><option value="">Chưa chọn</option>{(employees ?? []).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.display_name}</option>)}</select></div>
          <button className="button button-primary" type="submit">Phát hành phiếu việc</button>
        </form>}
        {job.execution_state === "SCHEDULED" && !job.work_item_id && access.permissions.has("service.manage") && <form className="command-panel" action={cancelScheduledServiceJobAction}>
          <input type="hidden" name="serviceJobId" value={job.id} /><input type="hidden" name="version" value={job.version} /><input type="hidden" name="operationId" value={randomUUID()} />
          <div className="field"><label htmlFor="serviceCancelReason">Ghi chú (không bắt buộc)</label><input id="serviceCancelReason" name="reason" maxLength={500} /></div>
          <button className="button button-danger" type="submit">Hủy lịch dịch vụ</button>
        </form>}
        {job.execution_state === "CANCELLED" && <p className="muted">Lịch dịch vụ đã hủy trước khi phát hành phiếu việc. Không thể phát hành hoặc ghi kết quả cho lịch này.</p>}
        {job.work_item_id && job.work_state === "AVAILABLE" && <>
          {canManage && <form action={assignWorkItemAction} className="command-panel">
            <input type="hidden" name="workItemId" value={job.work_item_id} /><input type="hidden" name="serviceJobId" value={job.id} /><input type="hidden" name="version" value={job.work_version ?? 1} /><input type="hidden" name="operationId" value={randomUUID()} />
            <div className="field"><label>Giao cho</label><select name="employeeId" required><option value="">Chọn nhân viên</option>{(employees ?? []).map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></div><button className="button button-secondary" type="submit">Giao trực tiếp</button>
          </form>}
          {canClaim && <form action={claimWorkItemAction}><input type="hidden" name="workItemId" value={job.work_item_id} /><input type="hidden" name="serviceJobId" value={job.id} /><input type="hidden" name="version" value={job.work_version ?? 1} /><input type="hidden" name="operationId" value={randomUUID()} /><button className="button button-primary action-full" type="submit">Nhận việc từ danh sách</button></form>}
        </>}
        {job.work_item_id && job.work_state === "CLAIMED" && canClaim && <form action={startWorkItemAction}><input type="hidden" name="workItemId" value={job.work_item_id} /><input type="hidden" name="serviceJobId" value={job.id} /><input type="hidden" name="version" value={job.work_version ?? 1} /><input type="hidden" name="operationId" value={randomUUID()} /><button className="button button-primary action-full" type="submit">Bắt đầu làm</button></form>}
        {job.work_item_id && job.work_state === "IN_PROGRESS" && canClaim && <>
          <form className="command-panel" action={heartbeatWorkItemAction}><input type="hidden" name="workItemId" value={job.work_item_id} /><input type="hidden" name="serviceJobId" value={job.id} /><input type="hidden" name="operationId" value={randomUUID()} /><div className="field"><label>Xác nhận vẫn đang làm</label><input name="note" defaultValue="Vẫn đang làm, tiến độ bình thường" required /></div><button className="button button-secondary" type="submit">Ghi nhận đang làm</button></form>
          <form className="command-panel" action={submitWorkResultAction}><input type="hidden" name="workItemId" value={job.work_item_id} /><input type="hidden" name="serviceJobId" value={job.id} /><input type="hidden" name="version" value={job.work_version ?? 1} /><input type="hidden" name="operationId" value={randomUUID()} /><div className="field"><label>Sản lượng thực tế</label><input name="actualQuantity" inputMode="decimal" required /></div><div className="field"><label>Người nhận/xác nhận</label><input name="receiverName" /></div><div className="field"><label>Mã minh chứng</label><input name="evidenceId" /></div><div className="field field-full"><label>Ghi chú kết quả</label><textarea name="note" minLength={3} required /></div><button className="button button-primary" type="submit">Gửi kết quả, chờ xác minh</button></form>
        </>}
        {job.work_item_id && job.work_state === "DONE" && canVerify && <form className="command-panel" action={verifyServiceJobAction}>
          <input type="hidden" name="serviceJobId" value={job.id} /><input type="hidden" name="jobVersion" value={job.version} /><input type="hidden" name="workVersion" value={job.work_version ?? 1} /><input type="hidden" name="operationId" value={randomUUID()} />
          <ServiceBillingFields defaultQuantity={job.actual_quantity ?? ""} unitLabel={job.unit_label} unitPriceVnd={unitPrice} />
          <div className="field"><label>Sản lượng tính công</label><input name="compensableQuantity" defaultValue={job.actual_quantity ?? ""} inputMode="decimal" required /></div>
          <div className="field"><label>Hạn thu</label><input type="date" name="dueDate" defaultValue={today()} required /></div>
          <div className="field field-full"><label>Căn cứ/chênh lệch</label><textarea name="note" defaultValue="Đã đối chiếu sản lượng thực tế, tính khách và tính công" minLength={3} required /></div>
          <button className="button button-primary" type="submit">Xác minh và tạo khoản phải thu</button>
        </form>}
        {job.service_verification_id && canComp && <form className="command-panel" action={calculateEarningAction}>
          <input type="hidden" name="sourceKind" value="SERVICE_VERIFICATION" /><input type="hidden" name="sourceId" value={job.service_verification_id} /><input type="hidden" name="returnTo" value={"/admin/service-jobs/" + job.id} /><input type="hidden" name="operationId" value={randomUUID()} />
          <div className="field"><label>Quy tắc thu nhập</label><select name="ruleId" required><option value="">Chọn quy tắc đúng căn cứ tính</option>{(rules ?? []).map((rule) => <option key={rule.id} value={rule.id}>{rule.code} · Phiên bản {rule.version} · {earningTypeLabel(rule.earning_type)}</option>)}</select></div>
          <button className="button button-secondary" type="submit">Tính thu nhập</button>
        </form>}
      </aside>
    </div>
  </>;
}
