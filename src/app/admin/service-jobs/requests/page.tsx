import Link from "next/link";

import { Breadcrumb } from "@/components/ui/breadcrumb";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { AppError } from "@/lib/core/errors";
import { formatQuantity } from "@/lib/core/quantity";
import { createServerSupabase } from "@/lib/supabase/server";
import { shortDate, slotText } from "@/modules/portal/service-request";
import { serviceRequestStateLabel } from "@/modules/workforce/presentation";

type Row = {
  id: string; request_number: string; state: string; customer_name_snapshot: string; site_name_snapshot: string; service_name_snapshot: string;
  unit_label_snapshot: string; quantity: string; preferred_date: string; preferred_slot: "MORNING" | "AFTERNOON" | "TIME"; preferred_time: string | null; created_at: string;
};
const FILTERS = [{ value: "SUBMITTED", label: "Chờ xác nhận lịch" }, { value: "SCHEDULED", label: "Đã xếp lịch" }, { value: "CANCELLED", label: "Khách đã hủy" },
  { value: "REJECTED", label: "Đã từ chối" }, { value: "ALL", label: "Tất cả" }] as const;
const tone = (state: string) => state === "SUBMITTED" ? "warning" as const : state === "SCHEDULED" ? "success" as const : state === "REJECTED" ? "danger" as const : "info" as const;

/** D75 "Yêu cầu từ khách": what customers asked for on the portal; open one to schedule it as a service job or to turn it down. */
export default async function ServiceRequestsPage({ searchParams }: { searchParams: Promise<{ state?: string; notice?: string }> }) {
  const access = await requireInternalPermission("service.read").catch((error: unknown) => {
    if (error instanceof AppError && error.code === "FORBIDDEN") return null;
    throw error;
  });
  if (!access) return <section className="empty-state" role="alert"><div><h1>Không thể xem yêu cầu từ khách</h1><p className="lede">Tài khoản của bạn chưa được cấp quyền xem công việc dịch vụ trong chi nhánh này.</p><Link className="button button-secondary" href="/">Về trang đầu</Link></div></section>;
  const query = await searchParams;
  const state = FILTERS.some((item) => item.value === query.state) ? query.state! : "SUBMITTED";
  const supabase = await createServerSupabase();
  let request = supabase.from("service_requests").select("id, request_number, state, customer_name_snapshot, site_name_snapshot, service_name_snapshot, unit_label_snapshot, quantity::text, preferred_date, preferred_slot, preferred_time, created_at")
    .eq("branch_id", access.branchId);
  if (state !== "ALL") request = request.eq("state", state);
  const { data, error } = await request.order(state === "SUBMITTED" ? "preferred_date" : "created_at", { ascending: state === "SUBMITTED" }).order("id").limit(100);
  if (error) throw new Error("Không thể tải yêu cầu từ khách.");
  const rows = (data ?? []) as unknown as Row[];
  return <div className="page-stack">
    <Breadcrumb parent={{ href: "/admin/service-jobs", label: "Đơn dịch vụ" }} current="Yêu cầu từ khách" />
    <header className="page-heading"><div><h1>Yêu cầu từ khách</h1>
      <p className="lede">Khách gửi yêu cầu trên cổng khách với ngày và buổi mong muốn. Mở yêu cầu để xếp lịch thành đơn dịch vụ (chọn giờ, xe hoặc máy, thợ) hoặc từ chối kèm lý do. Khách chưa bị tính tiền; giá cuối theo khối lượng đã xác minh.</p></div></header>
    <nav className="action-cluster" aria-label="Lọc theo trạng thái">{FILTERS.map((item) =>
      <Link key={item.value} className={`button ${item.value === state ? "button-primary" : "button-secondary"}`} aria-current={item.value === state ? "page" : undefined}
        href={`/admin/service-jobs/requests?state=${item.value}`}>{item.label}</Link>)}</nav>
    <section className="card list-main"><div className="section-head"><h2>{rows.length} yêu cầu</h2></div>
      <div className="table-wrap"><table className="row-link-table">
        <thead><tr><th scope="col">Mã</th><th scope="col">Khách / công trình</th><th scope="col">Dịch vụ</th><th scope="col">Khách mong muốn</th><th scope="col">Gửi lúc</th><th scope="col">Trạng thái</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td className="mono" data-label="Mã"><Link className="code-link" href={`/admin/service-jobs/requests/${row.id}`}>{row.request_number}</Link></td>
          <td className="row-title" data-label="Khách / công trình">{row.customer_name_snapshot}<small className="table-subline">{row.site_name_snapshot}</small></td>
          <td data-label="Dịch vụ">{row.service_name_snapshot}<small className="table-subline">{formatQuantity(String(row.quantity))} {row.unit_label_snapshot}</small></td>
          <td data-label="Khách mong muốn">{shortDate(row.preferred_date)}<small className="table-subline">{slotText(row.preferred_slot, row.preferred_time?.slice(0, 5))}</small></td>
          <td data-label="Gửi lúc">{formatBusinessDateTime(row.created_at)}</td>
          <td data-label="Trạng thái"><StatusBadge tone={tone(row.state)}>{serviceRequestStateLabel(row.state)}</StatusBadge></td>
        </tr>)}</tbody>
      </table>{!rows.length && <p className="empty-inline">{state === "SUBMITTED" ? "Không có yêu cầu nào đang chờ xác nhận lịch." : "Không có yêu cầu nào trong mục này."}</p>}</div>
    </section>
  </div>;
}
