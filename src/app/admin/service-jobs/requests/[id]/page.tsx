import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";

import { ActionNotice } from "@/components/sales/action-notice";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { StatusBadge } from "@/components/ui/status-badge";
import { ServiceJobResourceField } from "@/components/workforce/service-job-resource-field";
import { ServiceJobTimeFields } from "@/components/workforce/service-job-time-fields";
import { ServiceTypeFields, type ServiceTypeOption } from "@/components/workforce/service-type-fields";
import { requireInternalPermission } from "@/lib/access/context";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatQuantity } from "@/lib/core/quantity";
import { createServerSupabase } from "@/lib/supabase/server";
import { catalogEditorScope } from "@/modules/catalog/editor-data";
import { vehicleName } from "@/modules/catalog/vehicle-label";
import { estimateVnd, shortDate, slotText } from "@/modules/portal/service-request";
import { serviceRequestStateLabel } from "@/modules/workforce/presentation";
import { rejectServiceRequestAction, scheduleServiceRequestAction } from "@/modules/workforce/service-request-actions";
import { loadSalesStaffOptions } from "@/modules/workforce/sales-staff";
import { currentSkin } from "@/lib/skin";
import { AxDialogClose } from "@/components/astryx/sales-dialog";
import { AxSubmit } from "@/components/astryx/sales-dialogs";
import { AstryxServiceRequestDetailView } from "./astryx-view";

type Request = {
  id: string; request_number: string; state: "SUBMITTED" | "SCHEDULED" | "CANCELLED" | "REJECTED"; version: number; customer_id: string; customer_name_snapshot: string;
  site_name_snapshot: string; site_address_snapshot: string; service_type_id: string; service_name_snapshot: string; unit_label_snapshot: string;
  unit_price_snapshot_vnd: string | null; quantity: string; preferred_date: string; preferred_slot: "MORNING" | "AFTERNOON" | "TIME"; preferred_time: string | null;
  contact_name: string; contact_phone: string; note: string | null; created_at: string; decided_at: string | null; decision_reason: string | null; service_job_id: string | null;
};
const tone = (state: string) => state === "SUBMITTED" ? "warning" as const : state === "SCHEDULED" ? "success" as const : state === "REJECTED" ? "danger" as const : "info" as const;
/** The customer's wish as the first value of the schedule form: morning 08:00, afternoon 13:00, or the exact time asked. */
const wishedStart = (request: Pick<Request, "preferred_date" | "preferred_slot" | "preferred_time">) =>
  `${request.preferred_date}T${request.preferred_slot === "TIME" && request.preferred_time ? request.preferred_time.slice(0, 5) : request.preferred_slot === "AFTERNOON" ? "13:00" : "08:00"}`;

