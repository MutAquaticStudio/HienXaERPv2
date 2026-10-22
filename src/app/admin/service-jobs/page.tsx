import { formatQuantity } from "@/lib/core/quantity";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { serviceStateLabel } from "@/modules/workforce/presentation";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ActionNotice } from "@/components/sales/action-notice";
import { ServiceJobLocationFields } from "@/components/workforce/service-job-location-fields";
import { ServiceJobResourceField } from "@/components/workforce/service-job-resource-field";
import { ServiceTypeFields, type ServiceTypeOption } from "@/components/workforce/service-type-fields";
import { catalogEditorScope } from "@/modules/catalog/editor-data";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { CORE_LIST_PAGE_SIZE, parseCoreListQuery, ilikePattern } from "@/lib/core-list";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceJobAction } from "@/modules/workforce/actions";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";
import { DetailTabs } from "@/components/ui/detail-tabs";
import { FormDialog } from "@/components/ui/form-dialog";
import { ServiceJobTimeFields } from "@/components/workforce/service-job-time-fields";

type Job = { id: string; job_number: string; customer_name: string; site_name: string; service_type: string; scheduled_start: string; planned_quantity: string | null; unit_label: string; operator_name: string | null; execution_state: string };
const STATES = ["SCHEDULED", "IN_PROGRESS", "RESULT_SUBMITTED", "VERIFIED", "CANCELLED"] as const;
const stateTone = (state: string) => state === "VERIFIED" ? "success" as const : state === "RESULT_SUBMITTED" ? "warning" as const : state === "CANCELLED" ? "danger" as const : "info" as const;
/** FB8: an empty planned quantity is counted on site. */
const plannedText = (job: Pick<Job, "planned_quantity" | "unit_label">) => job.planned_quantity == null ? "Theo thực tế" : `${formatQuantity(String(job.planned_quantity))} ${job.unit_label}`;
type Query = { notice?: string; error?: string; q?: string; state?: string; page?: string; customerId?: string; siteId?: string };
const localNow = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(" ", "T");


