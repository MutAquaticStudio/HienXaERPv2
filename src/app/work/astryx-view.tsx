import Link from "next/link";
import { ChevronRight, Clock3, Navigation, Phone, PlusCircle, UsersRound } from "lucide-react";
import { Avatar } from "@astryxdesign/core/Avatar";
import { PushToggle } from "@/components/notifications/push-toggle";
import { WxChip, WxEmpty, WxNotice, WxSteps } from "@/components/astryx/work-kit";
import { ClockPanel } from "@/modules/attendance/forms";
import { directionsHref, jobStateLabel, telHref } from "@/modules/portal/presentation";
import type { WorkerJob } from "@/modules/portal/types";

export type AxHomeShift = { heading: string; sub: string; clockedIn: boolean; requireLocation: boolean; canClock: boolean };
export type AxHomeDispatch = { summary: string; declined: number; short: number };

const zone = { timeZone: "Asia/Ho_Chi_Minh" } as const;
const timeOf = (value?: string) => value ? new Intl.DateTimeFormat("vi-VN", { ...zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "—";
const place = (job: WorkerJob) => job.address ?? job.site_name ?? "Địa điểm đang cập nhật";

function NextJob({ job }: { job: WorkerJob }) {
  return <li><Link href={`/work/jobs/${job.id}`}>
    <span className="t">{timeOf(job.scheduled_start)}</span>
    <span className="m"><b>{job.customer_name ?? job.title ?? job.number}</b><small>{place(job)} · {jobStateLabel(job)}</small></span>
    <ChevronRight aria-hidden size={18} color="var(--portal-muted)" />
  </Link></li>;
}

/** "Hôm nay" kiểu Astryx: lời chào, thẻ ca, thẻ xanh việc đang làm 4 bước (Gọi / Chỉ đường / Mở việc), Tiếp theo hôm nay, Sắp tới. */
export function AstryxWorkHomeView({ notice, dateLabel, name, shift, current, rest, later, dispatch, poolHint }: {
  notice?: string; dateLabel: string; name: string; shift: AxHomeShift | null;
  current?: WorkerJob; rest: WorkerJob[]; later: WorkerJob[]; dispatch: AxHomeDispatch | null; poolHint: string | null;
}) {
  return <div className="wx-page cols">
    <div className="wx-span" style={{ display: "grid", gap: 14 }}>
      {notice === "work-unavailable" && <WxNotice status="warning" title="Công việc không còn mở được">Công việc đã chuyển người phụ trách hoặc bạn không còn quyền mở. Hãy dùng danh sách công việc hiện tại hoặc liên hệ điều phối.</WxNotice>}
      {notice === "work-declined" && <WxNotice status="success" title="Đã từ chối việc">Điều phối sẽ giao cho người khác.</WxNotice>}
      {notice === "delivery-reported" && <WxNotice status="success" title="Đã báo giao hàng kèm ảnh">{rest.length || current ? "Việc kế tiếp ở bên dưới." : undefined}</WxNotice>}
      <header className="wx-greet">
        <Avatar name={name} size={48} />
        <div><p>{dateLabel}</p><h1>Chào {name}</h1></div>
      </header>
    </div>

    <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
      {shift && <section className="wx-card wx-shift" aria-label="Ca làm hôm nay">
        <span className="wx-ico"><Clock3 aria-hidden size={20} /></span>
        <div><strong>{shift.heading}</strong><span className="wx-sub">{shift.sub}</span></div>
        {shift.canClock && <div><ClockPanel clockedIn={shift.clockedIn} requireLocation={shift.requireLocation} compact /></div>}
      </section>}

      {current ? <section className="wx-hero" aria-label="Việc đang làm">
        <div className="wx-hero-top"><span>{jobStateLabel(current).toLocaleUpperCase("vi-VN")} · {current.number}</span>{current.scheduled_start && <span>Hẹn {timeOf(current.scheduled_start)}</span>}</div>
        <div><h2>{current.customer_name ?? current.title ?? current.number}</h2><p>{place(current)}</p></div>
        <WxSteps job={current} />
        <div className="wx-hero-acts">
          {current.receiver_phone ? <a className="wx-hbtn" href={telHref(current.receiver_phone)}><Phone aria-hidden size={19} />Gọi</a>
            : <span className="wx-hbtn" aria-disabled="true"><Phone aria-hidden size={19} />Gọi</span>}
          {current.address ? <a className="wx-hbtn" href={directionsHref(current.address)} target="_blank" rel="noreferrer"><Navigation aria-hidden size={19} />Chỉ đường</a>
            : <span className="wx-hbtn" aria-disabled="true"><Navigation aria-hidden size={19} />Chỉ đường</span>}
          <Link className="wx-hbtn main" href={`/work/jobs/${current.id}`}>Mở việc</Link>
        </div>
      </section> : <section className="wx-card"><WxEmpty title="Hôm nay chưa có việc">Việc mới được phân sẽ hiện ở đây. Có thể nhận thêm ở mục Nhận việc.</WxEmpty></section>}
    </div>

    <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
      {rest.length > 0 && <section className="wx-card" aria-labelledby="next-today">
        <div className="wx-card-head"><h2 id="next-today">Tiếp theo hôm nay</h2><span className="wx-hint">{rest.length} việc</span></div>
        <ul className="wx-tl">{rest.map((job) => <NextJob key={job.id} job={job} />)}</ul>
      </section>}
      {later.length > 0 && <section className="wx-card" aria-labelledby="later">
        <div className="wx-card-head"><h2 id="later">Sắp tới</h2><span className="wx-hint">{later.length} việc</span></div>
        <ul className="wx-tl">{later.map((job) => <NextJob key={job.id} job={job} />)}</ul>
      </section>}

      {/* D85: thợ chính thấy cả ngày của chi nhánh ở đây, thay cho gợi ý "Nhận việc". */}
      {dispatch && <Link className="wx-link-card accent" href="/work/dispatch" aria-label={`Điều phối hôm nay: ${dispatch.summary}`}>
        <span className="wx-ico"><UsersRound aria-hidden size={20} /></span>
        <span><strong>Điều phối hôm nay</strong><small>{dispatch.summary}</small>
          {(dispatch.declined > 0 || dispatch.short > 0) && <span className="wx-chips" style={{ marginTop: 6 }}>
            {dispatch.declined > 0 && <WxChip tone="w">{dispatch.declined} thợ từ chối</WxChip>}
            {dispatch.short > 0 && <WxChip tone="w">{dispatch.short} giao thiếu</WxChip>}
          </span>}</span>
        <ChevronRight aria-hidden size={18} color="var(--portal-muted)" />
      </Link>}
      {!dispatch && poolHint && <Link className="wx-link-card" href="/work/pool"><span className="wx-ico w"><PlusCircle aria-hidden size={20} /></span><span><strong>{poolHint}</strong></span><span className="wx-chip i">Xem</span></Link>}

      <PushToggle prompt={{ title: "Báo việc mới về điện thoại", className: "wx-card",
        text: "Bật để điện thoại báo ngay khi có việc giao cho bạn hoặc phiếu giao chờ người nhận." }} />
    </div>
  </div>;
}
