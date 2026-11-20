import Link from "next/link";
import { ArrowRight, ChartColumn, ChevronRight, Clock, CreditCard, MapPin, MessageSquare, Plus, RefreshCw, Truck, Wrench } from "lucide-react";
import { Avatar } from "@astryxdesign/core/Avatar";
import { AxStatus } from "@/components/astryx/ax-kit";
import { CxHead, CxLink, CxNotice, orderTone, serviceTone } from "@/components/astryx/customer-kit";
import type { QuickReorder } from "@/modules/portal/quick-reorder";

export type AxHomeOrder = { id: string; number: string; site: string; date: string; label: string; total?: string };
export type AxHomeData = {
  notice?: string;
  customerName: string; customerCode: string;
  canOrder: boolean;
  /** Đơn đang đi tiếp (D29): nhãn trạng thái, giờ xe tới nếu có, các bước tiến trình. */
  tracked: null | { id: string; number: string; stateLabel: string; eta: string | null; headline: string; where: string; percent: number; steps: { label: string; state: "done" | "current" | "todo" }[] };
  service: null | { id: string; title: string; sub: string; stageLabel: string; tone: "warm" | "done" | "stopped" | "active"; openCount: number };
  yesterday: null | { kinds: number; summary: string; total?: string; href: string };
  waiting: number;
  quotation: null | { id: string; number: string; stateLabel: string; canRespond: boolean };
  reorders: (QuickReorder & { dateText: string })[];
  debt: null | { outstanding: string; overdue: string | null };
  recent: AxHomeOrder[];
  orderCount: number;
};