export default async function ServiceJobsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("service.read").catch((error: unknown) => {
    if (error instanceof AppError && error.code === "FORBIDDEN") return null;
    throw error;
  });
  if (!access) return <section className="empty-state" role="alert"><div><p className="eyebrow">Không có quyền truy cập</p><h1>Không thể xem công việc dịch vụ</h1><p className="lede">Tài khoản của bạn chưa được cấp quyền xem công việc dịch vụ trong chi nhánh này.</p><Link className="button button-secondary" href="/">Về trang đầu</Link></div></section>;
  const branchId = access.branchId;
  const query = await searchParams;
  const list = parseCoreListQuery(query);
  const supabase = await createServerSupabase();
  const canManage = access.permissions.has("service.manage");
  async function loadJobs(): Promise<{ jobs: Job[]; hasNext: boolean }> {
    if (list.q) {
      let request = supabase.from("service_job_read").select("id, job_number, customer_name, site_name, service_type, scheduled_start, planned_quantity, unit_label, operator_name, execution_state")
        .eq("branch_id", branchId)
        .or(`job_number.ilike.${ilikePattern(list.q)},customer_name.ilike.${ilikePattern(list.q)},site_name.ilike.${ilikePattern(list.q)},service_type.ilike.${ilikePattern(list.q)},operator_name.ilike.${ilikePattern(list.q)}`);
      if (list.state) request = request.eq("execution_state", list.state);
      const { data, error } = await request.order("scheduled_start", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to + 1);
      if (error) throw new Error("Không thể tải công việc dịch vụ.");
      const rows = (data ?? []) as Job[];
      return { jobs: rows.slice(0, CORE_LIST_PAGE_SIZE), hasNext: rows.length > CORE_LIST_PAGE_SIZE };
    }

    let request = supabase.from("service_jobs").select("id, job_number, service_type, scheduled_start, planned_quantity, unit_label, execution_state")
      .eq("branch_id", branchId);
    if (list.state) request = request.eq("execution_state", list.state);
    const { data, error } = await request.order("scheduled_start", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to + 1);
    if (error) throw new Error("Không thể tải công việc dịch vụ.");
    const pageRows = data ?? [];
    const visibleRows = pageRows.slice(0, CORE_LIST_PAGE_SIZE);
    if (!visibleRows.length) return { jobs: [], hasNext: false };
    const detailResult = await supabase.from("service_job_read").select("id, customer_name, site_name, operator_name")
      .eq("branch_id", branchId).in("id", visibleRows.map((row) => row.id));
    if (detailResult.error) throw new Error("Không thể tải thông tin công việc dịch vụ.");
    const detailMap = new Map<string, { customer_name: string; site_name: string; operator_name: string | null }>();
    for (const row of detailResult.data ?? []) {
      if (!detailMap.has(row.id) || (!detailMap.get(row.id)?.operator_name && row.operator_name)) detailMap.set(row.id, row);
    }
    const jobs = visibleRows.map((row) => {
      const detail = detailMap.get(row.id);
      if (!detail) throw new Error("Thiếu thông tin công việc dịch vụ.");
      return { ...row, ...detail } as Job;
    });
    return { jobs, hasNext: pageRows.length > CORE_LIST_PAGE_SIZE };
  }
  // Tab counts stop at 99: an exact count over a long history is not worth the wait on every visit.
  const countOf = (state: string) => supabase.from("service_jobs").select("id").eq("branch_id", branchId).eq("execution_state", state).limit(100);
  const shown = (result: { data: unknown[] | null }) => result.data ? result.data.length > 99 ? "99+" : result.data.length : undefined;
  const [jobResult, customerResult, employeeResult, vehicleResult, machineResult, typeResult, ...counts] = await Promise.all([
    loadJobs(),
    canManage ? supabase.from("customers").select("id, code, display_name").eq("branch_id", branchId).eq("active", true).order("display_name").order("id").limit(25) : Promise.resolve({ data: [] }),
    canManage ? supabase.from("workforce_read").select("id, code, display_name").eq("branch_id", branchId).eq("active", true).order("display_name").order("id").limit(25) : Promise.resolve({ data: [] }),
    canManage ? supabase.from("vehicles").select("id, code, plate_number").eq("branch_id", branchId).eq("active", true).order("code").order("id").limit(25) : Promise.resolve({ data: [] }),
    canManage ? supabase.from("machines").select("id, code, name").eq("branch_id", branchId).eq("active", true).order("code").order("id").limit(25) : Promise.resolve({ data: [] }),
    canManage ? supabase.from("service_types").select("id, code, name, unit_label, default_price_vnd::text, resource_kind").eq("branch_id", branchId).eq("active", true).order("name").order("id").limit(200) : Promise.resolve({ data: [] }),
    ...STATES.map(countOf),
  ]);
  const serviceTypes = (typeResult.data ?? []) as ServiceTypeOption[];
  const jobs = jobResult.jobs;
  // Started from an order or a customer ("Tạo dịch vụ", D9): the location is chosen already.
  const uuid = /^[0-9a-f-]{36}$/i;
  const [startCustomer, startSite] = canManage && uuid.test(query.customerId ?? "") ? await Promise.all([
    supabase.from("customers").select("id, code, display_name").eq("branch_id", branchId).eq("id", query.customerId!).maybeSingle(),
    uuid.test(query.siteId ?? "") ? supabase.from("customer_sites").select("id, customer_id, name").eq("customer_id", query.customerId!).eq("id", query.siteId!).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]) : [{ data: null }, { data: null }];
  const tabs = [{ id: "all", label: "Tất cả" }, ...STATES.map((state, index) => ({ id: state, label: serviceStateLabel(state), count: shown(counts[index]) }))];
  const tabHref = (tab: string) => `/admin/service-jobs${tab === "all" ? (list.q ? `?q=${encodeURIComponent(list.q)}` : "") : `?state=${tab}${list.q ? `&q=${encodeURIComponent(list.q)}` : ""}`}`;
  return <>
    <header className="page-heading"><div><p className="eyebrow">Điều phối dịch vụ</p><h1>Đơn dịch vụ</h1>
      <p className="lede">Chở hàng theo chuyến, máy theo giờ, bốc xếp theo công. Chưa biết số lượng thì để trống: thợ bấm số thực tế khi hoàn tất, văn phòng xác minh và ghi công nợ.</p></div>
      {canManage && <div className="action-cluster">
        <FormDialog label="+ Tạo đơn dịch vụ" title="Tạo đơn dịch vụ" size="lg" buttonClassName="button button-primary" defaultOpen={!!startCustomer.data}
          description="Chọn khách, công trình và loại dịch vụ. Số lượng có thể để trống nếu chưa biết.">
          <form className="command-panel service-job-form" action={createServiceJobAction}><input type="hidden" name="operationId" value={randomUUID()} />
            <fieldset className="form-section"><legend>Khách & công trình</legend>
              <ServiceJobLocationFields initialCustomers={customerResult.data ?? []} initialCustomer={startCustomer.data ?? undefined} initialSite={startSite.data ?? undefined} /></fieldset>
            <fieldset className="form-section"><legend>Dịch vụ</legend>
              <ServiceTypeFields types={serviceTypes} scope={catalogEditorScope(access, "service_types")}
                vehicleField={<ServiceJobResourceField kind="vehicle" label="Xe" name="vehicleId" initialOptions={(vehicleResult.data ?? []).map((item) => ({ id: item.id, label: `${item.code} · ${item.plate_number}` }))} />}
                machineField={<ServiceJobResourceField kind="machine" label="Máy" name="machineId" initialOptions={(machineResult.data ?? []).map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))} />} /></fieldset>
            <fieldset className="form-section"><legend>Thời gian</legend><ServiceJobTimeFields defaultStart={localNow()} /></fieldset>
            <fieldset className="form-section"><legend>Thêm (không bắt buộc)</legend>
              <ServiceJobResourceField kind="employee" label="Nhân viên kinh doanh phụ trách" name="salesEmployeeId" initialOptions={(employeeResult.data ?? []).map((item) => ({ id: item.id, label: `${item.code} · ${item.display_name}` }))} />
              <div className="field field-full"><label htmlFor="service-description">Ghi chú công việc</label><textarea id="service-description" name="description" maxLength={500} placeholder="VD: chở cát từ bãi A lên công trình, đường hẹp" /></div></fieldset>
            <button className="button button-primary" type="submit">Tạo đơn dịch vụ</button></form>
        </FormDialog>
        <Link className="button button-secondary" href="/admin/service-jobs/types">Loại dịch vụ</Link></div>}
    </header>
    <ActionNotice notice={query.notice} error={query.error} />
    <DetailTabs tabs={tabs} active={STATES.includes(list.state as typeof STATES[number]) ? list.state : "all"} label="Trạng thái đơn dịch vụ" href={tabHref} />
    <AutoFilterForm>{list.state && <input type="hidden" name="state" value={list.state} />}<label>Tìm kiếm<input name="q" defaultValue={list.q} placeholder="Mã, khách, công trình, dịch vụ, người làm" /></label>{(list.q || list.state) && <Link className="code-link" href="/admin/service-jobs">Xóa lọc</Link>}</AutoFilterForm>
    <section className="card"><div className="section-head"><h2>{jobs.length} đơn dịch vụ trên trang này</h2><span className="scope-chip">25 / trang</span></div><div className="table-wrap"><table><thead><tr><th>Mã</th><th>Khách / công trình</th><th>Dịch vụ</th><th>Lịch</th><th>Số lượng dự kiến</th><th>Người làm</th><th>Trạng thái</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td><Link className="code-link" href={`/admin/service-jobs/${job.id}`}>{job.job_number}</Link></td><td>{job.customer_name}<small className="table-subline">{job.site_name}</small></td><td>{job.service_type}</td><td>{formatBusinessDateTime(job.scheduled_start)}</td><td className="mono">{plannedText(job)}</td><td>{job.operator_name ?? "Chưa giao"}</td><td><StatusBadge tone={stateTone(job.execution_state)}>{serviceStateLabel(job.execution_state)}</StatusBadge></td></tr>)}</tbody></table>{!jobs.length && <p className="empty-inline">{list.q || list.state ? "Không có đơn dịch vụ phù hợp bộ lọc." : "Chưa có đơn dịch vụ. Bấm “+ Tạo đơn dịch vụ”."}</p>}</div><ListPager page={list.page} hasNext={jobResult.hasNext} params={{ q: list.q, state: list.state }} /></section>
  </>;
}
