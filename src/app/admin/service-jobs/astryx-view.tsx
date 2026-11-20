import Link from "next/link";
import type { ReactNode } from "react";
import { ActionNotice } from "@/components/sales/action-notice";
import { AxExpandRow } from "@/components/astryx/ax-expand-row";
import { AxButtonLink, AxPageHead, AxPerson, AxStatus, toneOf } from "@/components/astryx/ax-kit";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";
import { ListFilterGroup } from "@/components/lists/list-filter-group";
import { ListPager } from "@/components/ui/list-pager";

export type AxServiceJobRow = { id: string; number: string; customer: string; site: string; serviceType: string; schedule: string; scheduleEnd: string | null; planned: string; operator: string | null; description: string | null; state: string; stateLabel: string; stateTone: "success" | "warning" | "info" | "danger" };
const TEMPLATE = "36px 110px minmax(0,1.5fr) minmax(0,1fr) 150px 140px 140px 140px";

/** Danh sách đơn dịch vụ kiểu Astryx: cùng bộ lọc (địa chỉ GET), xem nhanh từng dòng và hộp thoại tạo đơn như bản Classic. */
export function AstryxServiceJobsView({ rows, filters, stateFilter, q, isFiltered, openRequests, canManage, notice, error, page, total, hasNext, create }: {
  rows: AxServiceJobRow[]; filters: { value: string; label: string; count?: number | string }[]; stateFilter: string; q: string; isFiltered: boolean;
  openRequests: number | string; canManage: boolean; notice?: string; error?: string; page: number; total?: number; hasNext: boolean; create: ReactNode;
}) {
  return <>
    <AxPageHead crumbs={["Bán hàng", "Dịch vụ", "Đơn dịch vụ"]} title="Đơn dịch vụ"
      actions={<><AxButtonLink href="/admin/service-jobs/requests">{`Yêu cầu từ khách${openRequests ? ` (${openRequests})` : ""}`}</AxButtonLink>{canManage && <AxButtonLink href="/admin/service-jobs/types">Loại dịch vụ</AxButtonLink>}{create}</>} />
    <p className="hx-muted" style={{ margin: "-8px 0 16px" }}>Chở hàng theo chuyến, máy theo giờ, bốc xếp theo công. Chưa biết số lượng thì để trống: thợ bấm số thực tế khi hoàn tất, văn phòng xác minh và ghi công nợ.</p>
    <ActionNotice notice={notice} error={error} />
    <div className="sx-legacy" style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div className="hx-side">
        <AutoFilterForm className="hx-card hx-pad sx-filters" aria-label="Bộ lọc đơn dịch vụ">
          <label className="hx-label">Tìm kiếm<input className="hx-in" type="search" name="q" defaultValue={q} placeholder="Mã, khách, công trình, dịch vụ, người làm" style={{ width: "100%" }} /></label>
          <ListFilterGroup key={stateFilter} legend="Trạng thái" name="state" value={stateFilter} options={filters} />
          {isFiltered && <Link href="/admin/service-jobs" style={{ color: "var(--hx-blue-t)", fontWeight: 600 }}>Xóa lọc</Link>}
        </AutoFilterForm>
      </div>
      <section className="hx-card" style={{ flex: 1, minWidth: 0, overflow: "hidden", boxShadow: "var(--sh-2)" }} aria-label="Đơn dịch vụ">
        <div className="sx-ph"><h2>{rows.length} đơn dịch vụ trên trang này</h2><span className="hx-muted">25 / trang</span></div>
        <div className="hx-th" style={{ gridTemplateColumns: TEMPLATE }}><span /><span>Mã</span><span>Khách / công trình</span><span>Dịch vụ</span><span>Lịch</span><span>Số lượng dự kiến</span><span>Người làm</span><span>Trạng thái</span></div>
        {rows.length === 0 ? <div className="hx-empty" role="status"><p>{isFiltered ? "Không có đơn dịch vụ phù hợp bộ lọc." : "Chưa có đơn dịch vụ. Bấm “+ Tạo đơn dịch vụ”."}</p></div> : rows.map((job) => {
          const href = `/admin/service-jobs/${job.id}`;
          return <AxExpandRow key={job.id} id={job.id} label={job.number} template={TEMPLATE} muted={job.state === "CANCELLED"}
            cells={[
              <Link key="n" href={href} className="hx-code" tabIndex={-1}>{job.number}</Link>,
              <Link key="c" href={href}><AxPerson name={job.customer} sub={job.site} /></Link>,
              <span key="s">{job.serviceType}</span>, <span key="t">{job.schedule}</span>, <span key="p">{job.planned}</span>,
              <span key="o">{job.operator ?? "Chưa giao"}</span>,
              <AxStatus key="st" tone={toneOf(job.stateTone)}>{job.stateLabel}</AxStatus>,
            ]}
            detail={<>
              <div><h4>Công việc</h4><ul className="sx-quick-list"><li>{job.serviceType} · {job.planned}</li>{job.description && <li>{job.description}</li>}</ul></div>
              <div><h4>Lịch và người làm</h4><ul className="sx-quick-list"><li>{job.schedule}{job.scheduleEnd ? ` – ${job.scheduleEnd}` : ""}</li><li>{job.operator ?? "Chưa giao thợ"}</li></ul></div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}><AxButtonLink href={href} kind="primary" small>Mở đơn dịch vụ</AxButtonLink></div></>} />;
        })}
        <ListPager page={page} total={total} hasNext={hasNext} params={{ q, state: stateFilter }} />
      </section>
    </div>
  </>;
}