/** Trang chủ cổng khách kiểu Astryx: cùng dữ liệu với bản Classic (UX-FB18-001), dựng lại theo concept "Khách · Trang chủ". */
export function AstryxCustomerHome({ data }: { data: AxHomeData }) {
  const { tracked, service, yesterday } = data;
  return <div className="cx-page">
    <CxNotice status="success">{data.notice}</CxNotice>
    <div className="cx-headrow">
      <div>
        <span className="cx-code" style={{ fontSize: 13, background: "#E6F0FB", padding: "3px 10px", borderRadius: 8, display: "inline-block" }}>{data.customerCode}</span>
        <h1 className="cx-title" style={{ margin: "6px 0 2px" }}>{data.customerName}</h1>
        <div className="cx-sub">Hiền Xa · Vật liệu xây dựng</div>
      </div>
      <div className="cx-actions"><Avatar name={data.customerName} size={48} shape="rounded" />
        {data.canOrder && <CxLink href="/customer/orders/new" kind="commerce" lg><Plus className="hx-ico" aria-hidden />Đặt hàng mới</CxLink>}</div>
    </div>

    <div className="cx-cols">
      <div className="cx-col">
        {tracked && <Link className="cx-hero" href={`/customer/orders/${tracked.id}`} aria-label={`Đơn ${tracked.number} ${tracked.stateLabel}`}>
          <span className="top"><span className="live"><i aria-hidden />{tracked.stateLabel}</span><span className="code">{tracked.number}</span></span>
          <div className="lbl"><Truck aria-hidden size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />{tracked.eta ? "Xe tới khoảng" : "Tiến độ đơn"}</div>
          {tracked.eta ? <div className="big">{tracked.eta}</div> : <div className="big text">{tracked.headline}</div>}
          <div className="where"><MapPin aria-hidden size={16} style={{ verticalAlign: "-3px", marginRight: 4 }} />{tracked.where}</div>
          <div className="bar" aria-hidden><span style={{ width: `${tracked.percent}%` }} /></div>
          <div className="steps">{tracked.steps.map((step) => <span key={step.label} className={step.state === "current" ? "on" : undefined}>{step.label}</span>)}</div>
        </Link>}
        {service && <Link className="cx-card" href={`/customer/services/${service.id}`} aria-label={`Yêu cầu dịch vụ ${service.title}, ${service.stageLabel}`} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="cx-tile"><Wrench className="hx-ico" aria-hidden /></span>
          <span style={{ flex: 1, minWidth: 0 }}><small className="cx-muted" style={{ display: "block", fontSize: 13, fontWeight: 700 }}>YÊU CẦU DỊCH VỤ{service.openCount > 1 ? ` · ${service.openCount} ĐANG XỬ LÝ` : ""}</small>
            <strong style={{ display: "block", fontSize: 16 }}>{service.title}</strong><small className="cx-muted" style={{ fontSize: 13.5 }}>{service.sub}</small></span>
          <AxStatus tone={serviceTone(service.tone)}>{service.stageLabel}</AxStatus>
        </Link>}
        {data.waiting > 0 && <Link className="cx-note" href="/customer/orders" role="status"><Clock className="hx-ico" aria-hidden /><span>{data.waiting} đơn đang chờ cửa hàng duyệt. Xem đơn</span><ChevronRight className="hx-ico" aria-hidden /></Link>}
        {data.quotation && <section className="cx-card" aria-label="Báo giá">
          <AxStatus tone="info">{`Báo giá · ${data.quotation.stateLabel}`}</AxStatus>
          <h2 className="cx-sec" style={{ margin: "8px 0" }}>{data.quotation.number}</h2>
          <CxLink href={`/customer/quotations/${data.quotation.id}`} kind="primary">{data.quotation.canRespond ? "Xem và chấp nhận" : "Xem báo giá"}</CxLink>
        </section>}

        {data.canOrder && data.reorders.length > 0 && <section aria-labelledby="reorder">
          <div className="cx-cardhead" style={{ padding: "0 2px 10px" }}><h2 className="cx-sec" id="reorder">Đặt lại nhanh</h2><Link className="cx-link" href="/customer/orders">Tất cả đơn</Link></div>
          <div className="cx-reorders">{data.reorders.map((card) => <article key={card.key} className="cx-card cx-reorder">
            <small>{card.kind === "service" ? "Dịch vụ" : "Hàng hóa"} · {card.dateText}{card.site ? ` · ${card.site}` : ""}</small>
            <strong>{card.title}</strong>
            <Link className="cx-btn" href={card.href}><RefreshCw className="hx-ico" aria-hidden />Đặt lại</Link>
          </article>)}</div>
        </section>}

        <section className="cx-card cx-table cx-recent" aria-labelledby="recent-orders">
          <div className="cx-cardhead" style={{ padding: "16px 16px 12px" }}><h2 className="cx-sec" id="recent-orders">Đơn gần đây</h2><Link className="cx-link" href="/customer/orders">Xem tất cả</Link></div>
          {data.recent.length ? <>
            <div className="cx-th r" aria-hidden><span>Mã đơn</span><span>Công trình</span><span>Ngày đặt</span><span>Trạng thái</span><span style={{ textAlign: "right" }}>Tổng tiền</span><span /></div>
            {data.recent.map((order) => <Link key={order.id} className="cx-tr" href={`/customer/orders/${order.id}`}>
              <span className="c-code cx-code">{order.number}</span>
              <span className="c-site">{order.site}</span>
              <span className="c-date">{order.date}</span>
              <span className="c-state"><AxStatus tone={orderTone(order.label)}>{order.label}</AxStatus></span>
              <span className="c-num">{order.total ?? ""}</span>
              <ChevronRight className="hx-ico s c-go" aria-hidden />
            </Link>)}
          </> : <p className="cx-empty">Chưa có đơn hàng.</p>}
          <div style={{ padding: "0 16px 12px" }}><Link className="cx-link" href="/customer/orders">Xem tiến trình giao nhận<ArrowRight className="hx-ico s" aria-hidden style={{ marginLeft: 6 }} /></Link></div>
        </section>
      </div>

      <div className="cx-col">
        {data.debt && <Link className="cx-card cx-debtrow" href="/customer/debts">
          <span className="cx-tile"><CreditCard className="hx-ico" aria-hidden /></span>
          <span style={{ flex: 1, minWidth: 0 }}><small>Công nợ còn lại</small><strong>{data.debt.outstanding}</strong></span>
          {data.debt.overdue && <AxStatus tone="error">{`Quá hạn ${data.debt.overdue}`}</AxStatus>}
          <ChevronRight className="hx-ico s" aria-hidden style={{ color: "var(--hx-ink-3)" }} />
        </Link>}
        {yesterday && <Link className="cx-card" href={yesterday.href} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="cx-tile"><ChartColumn className="hx-ico" aria-hidden /></span>
          <span style={{ flex: 1, minWidth: 0 }}><strong style={{ display: "block", fontSize: 15 }}>Hôm qua anh/chị đặt {yesterday.kinds} món</strong>
            <small className="cx-muted" style={{ display: "block", fontSize: 13.5 }}>{yesterday.summary}{yesterday.total ? ` · Tổng ${yesterday.total}` : ""}</small>
            <small style={{ color: "var(--hx-blue-t)", fontWeight: 700, fontSize: 14 }}>Xem báo cáo</small></span>
          <ChevronRight className="hx-ico s" aria-hidden style={{ color: "var(--hx-ink-3)" }} />
        </Link>}
        <section className="cx-card" aria-label="Cần hỗ trợ">
          <div className="cx-hint" style={{ fontWeight: 600 }}>Cần hỗ trợ?</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0 12px" }}><Avatar name="Văn phòng Hiền Xa" size={48} /><b style={{ fontSize: 15 }}>Văn phòng Hiền Xa</b></div>
          <CxLink href="/customer/messages" kind="quiet" block><MessageSquare className="hx-ico" aria-hidden />Nhắn tin cho văn phòng</CxLink>
        </section>
      </div>
    </div>
  </div>;
}
