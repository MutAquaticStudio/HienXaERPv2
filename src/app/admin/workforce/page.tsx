import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ActionNotice } from "@/components/sales/action-notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { assignWorkItemAction, claimWorkItemAction } from "@/modules/workforce/actions";

type Worker = {
  id: string; code: string; display_name: string; role_name: string; active: boolean;
  work_item_id: string | null; work_number: string | null; current_work: string | null; work_state: string | null;
};
type Work = {
  id: string; service_job_id: string | null; work_number: string; title: string;
  execution_state: string; scheduled_start: string; version: number;
};

export default async function WorkforcePage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("workforce.read");
  const query = await searchParams;
  const supabase = await createServerSupabase();
  const [{ data }, { data: available }] = await Promise.all([
    supabase.from("workforce_read").select("id, code, display_name, role_name, active, work_item_id, work_number, current_work, work_state").eq("branch_id", access.branchId).order("display_name"),
    supabase.from("work_item_read").select("id, service_job_id, work_number, title, execution_state, scheduled_start, version").eq("branch_id", access.branchId).eq("execution_state", "AVAILABLE").order("scheduled_start"),
  ]);
  const workers = (data ?? []) as Worker[];
  const pool = (available ?? []) as Work[];
  const canManage = access.permissions.has("work.manage");
  const canClaim = access.permissions.has("work.claim");
  return <>
    <header className="page-heading"><div><p className="eyebrow">Workforce orchestration</p><h1>Nhân sự và WorkItem</h1><p className="lede">WorkItem điều phối người/tài nguyên; Delivery và ServiceJob vẫn là nguồn nghiệp vụ.</p></div></header>
    <ActionNotice notice={query.notice} error={query.error} />
    <div className="two-column">
      <section className="card"><div className="section-head"><h2>Nhân sự theo chi nhánh</h2><span className="scope-chip">Không hiển thị lương</span></div>
        <div className="table-wrap"><table><thead><tr><th>Nhân viên</th><th>Vai trò</th><th>Việc hiện tại</th><th>Trạng thái</th></tr></thead><tbody>
          {workers.map((worker) => <tr key={worker.id + "-" + (worker.work_item_id ?? "free")}><td>{worker.display_name}<small className="table-subline mono">{worker.code}</small></td><td>{worker.role_name}</td><td>{worker.current_work ?? "Sẵn sàng"}</td><td><StatusBadge tone={worker.work_state ? "warning" : "success"}>{worker.work_state ?? "AVAILABLE"}</StatusBadge></td></tr>)}
        </tbody></table></div>
      </section>
      <section className="card card-pad"><div className="section-head"><h2>Pool chờ nhận</h2><span className="scope-chip">Atomic claim</span></div>
        <ul className="clean-list">{pool.map((work) => <li key={work.id}><strong>{work.work_number} · {work.title}</strong><small>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(work.scheduled_start))}</small>
          <div className="inline-actions">
            {work.service_job_id && <Link className="button button-secondary" href={"/admin/service-jobs/" + work.service_job_id}>Mở nguồn</Link>}
            {canClaim && work.service_job_id && <form action={claimWorkItemAction}><input type="hidden" name="workItemId" value={work.id} /><input type="hidden" name="serviceJobId" value={work.service_job_id} /><input type="hidden" name="version" value={work.version} /><input type="hidden" name="operationId" value={randomUUID()} /><button className="button button-primary" type="submit">Nhận việc</button></form>}
          </div>
          {canManage && work.service_job_id && <form className="command-panel" action={assignWorkItemAction}><input type="hidden" name="workItemId" value={work.id} /><input type="hidden" name="serviceJobId" value={work.service_job_id} /><input type="hidden" name="version" value={work.version} /><input type="hidden" name="operationId" value={randomUUID()} /><div className="field"><label>Giao trực tiếp</label><select name="employeeId" required><option value="">Chọn nhân viên</option>{workers.filter((item) => item.active && !item.work_item_id).map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></div><button className="button button-secondary" type="submit">Giao</button></form>}
        </li>)}</ul>
        {!pool.length && <p className="empty-inline">Không có việc đang chờ nhận.</p>}
      </section>
    </div>
  </>;
}
