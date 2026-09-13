import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ActionNotice } from "@/components/sales/action-notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceJobAction } from "@/modules/workforce/actions";

type Job = {
  id: string; job_number: string; customer_name: string; site_name: string;
  service_type: string; scheduled_start: string; planned_quantity: string;
  unit_label: string; operator_name: string | null; execution_state: string;
};
const localNow = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
}).format(new Date()).replace(" ", "T");

export default async function ServiceJobsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("service.read");
  const query = await searchParams;
  const supabase = await createServerSupabase();
  const [{ data }, { data: customers }, { data: sites }, { data: employees }, { data: vehicles }, { data: machines }] = await Promise.all([
    supabase.from("service_job_read").select("id, job_number, customer_name, site_name, service_type, scheduled_start, planned_quantity, unit_label, operator_name, execution_state").eq("branch_id", access.branchId).order("scheduled_start", { ascending: false }),
    supabase.from("customers").select("id, code, display_name").eq("branch_id", access.branchId).eq("active", true).order("display_name"),
    supabase.from("customer_sites").select("id, customer_id, name").eq("branch_id", access.branchId).eq("active", true).order("name"),
    supabase.from("workforce_read").select("id, code, display_name").eq("branch_id", access.branchId).eq("active", true).order("display_name"),
    supabase.from("vehicles").select("id, code, plate_number").eq("branch_id", access.branchId).eq("active", true).order("code"),
    supabase.from("machines").select("id, code, name").eq("branch_id", access.branchId).eq("active", true).order("code"),
  ]);
  const canManage = access.permissions.has("service.manage");
  return <>
    <header className="page-heading"><div><p className="eyebrow">Service operations</p><h1>Công việc dịch vụ</h1><p className="lede">Lịch, actual, billable và compensable được giữ thành các facts riêng.</p></div></header>
    <ActionNotice notice={query.notice} error={query.error} />
    {canManage && <details className="card card-pad quick-create" open><summary>Lập ServiceJob</summary>
      <form className="command-panel" action={createServiceJobAction}>
        <input type="hidden" name="operationId" value={randomUUID()} />
        <div className="field"><label>Khách hàng</label><select name="customerId" required><option value="">Chọn khách</option>{(customers ?? []).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.display_name}</option>)}</select></div>
        <div className="field"><label>Địa điểm</label><select name="siteId" required><option value="">Chọn điểm</option>{(sites ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className="field"><label>Loại dịch vụ</label><input name="serviceType" required /></div>
        <div className="field field-full"><label>Mô tả công việc</label><textarea name="description" minLength={3} required /></div>
        <div className="field"><label>Bắt đầu</label><input type="datetime-local" name="scheduledStart" defaultValue={localNow()} required /></div>
        <div className="field"><label>Kết thúc dự kiến</label><input type="datetime-local" name="scheduledEnd" required /></div>
        <div className="field"><label>Sản lượng kế hoạch</label><input name="plannedQuantity" inputMode="decimal" required /></div>
        <div className="field"><label>Đơn vị</label><input name="unitLabel" defaultValue="giờ" required /></div>
        <div className="field"><label>Sales phụ trách</label><select name="salesEmployeeId"><option value="">Không gắn</option>{(employees ?? []).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.display_name}</option>)}</select></div>
        <div className="field"><label>Xe</label><select name="vehicleId"><option value="">Không dùng xe</option>{(vehicles ?? []).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.plate_number}</option>)}</select></div>
        <div className="field"><label>Máy</label><select name="machineId"><option value="">Không dùng máy</option>{(machines ?? []).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></div>
        <button className="button button-primary" type="submit">Lập lịch dịch vụ</button>
      </form>
    </details>}
    <section className="card"><div className="section-head"><h2>{(data ?? []).length} ServiceJob</h2><span className="scope-chip">Nguồn dịch vụ riêng</span></div>
      <div className="table-wrap"><table><thead><tr><th>Mã</th><th>Khách / điểm</th><th>Dịch vụ</th><th>Lịch</th><th>Kế hoạch</th><th>Người làm</th><th>Trạng thái</th></tr></thead><tbody>
        {((data ?? []) as Job[]).map((job) => <tr key={job.id}><td><Link className="code-link" href={"/admin/service-jobs/" + job.id}>{job.job_number}</Link></td><td>{job.customer_name}<small className="table-subline">{job.site_name}</small></td><td>{job.service_type}</td><td>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(job.scheduled_start))}</td><td className="mono">{job.planned_quantity} {job.unit_label}</td><td>{job.operator_name ?? "Chưa nhận"}</td><td><StatusBadge tone={job.execution_state === "VERIFIED" ? "success" : job.execution_state === "RESULT_SUBMITTED" ? "warning" : "info"}>{job.execution_state}</StatusBadge></td></tr>)}
      </tbody></table>{!data?.length && <p className="empty-inline">Chưa có ServiceJob.</p>}</div>
    </section>
  </>;
}