/** One customer request (D75): what the customer asked for, and "Xếp lịch" (a service job from it) or "Từ chối" with a reason the customer reads. */
export default async function ServiceRequestDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("service.read");
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("service_requests")
    .select("id, request_number, state, version, customer_id, customer_name_snapshot, site_name_snapshot, site_address_snapshot, service_type_id, service_name_snapshot, unit_label_snapshot, unit_price_snapshot_vnd::text, quantity::text, preferred_date, preferred_slot, preferred_time, contact_name, contact_phone, note, created_at, decided_at, decision_reason, service_job_id")
    .eq("branch_id", access.branchId).eq("id", id).maybeSingle();
  if (error) throw new Error("Không thể tải yêu cầu dịch vụ.");
  if (!data) notFound();
  const request = data as unknown as Request;
  const open = request.state === "SUBMITTED";
  const canManage = access.permissions.has("service.manage");
  const [typeResult, vehicleResult, machineResult, salesStaff, job] = await Promise.all([
    open && canManage ? supabase.from("service_types").select("id, code, name, unit_label, default_price_vnd::text, resource_kind").eq("branch_id", access.branchId).eq("active", true).order("name").order("id").limit(200) : Promise.resolve({ data: [] }),
    open && canManage ? supabase.from("vehicles").select("id, code, plate_number").eq("branch_id", access.branchId).eq("active", true).order("code").order("id").limit(25) : Promise.resolve({ data: [] }),
    open && canManage ? supabase.from("machines").select("id, code, name").eq("branch_id", access.branchId).eq("active", true).order("code").order("id").limit(25) : Promise.resolve({ data: [] }),
    open && canManage ? loadSalesStaffOptions(supabase, access.branchId) : Promise.resolve([]),
    request.service_job_id ? supabase.from("service_jobs").select("id, job_number").eq("id", request.service_job_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const estimate = estimateVnd(String(request.quantity), request.unit_price_snapshot_vnd);
  // Form "Xếp lịch" (tạo đơn dịch vụ từ yêu cầu): dùng chung cho Classic và Astryx.
  const scheduleForm = open && canManage && <form className="command-panel service-job-form" action={scheduleServiceRequestAction}>
          <input type="hidden" name="requestId" value={request.id} /><input type="hidden" name="version" value={request.version} /><input type="hidden" name="operationId" value={randomUUID()} />
          <fieldset className="form-section"><legend>Dịch vụ</legend>
            <ServiceTypeFields types={(typeResult.data ?? []) as ServiceTypeOption[]} scope={catalogEditorScope(access, "service_types")} defaultTypeId={request.service_type_id} defaultQuantity={String(request.quantity)}
              vehicleField={<ServiceJobResourceField kind="vehicle" label="Xe" name="vehicleId" initialOptions={(vehicleResult.data ?? []).map((item) => ({ id: item.id, label: vehicleName(item) }))} />}
              machineField={<ServiceJobResourceField kind="machine" label="Máy" name="machineId" initialOptions={(machineResult.data ?? []).map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))} />} /></fieldset>
          <fieldset className="form-section"><legend>Thời gian</legend><ServiceJobTimeFields defaultStart={wishedStart(request)} /></fieldset>
          <fieldset className="form-section"><legend>Thêm (không bắt buộc)</legend>
            <ServiceJobResourceField kind="sales" label="Nhân viên kinh doanh phụ trách" name="salesEmployeeId" initialOptions={salesStaff} />
            <div className="field field-full"><label htmlFor="service-description">Ghi chú công việc</label>
              <textarea id="service-description" name="description" maxLength={500} defaultValue={request.note ?? ""} placeholder="VD: chạc gạch vỡ, đường hẹp" /></div></fieldset>
          <button className="button button-primary" type="submit">Xếp lịch</button>
        </form>;
  // Kiểu giao diện Astryx: cùng dữ liệu, quyền và form; "Từ chối" mở hộp thoại, "Xếp lịch" giữ form nhiều trường ngay trong trang.
  if ((await currentSkin()) === "astryx") return <AstryxServiceRequestDetailView title={`${request.service_name_snapshot} · ${formatQuantity(String(request.quantity))} ${request.unit_label_snapshot}`}
    number={request.request_number} customer={request.customer_name_snapshot} site={request.site_name_snapshot} stateLabel={serviceRequestStateLabel(request.state)} stateTone={tone(request.state)}
    notice={query.notice} error={query.error} canSchedule={open && canManage} readOnlyOpen={open && !canManage}
    info={{ sentAt: formatBusinessDateTime(request.created_at), siteAddress: `${request.site_name_snapshot} — ${request.site_address_snapshot}`, wish: `${shortDate(request.preferred_date)}, ${slotText(request.preferred_slot, request.preferred_time?.slice(0, 5))}`,
      contactName: request.contact_name, contactPhone: request.contact_phone, note: request.note,
      estimate: estimate !== null && request.unit_price_snapshot_vnd ? `${formatVnd(vnd(estimate))} (${formatQuantity(String(request.quantity))} × ${formatVnd(vnd(request.unit_price_snapshot_vnd))})` : "Chưa có giá: cửa hàng báo giá",
      cancelled: request.state === "CANCELLED" ? `${request.decision_reason ?? ""} · ${request.decided_at ? formatBusinessDateTime(request.decided_at) : ""}` : null, rejected: request.state === "REJECTED" ? request.decision_reason : null,
      job: job.data ? { id: job.data.id, number: job.data.job_number } : null }}
    scheduleForm={scheduleForm}
    rejectForm={open && canManage && <form action={rejectServiceRequestAction} className="sx-dlg-body">
      <input type="hidden" name="requestId" value={request.id} /><input type="hidden" name="version" value={request.version} /><input type="hidden" name="operationId" value={randomUUID()} />
      <p>Dùng khi cửa hàng không nhận được yêu cầu này (hết xe, ngoài vùng…). Lý do hiện cho khách trên cổng khách; khách vẫn đặt lại được.</p>
      <label className="sx-field" htmlFor="reject-reason">Lý do cho khách<textarea id="reject-reason" name="reason" required minLength={3} maxLength={300} rows={3} placeholder="VD: hết máy trong ngày, mời anh chọn ngày khác" /></label>
      <div className="sx-dlg-foot"><AxDialogClose label="Không từ chối" /><AxSubmit label="Từ chối yêu cầu" pendingLabel="Đang gửi..." danger /></div></form>} />;
  return <div className="page-stack">
    <Breadcrumb parent={{ href: "/admin/service-jobs/requests", label: "Yêu cầu từ khách" }} current={request.request_number} />
    <header className="page-heading"><div>
      <h1>{request.service_name_snapshot} · {formatQuantity(String(request.quantity))} {request.unit_label_snapshot}</h1>
      <p className="lede">{request.customer_name_snapshot} · {request.site_name_snapshot}</p></div>
      <StatusBadge tone={tone(request.state)}>{serviceRequestStateLabel(request.state)}</StatusBadge></header>
    <ActionNotice notice={query.notice} error={query.error} />
    <section className="card card-pad" aria-labelledby="request-info">
      <h2 id="request-info">Khách yêu cầu</h2>
      <dl className="detail-grid">
        <div className="detail-item"><dt>Mã yêu cầu</dt><dd className="mono">{request.request_number} · gửi {formatBusinessDateTime(request.created_at)}</dd></div>
        <div className="detail-item"><dt>Công trình</dt><dd>{request.site_name_snapshot} — {request.site_address_snapshot}</dd></div>
        <div className="detail-item"><dt>Khách mong muốn</dt><dd>{shortDate(request.preferred_date)}, {slotText(request.preferred_slot, request.preferred_time?.slice(0, 5))} <span className="muted">(chỉ là mong muốn, cửa hàng xác nhận lại)</span></dd></div>
        <div className="detail-item"><dt>Người liên hệ</dt><dd>{request.contact_name} · <a className="code-link" href={`tel:${request.contact_phone.replace(/[^\d+]/g, "")}`}>{request.contact_phone}</a></dd></div>
        {request.note && <div className="detail-item"><dt>Ghi chú của khách</dt><dd>{request.note}</dd></div>}
        <div className="detail-item"><dt>Tạm tính khách đã thấy</dt><dd>{estimate !== null && request.unit_price_snapshot_vnd ? `${formatVnd(vnd(estimate))} (${formatQuantity(String(request.quantity))} × ${formatVnd(vnd(request.unit_price_snapshot_vnd))})` : "Chưa có giá: cửa hàng báo giá"}</dd></div>
        {request.state === "CANCELLED" && <div className="detail-item"><dt>Khách hủy</dt><dd>{request.decision_reason} · {request.decided_at ? formatBusinessDateTime(request.decided_at) : ""}</dd></div>}
        {request.state === "REJECTED" && <div className="detail-item"><dt>Lý do từ chối (khách đọc được)</dt><dd>{request.decision_reason}</dd></div>}
        {job.data && <div className="detail-item"><dt>Đơn dịch vụ</dt><dd><Link className="code-link" href={`/admin/service-jobs/${job.data.id}`}>{job.data.job_number}</Link></dd></div>}
      </dl>
    </section>
    {open && canManage && <>
      <section className="card card-pad" aria-labelledby="request-schedule">
        <h2 id="request-schedule">Xếp lịch</h2>
        <p className="muted">Tạo đơn dịch vụ từ yêu cầu này: chọn giờ, xe hoặc máy, nhân viên phụ trách. Sau đó giao việc cho thợ như mọi đơn dịch vụ. Khách thấy lịch trên cổng khách.</p>
        {scheduleForm}
      </section>
      <section className="card card-pad" aria-labelledby="request-reject">
        <h2 id="request-reject">Từ chối</h2>
        <p className="muted">Dùng khi cửa hàng không nhận được yêu cầu này (hết xe, ngoài vùng…). Lý do hiện cho khách trên cổng khách; khách vẫn đặt lại được.</p>
        <form className="command-panel" action={rejectServiceRequestAction}>
          <input type="hidden" name="requestId" value={request.id} /><input type="hidden" name="version" value={request.version} /><input type="hidden" name="operationId" value={randomUUID()} />
          <div className="field field-full"><label htmlFor="reject-reason">Lý do cho khách</label><input id="reject-reason" name="reason" required minLength={3} maxLength={300} placeholder="VD: hết máy trong ngày, mời anh chọn ngày khác" /></div>
          <button className="button button-danger" type="submit">Từ chối yêu cầu</button>
        </form>
      </section>
    </>}
    {open && !canManage && <p className="muted">Bạn có quyền xem, chưa có quyền xếp lịch hoặc từ chối yêu cầu dịch vụ.</p>}
  </div>;
}
