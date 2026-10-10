import { formatQuantity } from "@/lib/core/quantity";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { serviceStateLabel } from "@/modules/workforce/presentation";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ActionNotice } from "@/components/sales/action-notice";
import { ServiceJobLocationFields } from "@/components/workforce/service-job-location-fields";
import { ServiceJobResourceField } from "@/components/workforce/service-job-resource-field";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { CORE_LIST_PAGE_SIZE, parseCoreListQuery, ilikePattern } from "@/lib/core-list";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceJobAction } from "@/modules/workforce/actions";

type Job = { id: string; job_number: string; customer_name: string; site_name: string; service_type: string; scheduled_start: string; planned_quantity: string; unit_label: string; operator_name: string | null; execution_state: string };
type Query = { notice?: string; error?: string; q?: string; state?: string; page?: string };
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
  const [jobResult, customerResult, employeeResult, vehicleResult, machineResult] = await Promise.all([
    loadJobs(),
    canManage ? supabase.from("customers").select("id, code, display_name").eq("branch_id", branchId).eq("active", true).order("display_name").order("id").limit(25) : Promise.resolve({ data: [] }),
    canManage ? supabase.from("workforce_read").select("id, code, display_name").eq("branch_id", branchId).eq("active", true).order("display_name").order("id").limit(25) : Promise.resolve({ data: [] }),
    canManage ? supabase.from("vehicles").select("id, code, plate_number").eq("branch_id", branchId).eq("active", true).order("code").order("id").limit(25) : Promise.resolve({ data: [] }),
    canManage ? supabase.from("machines").select("id, code, name").eq("branch_id", branchId).eq("active", true).order("code").order("id").limit(25) : Promise.resolve({ data: [] }),
  ]);
  const jobs = jobResult.jobs;
  return <>
    <header className="page-heading"><div><p className="eyebrow">Điều phối dịch vụ</p><h1>Công việc dịch vụ</h1><p className="lede">Lịch, sản lượng thực tế, sản lượng tính khách và sản lượng tính công được ghi nhận riêng.</p></div></header>
    <ActionNotice notice={query.notice} error={query.error} />
    <form className="filter-bar"><label>Tìm kiếm<input name="q" defaultValue={list.q} placeholder="Mã, khách, điểm, dịch vụ, người làm" /></label><label>Trạng thái<select name="state" defaultValue={list.state}><option value="">Tất cả</option><option value="SCHEDULED">Đã lên lịch</option><option value="IN_PROGRESS">Đang làm</option><option value="RESULT_SUBMITTED">Chờ xác minh</option><option value="VERIFIED">Đã xác minh</option><option value="CANCELLED">Đã hủy</option></select></label><button className="button button-secondary" type="submit">Áp dụng</button>{(list.q || list.state) && <Link className="code-link" href="/admin/service-jobs">Xóa lọc</Link>}</form>
    {canManage && <details className="card card-pad quick-create"><summary>Lập lịch công việc dịch vụ</summary><form className="command-panel" action={createServiceJobAction}><input type="hidden" name="operationId" value={randomUUID()} /><ServiceJobLocationFields initialCustomers={customerResult.data ?? []} /><div className="field"><label htmlFor="service-type">Loại dịch vụ</label><input id="service-type" name="serviceType" required /></div><div className="field field-full"><label htmlFor="service-description">Mô tả công việc</label><textarea id="service-description" name="description" minLength={3} required /></div><div className="field"><label htmlFor="service-start">Bắt đầu</label><input id="service-start" type="datetime-local" name="scheduledStart" defaultValue={localNow()} required /></div><div className="field"><label htmlFor="service-end">Kết thúc dự kiến</label><input id="service-end" type="datetime-local" name="scheduledEnd" required /></div><div className="field"><label htmlFor="service-quantity">Sản lượng kế hoạch</label><input id="service-quantity" name="plannedQuantity" inputMode="decimal" required /></div><div className="field"><label htmlFor="service-unit">Đơn vị</label><input id="service-unit" name="unitLabel" defaultValue="giờ" required /></div><ServiceJobResourceField kind="employee" label="Nhân viên kinh doanh phụ trách" name="salesEmployeeId" initialOptions={(employeeResult.data ?? []).map((item) => ({ id: item.id, label: `${item.code} · ${item.display_name}` }))} /><ServiceJobResourceField kind="vehicle" label="Xe" name="vehicleId" initialOptions={(vehicleResult.data ?? []).map((item) => ({ id: item.id, label: `${item.code} · ${item.plate_number}` }))} /><ServiceJobResourceField kind="machine" label="Máy" name="machineId" initialOptions={(machineResult.data ?? []).map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))} /><button className="button button-primary" type="submit">Lập lịch dịch vụ</button></form></details>}
    <section className="card"><div className="section-head"><h2>{jobs.length} công việc dịch vụ trên trang này</h2><span className="scope-chip">25 / trang</span></div><div className="table-wrap"><table><thead><tr><th>Mã</th><th>Khách / điểm</th><th>Dịch vụ</th><th>Lịch</th><th>Kế hoạch</th><th>Người làm</th><th>Trạng thái</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td><Link className="code-link" href={`/admin/service-jobs/${job.id}`}>{job.job_number}</Link></td><td>{job.customer_name}<small className="table-subline">{job.site_name}</small></td><td>{job.service_type}</td><td>{formatBusinessDateTime(job.scheduled_start)}</td><td className="mono">{formatQuantity(String(job.planned_quantity))} {job.unit_label}</td><td>{job.operator_name ?? "Chưa nhận"}</td><td><StatusBadge tone={job.execution_state === "VERIFIED" ? "success" : job.execution_state === "RESULT_SUBMITTED" ? "warning" : "info"}>{serviceStateLabel(job.execution_state)}</StatusBadge></td></tr>)}</tbody></table>{!jobs.length && <p className="empty-inline">Không có công việc dịch vụ phù hợp.</p>}</div><ListPager page={list.page} hasNext={jobResult.hasNext} params={{ q: list.q, state: list.state }} /></section>
  </>;
}
