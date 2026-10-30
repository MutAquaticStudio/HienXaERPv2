// FB17: page-shaped loading screens. Each mirrors the layout of the screen being opened (list, detail, form, overview,
// phone portal) so nothing jumps when the data arrives. They appear after a short delay (fast pages never flash them),
// rows fade in one after another and a soft light sweeps across them — see `.skeleton*` in globals.css.
import type { CSSProperties } from "react";

/** Bar widths that vary like real text, so the page does not look like a grid of identical blocks. */
const WIDTHS = ["72%", "54%", "86%", "61%", "78%", "47%", "68%", "83%", "57%", "74%"];
const width = (index: number) => WIDTHS[index % WIDTHS.length];
const bar = (style: CSSProperties) => <span className="skeleton" style={style} />;
const order = (index: number) => ({ "--i": index }) as CSSProperties;

function Heading({ actions = 0 }: { actions?: number }) {
  return <div className="skeleton-heading">
    <div>{bar({ width: 90, height: 10 })}{bar({ width: 240, height: 24, marginTop: 10 })}{bar({ width: "min(420px, 70vw)", height: 12, marginTop: 10 })}</div>
    {actions > 0 && <div className="skeleton-actions">{Array.from({ length: actions }, (_, index) => bar({ width: index ? 128 : 110, height: 38, borderRadius: 10 }))}</div>}
  </div>;
}

