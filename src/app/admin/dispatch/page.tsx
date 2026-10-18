import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { CORE_LIST_PAGE_SIZE, parseCoreListQuery } from "@/lib/core-list";
import { createServerSupabase } from "@/lib/supabase/server";
import { deliveryStateLabel, deliveryStateTone } from "@/modules/delivery/presentation";
import { DispatchDayBoard, type DispatchDay } from "@/components/delivery/dispatch-day-board";
import { businessInputValue } from "@/lib/core/business-time";

type Delivery = { id: string; delivery_number: string; customer_name_snapshot: string; site_name_snapshot: string; execution_state: string; result_kind: string | null; scheduled_at: string | null };
type QueryValue = string | string[] | undefined;
type Query = { q?: QueryValue; plannedPage?: QueryValue; assignedPage?: QueryValue; activePage?: QueryValue; exceptionPage?: QueryValue; day?: QueryValue; dispatched?: QueryValue; error?: QueryValue };
type PageKey = "plannedPage" | "assignedPage" | "activePage" | "exceptionPage";

const pageKeys: PageKey[] = ["plannedPage", "assignedPage", "activePage", "exceptionPage"];

function firstValue(value: QueryValue) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function pageHref(query: Query, activeKey: PageKey, targetPage: number) {
  const params = new URLSearchParams();
  const q = parseCoreListQuery({ q: firstValue(query.q) }).q;
  if (q) params.set("q", q);
  for (const key of pageKeys) {
    const page = key === activeKey
      ? targetPage
      : parseCoreListQuery({ page: firstValue(query[key]) }).page;
    if (page > 1) params.set(key, String(page));
  }
  const value = params.toString();
  return value ? `/admin/dispatch?${value}` : "/admin/dispatch";
}

const definitions = [
  { pageKey: "plannedPage", bucket: "planned", title: "Chờ phân giao" },
  { pageKey: "assignedPage", bucket: "assigned", title: "Đã phân giao" },
  { pageKey: "activePage", bucket: "active", title: "Đang thực hiện" },
  { pageKey: "exceptionPage", bucket: "exception", title: "Ngoại lệ" },
] as const;

export default async function DispatchPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("delivery.read");
  const query = await searchParams;
  const supabase = await createServerSupabase();
  const columns = await Promise.all(definitions.map(async (definition) => {
    const page = parseCoreListQuery({ q: firstValue(query.q), page: firstValue(query[definition.pageKey]) });
    const { data, error } = await supabase.rpc("dispatch_board_page", {
      target_branch_id: access.branchId,
      target_bucket: definition.bucket,
      target_q: page.q,
      target_offset: page.from,
      target_limit: CORE_LIST_PAGE_SIZE + 1,
    });
    if (error) throw new Error("Không thể tải bảng phân giao.");
    const fetched = (data ?? []) as Delivery[];
    return {
      ...definition,
      pageKey: definition.pageKey as PageKey,
      page: page.page,
      rows: fetched.slice(0, CORE_LIST_PAGE_SIZE),
      hasNext: fetched.length > CORE_LIST_PAGE_SIZE,
    };
  }));

  // D22: the day board (today by default, Vietnam time).
  const requestedDay = firstValue(query.day);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(requestedDay) ? requestedDay : businessInputValue(new Date()).slice(0, 10);
  const { data: dayData } = await supabase.rpc("dispatch_day", { target_branch_id: access.branchId, target_day: day });
  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Điều phối</p><h1>Bảng phân giao</h1><p className="lede">Phân công và theo dõi tiến độ giao hàng.</p></div>{access.permissions.has("roles.manage") && <div className="action-cluster"><Link className="button button-secondary" href="/admin/dispatch/resources?kind=vehicles">Xe</Link><Link className="button button-secondary" href="/admin/dispatch/resources?kind=machines">Máy / thiết bị</Link></div>}</header>
    {dayData ? <DispatchDayBoard day={day} board={dayData as DispatchDay} canAssign={access.permissions.has("delivery.assign")}
      notice={firstValue(query.dispatched) || undefined} error={firstValue(query.error) || undefined} />
      : <p className="form-message" role="alert">Chưa tải được lịch giao theo tài xế. Hãy tải lại trang.</p>}
    <form action="/admin/dispatch" method="get" className="filter-bar"><label>Tìm kiếm<input name="q" defaultValue={firstValue(query.q)} maxLength={80} placeholder="Mã phiếu, khách hàng, công trình" /></label><button className="button button-secondary" type="submit">Tìm</button>{firstValue(query.q) && <Link className="code-link" href="/admin/dispatch">Xóa tìm kiếm</Link>}</form>
    <section className="dispatch-board">{columns.map((column) => <div className="dispatch-column" key={column.title}>
      <div className="dispatch-column-head"><h2>{column.title}</h2><span>{column.rows.length}{column.hasNext ? "+" : ""}</span></div>
      {column.rows.map((row) => <Link className="dispatch-ticket" href={`/admin/deliveries/${row.id}`} key={row.id}><strong className="mono">{row.delivery_number}</strong><span>{row.customer_name_snapshot}</span><small>{row.site_name_snapshot}</small><StatusBadge tone={deliveryStateTone(row.execution_state)}>{deliveryStateLabel(row.execution_state)}</StatusBadge></Link>)}
      {column.rows.length === 0 && <p className="muted dispatch-empty">Không có phiếu.</p>}
      <nav className="list-pagination" aria-label={`Phân trang ${column.title}`}><span className="muted">Trang {column.page}</span><div className="action-cluster">{column.page > 1 && <Link className="button button-secondary" href={pageHref(query, column.pageKey, column.page - 1)}>Trước</Link>}{column.hasNext && <Link className="button button-secondary" href={pageHref(query, column.pageKey, column.page + 1)}>Tiếp</Link>}</div></nav>
    </div>)}</section>
  </div>;
}
