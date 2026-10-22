import Decimal from "decimal.js";
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
import { ServiceJobProgress } from "@/components/workforce/service-job-progress";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { FormDialog } from "@/components/ui/form-dialog";

type Job = {
  id: string; job_number: string; customer_name: string; site_name: string; service_type: string;
  description: string; scheduled_start: string; planned_quantity: string | null; unit_label: string; plate_number: string | null; machine_name: string | null;
  execution_state: string; version: number; work_item_id: string | null; work_number: string | null;
  work_state: string | null; work_version: number | null; operator_name: string | null;
  actual_quantity: string | null; billable_quantity: string | null; compensable_quantity: string | null;
  billable_amount_vnd: string | null; service_verification_id: string | null; receivable_obligation_id: string | null;
};
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

const quantityText = (value: string | null, unit: string) => value == null ? null : `${formatQuantity(String(value))} ${unit}`;

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
  const canCancel = access.permissions.has("service.manage");
  const unit = job.unit_label;
  const hidden = (fields: Record<string, string | number>) => Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);
  const work = { workItemId: job.work_item_id ?? "", serviceJobId: job.id, version: job.work_version ?? 1 };
  // FB8: the amount to bill, estimated from the reported (or planned) count until the job is verified.
  const countForEstimate = job.actual_quantity ?? job.planned_quantity;
  const estimate = unitPrice && countForEstimate ? new Decimal(countForEstimate).mul(unitPrice).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0) : null;
  return <>
    <header className="page-heading"><div><p className="eyebrow">Đơn dịch vụ · {job.job_number}</p><h1>{job.service_type}</h1><p className="lede">{job.customer_name} · {job.site_name}</p></div>
      <div className="action-cluster"><StatusBadge tone={job.execution_state === "VERIFIED" ? "success" : job.execution_state === "CANCELLED" ? "danger" : job.execution_state === "RESULT_SUBMITTED" ? "warning" : "info"}>{serviceStateLabel(job.execution_state)}</StatusBadge>
        <Link className="button button-secondary" href="/admin/service-jobs">Về danh sách</Link></div></header>
    <ActionNotice notice={query.notice} error={query.error} />
    <ServiceJobProgress state={job.execution_state} workState={job.work_state} operator={job.operator_name} unit={unit} actual={quantityText(job.actual_quantity, "")?.trim() ?? null} />
    <section className="metric-grid">
      <article className="card metric-card"><span className="metric-label">Dự kiến</span><strong className="metric-value">{quantityText(job.planned_quantity, unit) ?? "Theo thực tế"}</strong></article>
      <article className="card metric-card"><span className="metric-label">Thợ báo</span><strong className="metric-value">{quantityText(job.actual_quantity, unit) ?? "Chưa có"}</strong></article>
      <article className="card metric-card"><span className="metric-label">Tính khách</span><strong className="metric-value">{quantityText(job.billable_quantity, unit) ?? "Chưa xác minh"}</strong></article>
      <article className="card metric-card"><span className="metric-label">{job.billable_amount_vnd != null ? "Thành tiền" : "Thành tiền tạm tính"}</span><strong className="metric-value">{job.billable_amount_vnd != null ? formatVnd(vnd(String(job.billable_amount_vnd))) : estimate ? formatVnd(vnd(estimate)) : "—"}</strong></article>
    </section>
    <div className="two-column">
      <section className="card card-pad"><div className="section-head"><h2>Thông tin</h2></div>
        <dl className="detail-grid">
          <div className="detail-item"><dt>Lịch</dt><dd>{formatServiceSchedule(job.scheduled_start)}</dd></div>
          <div className="detail-item"><dt>Người làm</dt><dd>{job.operator_name ?? "Chưa giao"}{job.work_number && <small className="table-subline">Phiếu việc {job.work_number}</small>}</dd></div>
          {(job.plate_number || job.machine_name) && <div className="detail-item"><dt>{job.plate_number ? "Xe" : "Máy"}</dt><dd>{job.plate_number ?? job.machine_name}</dd></div>}
          <div className="detail-item"><dt>Đơn giá</dt><dd>{unitPrice != null ? `${formatVnd(vnd(unitPrice))}/${unit}` : "Nhập khi xác minh"}</dd></div>
          <div className="detail-item field-full"><dt>Ghi chú</dt><dd>{job.description}</dd></div>
          {job.compensable_quantity != null && <div className="detail-item"><dt>Tính công cho thợ</dt><dd>{quantityText(job.compensable_quantity, unit)}</dd></div>}
          {job.receivable_obligation_id && <div className="detail-item"><dt>Công nợ khách</dt><dd><Link className="code-link" href={"/admin/receivables/" + job.receivable_obligation_id}>Mở khoản phải thu</Link></dd></div>}
        </dl>
      </section>
      <aside className="card card-pad command-panel"><h2>Việc cần làm</h2>
        {job.execution_state === "SCHEDULED" && !job.work_item_id && canManage && <form className="command-panel" action={publishWorkItemAction}>
          {hidden({ serviceJobId: job.id, operationId: randomUUID() })}
          <fieldset className="segmented-radio"><legend>Giao việc</legend>
            <label><input type="radio" name="assignmentMode" value="DIRECT" defaultChecked /> Giao thẳng cho một thợ</label>
            <label><input type="radio" name="assignmentMode" value="POOL_CLAIM" /> Để thợ tự nhận</label></fieldset>
          <div className="field"><label htmlFor="service-employee">Thợ (khi giao thẳng)</label><select id="service-employee" name="employeeId"><option value="">Chọn thợ</option>{(employees ?? []).map((item) => <option key={item.id} value={item.id}>{item.display_name} ({item.code})</option>)}</select></div>
          <button className="button button-primary" type="submit">Giao việc</button>
        </form>}
        {job.work_item_id && job.work_state === "AVAILABLE" && <>
          {canManage && <form action={assignWorkItemAction} className="command-panel">
            {hidden({ ...work, operationId: randomUUID() })}
            <div className="field"><label htmlFor="service-assign">Giao thẳng cho</label><select id="service-assign" name="employeeId" required><option value="">Chọn thợ</option>{(employees ?? []).map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></div><button className="button button-primary" type="submit">Giao việc</button>
          </form>}
          {canClaim && <form action={claimWorkItemAction}>{hidden({ ...work, operationId: randomUUID() })}<button className="button button-secondary action-full" type="submit">Tôi nhận việc này</button></form>}
        </>}
        {job.work_item_id && job.work_state === "CLAIMED" && <>
          <p className="muted">Thợ bấm “Bắt đầu” trên điện thoại khi tới công trình.</p>
          {canClaim && <form action={startWorkItemAction}>{hidden({ ...work, operationId: randomUUID() })}<button className="button button-secondary action-full" type="submit">Bắt đầu thay thợ</button></form>}
        </>}
        {job.work_item_id && job.work_state === "IN_PROGRESS" && <>
          <p className="muted">Xong việc, thợ bấm số {unit} thực tế và “Hoàn tất” trên điện thoại.</p>
          {canClaim && <details className="quick-create"><summary>Hoàn tất thay thợ (khi thợ không dùng được điện thoại)</summary>
            <form className="command-panel" action={submitWorkResultAction}>{hidden({ ...work, operationId: randomUUID() })}
              <div className="field"><label htmlFor="service-actual">Số lượng thực tế</label>
                <QuantityStepper id="service-actual" name="actualQuantity" label="Số lượng thực tế" unit={unit} min={0} defaultValue={job.planned_quantity ? new Decimal(job.planned_quantity).toFixed() : ""} required /></div>
              <div className="field"><label htmlFor="service-receiver">Người xác nhận tại công trình</label><input id="service-receiver" name="receiverName" maxLength={160} /></div>
              <div className="field field-full"><label htmlFor="service-result-note">Ghi chú (không bắt buộc)</label><textarea id="service-result-note" name="note" maxLength={1000} /></div>
              <button className="button button-primary" type="submit">Hoàn tất, chờ xác minh</button></form>
            <form className="command-panel" action={heartbeatWorkItemAction}>{hidden({ workItemId: work.workItemId, serviceJobId: job.id, operationId: randomUUID(), note: "Vẫn đang làm, tiến độ bình thường" })}
              <button className="button button-secondary" type="submit">Ghi nhận vẫn đang làm</button></form>
          </details>}
        </>}
        {job.work_item_id && job.work_state === "DONE" && canVerify && <form className="command-panel" action={verifyServiceJobAction}>
          {hidden({ serviceJobId: job.id, jobVersion: job.version, workVersion: job.work_version ?? 1, operationId: randomUUID() })}
          <p className="muted">Thợ báo <strong>{quantityText(job.actual_quantity, unit)}</strong>. Sửa nếu khách chỉ chịu một phần.</p>
          <ServiceBillingFields defaultQuantity={job.actual_quantity ?? ""} unitLabel={unit} unitPriceVnd={unitPrice} />
          <div className="field"><label htmlFor="compensable-quantity">Số lượng tính công cho thợ</label>
            <QuantityStepper id="compensable-quantity" name="compensableQuantity" label="Số lượng tính công cho thợ" unit={unit} min={0} defaultValue={job.actual_quantity ?? ""} required /></div>
          <div className="field"><label htmlFor="service-due">Hạn thu</label><input id="service-due" type="date" name="dueDate" defaultValue={today()} required /></div>
          <div className="field field-full"><label htmlFor="service-verify-note">Ghi chú (không bắt buộc)</label><textarea id="service-verify-note" name="note" maxLength={1000} /></div>
          <button className="button button-primary" type="submit">Xác minh & ghi công nợ</button>
        </form>}
        {job.execution_state === "VERIFIED" && <p className="muted">Đã xác minh. Thu tiền tại Công nợ của khách.</p>}
        {job.service_verification_id && canComp && <form className="command-panel" action={calculateEarningAction}>
          {hidden({ sourceKind: "SERVICE_VERIFICATION", sourceId: job.service_verification_id, returnTo: "/admin/service-jobs/" + job.id, operationId: randomUUID() })}
          <div className="field"><label htmlFor="service-rule">Tính thu nhập cho thợ theo quy tắc</label><select id="service-rule" name="ruleId" required><option value="">Chọn quy tắc</option>{(rules ?? []).map((rule) => <option key={rule.id} value={rule.id}>{rule.code} · Phiên bản {rule.version} · {earningTypeLabel(rule.earning_type)}</option>)}</select></div>
          <button className="button button-secondary" type="submit">Tính thu nhập</button>
        </form>}
        {job.execution_state === "CANCELLED" && <p className="muted">Đơn dịch vụ đã hủy; không giao việc hay ghi kết quả được nữa.</p>}
        {job.execution_state === "SCHEDULED" && !job.work_item_id && canCancel && <FormDialog label="Hủy đơn dịch vụ" title={`Hủy ${job.job_number}`} buttonClassName="button button-danger">
          <form className="command-panel" action={cancelScheduledServiceJobAction}>{hidden({ serviceJobId: job.id, version: job.version, operationId: randomUUID() })}
            <div className="field"><label htmlFor="serviceCancelReason">Ghi chú (không bắt buộc)</label><input id="serviceCancelReason" name="reason" maxLength={500} /></div>
            <button className="button button-danger" type="submit">Hủy đơn dịch vụ</button></form></FormDialog>}
      </aside>
    </div>
  </>;
}