function Shell({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="skeleton-page" role="status" aria-live="polite" aria-label={label}><span className="sr-only">{label}</span>{children}</div>;
}

/** List screens: filters on the left, a table of rows. */
export function ListSkeleton({ label = "Đang tải danh sách" }: { label?: string }) {
  return <Shell label={label}>
    <Heading actions={2} />
    <div className="list-layout">
      <div className="card card-pad list-filters skeleton-filters">
        {bar({ width: 70, height: 11 })}{bar({ height: 38, borderRadius: 10 })}
        {bar({ width: 100, height: 11, marginTop: 8 })}
        {[0, 1, 2, 3, 4].map((index) => <div className="skeleton-chip" key={index} style={order(index)}>{bar({ width: 16, height: 16, borderRadius: 99 })}{bar({ width: width(index + 3), height: 11 })}</div>)}
      </div>
      <div className="card list-main">
        <div className="section-head">{bar({ width: 150, height: 15 })}{bar({ width: 70, height: 22, borderRadius: 6 })}</div>
        {Array.from({ length: 8 }, (_, index) => <div className="skeleton-row skeleton-list-row" key={index} style={order(index)}>
          {bar({ width: 14, height: 14, borderRadius: 4 })}
          <div>{bar({ width: "82%", height: 12 })}{bar({ width: "48%", height: 9, marginTop: 7 })}</div>
          <div>{bar({ width: width(index), height: 12 })}{bar({ width: width(index + 4), height: 9, marginTop: 7 })}</div>
          {bar({ width: "70%", height: 12, justifySelf: "end" })}
          {bar({ width: 84, height: 22, borderRadius: 99 })}
          {bar({ width: width(index + 2), height: 12 })}
        </div>)}
      </div>
    </div>
  </Shell>;
}

/** Detail screens: heading, three status tiles, information + lines on the left, actions on the right. */
export function DetailSkeleton({ label = "Đang tải chi tiết" }: { label?: string }) {
  return <Shell label={label}>
    <Heading actions={2} />
    <div className="skeleton-tiles">{[0, 1, 2].map((index) => <div className="card card-pad" key={index} style={order(index)}>{bar({ width: "40%", height: 10 })}{bar({ width: "64%", height: 20, marginTop: 10 })}</div>)}</div>
    <div className="skeleton-two">
      <div className="card card-pad">
        {bar({ width: 180, height: 15 })}
        <div className="skeleton-pairs">{[0, 1, 2, 3].map((index) => <div key={index} style={order(index)}>{bar({ width: "35%", height: 10 })}{bar({ width: width(index), height: 13, marginTop: 8 })}</div>)}</div>
        {Array.from({ length: 4 }, (_, index) => <div className="skeleton-row skeleton-line-row" key={index} style={order(index + 4)}>
          {bar({ width: width(index + 1), height: 12 })}{bar({ width: "60%", height: 12 })}{bar({ width: "70%", height: 12, justifySelf: "end" })}
        </div>)}
      </div>
      <div className="card card-pad skeleton-side">
        {bar({ width: 140, height: 15 })}
        {[0, 1, 2].map((index) => <span key={index} className="skeleton" style={{ ...order(index), height: 40, borderRadius: 10 }} />)}
      </div>
    </div>
  </Shell>;
}

/** Create / edit screens: the goods editor and the information panel. */
export function FormSkeleton({ label = "Đang mở biểu mẫu" }: { label?: string }) {
  return <Shell label={label}>
    <Heading />
    <div className="skeleton-two skeleton-form">
      <div className="card">
        <div className="skeleton-search">{bar({ height: 42, borderRadius: 10 })}</div>
        {Array.from({ length: 4 }, (_, index) => <div className="skeleton-row skeleton-line-row" key={index} style={order(index)}>
          {bar({ width: width(index), height: 13 })}{bar({ width: 96, height: 32, borderRadius: 8 })}{bar({ width: "70%", height: 13, justifySelf: "end" })}
        </div>)}
      </div>
      <div className="card card-pad skeleton-side">
        {[0, 1, 2].map((index) => <div key={index} style={order(index)}>{bar({ width: "38%", height: 10 })}{bar({ height: 40, borderRadius: 10, marginTop: 8 })}</div>)}
        {bar({ height: 44, borderRadius: 10, marginTop: 8 })}
      </div>
    </div>
  </Shell>;
}

/** Overview and reports: figures, a chart, then a table. */
export function DashboardSkeleton({ label = "Đang tổng hợp số liệu" }: { label?: string }) {
  return <Shell label={label}>
    <Heading actions={1} />
    <div className="metric-grid">{[0, 1, 2, 3].map((index) => <div className="card metric-card" key={index} style={order(index)}>{bar({ width: "46%", height: 11 })}{bar({ width: "72%", height: 26, marginTop: 12 })}{bar({ width: "30%", height: 9, marginTop: 10 })}</div>)}</div>
    <div className="card card-pad">
      {bar({ width: 200, height: 15 })}
      <div className="skeleton-chart">{[38, 62, 48, 80, 56, 70, 44, 88, 64, 52, 76, 60].map((height, index) => <span key={index} className="skeleton" style={{ ...order(index), height: `${height}%` }} />)}</div>
    </div>
  </Shell>;
}

/** Worker and customer portals on a phone: a stack of cards. */
export function CardsSkeleton({ label = "Đang tải" }: { label?: string }) {
  return <Shell label={label}>
    <div>{bar({ width: 110, height: 10 })}{bar({ width: 200, height: 22, marginTop: 10 })}</div>
    {[0, 1, 2, 3].map((index) => <div className="card card-pad skeleton-card" key={index} style={order(index)}>
      <div className="skeleton-card-head">{bar({ width: 40, height: 40, borderRadius: 12 })}<div>{bar({ width: width(index), height: 13 })}{bar({ width: width(index + 5), height: 10, marginTop: 8 })}</div></div>
      {bar({ width: "92%", height: 10, marginTop: 14 })}{bar({ width: "64%", height: 10, marginTop: 8 })}
    </div>)}
  </Shell>;
}

/** Sign-in and registration: one centred card with its fields. */
export function AuthSkeleton({ label = "Đang mở" }: { label?: string }) {
  return <div className="skeleton-auth"><Shell label={label}>
    <div className="card card-pad skeleton-side">
      {bar({ width: 56, height: 56, borderRadius: 16, justifySelf: "center" })}
      {bar({ width: "60%", height: 20, justifySelf: "center" })}
      {[0, 1].map((index) => <div key={index} style={order(index)}>{bar({ width: "34%", height: 10 })}{bar({ height: 44, borderRadius: 10, marginTop: 8 })}</div>)}
      {bar({ height: 46, borderRadius: 10, marginTop: 6 })}
    </div>
  </Shell></div>;
}
