import Link from "next/link";
import type { ReactNode } from "react";
import { AxButtonLink, AxPageHead } from "@/components/astryx/ax-kit";
import { N4Card, N4Delta, N4Meter, N4Seg, N4Stat } from "@/components/astryx/n4-kit";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatBusinessDate } from "@/lib/core/business-time";
import { shortVnd } from "@/modules/dashboard/format";
import type { TodayItem } from "@/modules/dashboard/today";

/** Tổng quan kiểu Astryx (D56): việc cần xử lý đặt trước, rồi số chính của kỳ, Thu/Chi, giao hàng, nhóm hàng và công nợ. Chỉ trình bày. */

export type AxFigure = { key: string; label: string; value: bigint | null; note?: ReactNode; qualityText?: string | null; tone?: "pos" | "neg"; lead?: boolean };

export function AxDashboardHead({ subtitle, quick, filters, filterCount, requestId }: {
  subtitle: string; quick: { href: string; label: string; active: boolean }[]; filters: ReactNode; filterCount: number; requestId?: string;
}) {
  return <>
    <div data-uat-dashboard-request={requestId ?? ""}>
      <AxPageHead crumbs={["Tổng quan"]} title="Tổng quan" actions={<N4Seg label="Kỳ số liệu" items={quick} />} />
    </div>
    <p className="hx-muted" style={{ margin: "-8px 0 16px" }}>{subtitle}</p>
    <details className="hx-card" open={filterCount > 0} style={{ marginBottom: 16 }}>
      <summary className="hx-ch" style={{ cursor: "pointer", fontWeight: 600 }}>Lọc · khách, công trình, nhân viên{filterCount ? ` (${filterCount})` : ""}</summary>
      <div style={{ padding: "0 16px 16px" }}>{filters}</div>
    </details>
  </>;
}

/** "Cần xử lý hôm nay": mỗi việc là một ô có số lượng, tên việc, chi tiết và một nút Mở dẫn tới màn xử lý. */
export function AxTodayCard({ items }: { items: TodayItem[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return <N4Card id="dash-today" title="Cần xử lý hôm nay" tone={total ? "warn" : undefined} pad={false} right={total > 0 ? <b>{total} việc</b> : undefined}>
    {items.length === 0 ? <p className="hx-muted" style={{ padding: 16, margin: 0 }}>Không còn việc nào cần xử lý. Việc mới (phiếu chờ phân xe, tiền chưa ghi, đơn chờ duyệt…) sẽ hiện ở đây.</p>
      : <div className="n4-todo">{items.map((item) => <div key={item.key}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}><span className={`n4-count ${item.tone}`} aria-hidden>{item.count}</span><b style={{ lineHeight: 1.3 }}>{item.title}</b></div>
        <div className="hx-muted" style={{ minHeight: 38 }}>{item.detail}</div>
        <div><AxButtonLink href={item.href} small>{item.action}</AxButtonLink></div></div>)}</div>}
  </N4Card>;
}

/** Bốn số chính của kỳ. Doanh thu/lợi nhuận màu xanh lá khi có số, chi phí màu đỏ; không có quyền thì bỏ thẻ. */
export function AxFigures({ figures, scope, ready }: { figures: AxFigure[]; scope: string; ready: boolean }) {
  return <section aria-label="Chỉ số chính" data-uat-dashboard-kpi={ready ? "ready" : "error"} style={{ display: "grid", gap: 8 }}>
    <div className="n4-grid c4">{figures.map((figure) => <N4Stat key={figure.key} lead={figure.lead} label={figure.label} tone={figure.value === null ? undefined : figure.tone}
      title={figure.value === null ? undefined : formatVnd(vnd(figure.value.toString()))} value={figure.value === null ? "—" : shortVnd(figure.value)}
      note={figure.qualityText ?? figure.note} />)}</div>
    <p className="hx-muted" style={{ margin: 0, fontSize: 13.5 }} data-recording-scope="RECORDED_TRANSACTIONS">{scope}</p>
  </section>;
}

export function AxChange({ percent, up, risingIsBad = false }: { percent: number | null; up?: boolean; risingIsBad?: boolean }) {
  if (percent === null) return <span className="hx-muted">Chưa có kỳ trước để so</span>;
  const good = percent === 0 ? null : up === !risingIsBad;
  return <N4Delta good={good} text={`${up ? "▲ Tăng" : "▼ Giảm"} ${percent.toLocaleString("vi-VN")}% so với kỳ trước`} />;
}

export function AxChartCard({ step, steps, children, failed, tooLong }: { step: string; steps: { href: string; label: string; active: boolean }[]; children: ReactNode; failed: boolean; tooLong?: boolean }) {
  return <N4Card id="dash-chart" title={`Thu và chi theo ${step}`} right={<N4Seg label="Độ chia biểu đồ" items={steps} />}>
    <div data-uat-dashboard-chart={failed ? "error" : "ready"}>{failed ? <p className="hx-muted">{tooLong ? "Kỳ quá dài để vẽ biểu đồ. Hãy chọn độ chia khác." : "Chưa tải được biểu đồ. Thử lại."}</p> : children}</div>
  </N4Card>;
}

export type AxSegment = { key: string; label: string; value: number | bigint; display: string };
const percentOf = (value: number | bigint, total: number | bigint) => (Number(total) > 0 ? (Number(value) * 100) / Number(total) : 0);

export function AxDeliveryCard({ deliveries }: { deliveries: { waiting: number; assigned: number; onTheWay: number; done: number; total: number } | null }) {
  const rows = deliveries ? [["Chờ phân giao", deliveries.waiting, "warning"], ["Đã phân giao", deliveries.assigned, "neutral"], ["Đang giao", deliveries.onTheWay, "accent"], ["Đã giao", deliveries.done, "success"]] as const : [];
  return <N4Card id="dash-delivery" title="Giao hàng hôm nay" right={<Link href="/admin/dispatch">Điều phối</Link>}>
    {deliveries === null ? <p className="hx-muted">Chưa tải được phiếu giao hôm nay.</p> : <div style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0 }}><b style={{ fontSize: 22 }}>{deliveries.total}</b> phiếu{deliveries.done ? ` · ${deliveries.done} đã giao` : ""}</p>
      {rows.map(([label, value, variant]) => <N4Meter key={label} label={label} value={value} percent={percentOf(value, deliveries.total)} variant={variant} />)}</div>}
  </N4Card>;
}

export function AxGroupsCard({ groups, reportHref }: { groups: { name: string; amountVnd: bigint; share: number }[] | null; reportHref: string }) {
  const largest = groups?.[0]?.amountVnd ?? 0n;
  return <N4Card id="dash-groups" title="Doanh thu theo nhóm hàng" right={<Link href={reportHref}>Báo cáo</Link>}>
    {groups === null ? <p className="hx-muted">Chưa tải được doanh thu theo nhóm hàng.</p> : !groups.length ? <p className="hx-muted">Chưa có hàng giao xong trong kỳ.</p>
      : <div style={{ display: "grid", gap: 12 }}>{groups.map((group) => <N4Meter key={group.name} label={group.name} display={`${shortVnd(group.amountVnd)} · ${group.share.toLocaleString("vi-VN")}%`} percent={largest > 0n ? percentOf(group.amountVnd, largest) : 0} />)}</div>}
  </N4Card>;
}

export function AxAgingCard({ aging }: { aging: { totalVnd: bigint; notDueVnd: bigint; late30Vnd: bigint; late60Vnd: bigint; late90Vnd: bigint; customers: number } | null }) {
  const rows = aging ? [["Chưa đến hạn", aging.notDueVnd, "neutral"], ["Quá hạn 1–30 ngày", aging.late30Vnd, "warning"], ["31–60 ngày", aging.late60Vnd, "warning"], ["Trên 60 ngày", aging.late90Vnd, "error"]] as const : [];
  return <N4Card id="dash-aging" title="Khách đang nợ" right={<Link href="/admin/receivables">Công nợ</Link>}>
    {aging === null ? <p className="hx-muted">Chưa tải được công nợ khách.</p> : aging.totalVnd === 0n ? <p className="hx-muted">Không có khách còn nợ.</p> : <div style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0 }}><b style={{ fontSize: 22 }}>{shortVnd(aging.totalVnd)}</b> · {aging.customers} khách</p>
      {rows.map(([label, value, variant]) => <N4Meter key={label} label={label} display={shortVnd(value)} percent={percentOf(value, aging.totalVnd)} variant={variant} />)}
      <p className="hx-muted" style={{ margin: 0, fontSize: 13.5 }}>Toàn chi nhánh, tính đến hôm nay.</p></div>}
  </N4Card>;
}

export type AxDebt = { id: string; name: string; sub: string; amount: string; late: boolean; href: string };
export function AxDebtorsCard({ items, allHref, canAll }: { items: AxDebt[]; allHref: string; canAll: boolean }) {
  return <N4Card id="dash-debtors" title="Khách / công trình nợ nhiều nhất" pad={false} right={canAll ? <Link href={allHref}>Tất cả</Link> : undefined}>
    {items.length === 0 ? <p className="hx-muted" style={{ padding: 16, margin: 0 }}>Không có khoản mở hoặc không có quyền xem.</p>
      : <ul className="n4-list">{items.map((item) => <li key={item.id}><Link href={item.href} style={{ flex: 1, minWidth: 0 }}><b>{item.name}</b><small>{item.sub}{item.late ? " · quá hạn" : ""}</small></Link><b className={`hx-num${item.late ? " hx-neg" : ""}`}>{item.amount}</b></li>)}</ul>}
    <p className="hx-muted" style={{ margin: 0, padding: "0 16px 12px", fontSize: 13.5 }}>Cùng thời điểm chốt và bộ lọc với các chỉ số phía trên.</p>
  </N4Card>;
}

export type AxMoneyTile = { key: string; label: string; value: string; note?: string | null };
export function AxMoneyCard({ tiles, balancesFailed, payables, filtered, canCash }: { tiles: AxMoneyTile[]; balancesFailed: boolean; payables: AxDebt[]; filtered: boolean; canCash: boolean }) {
  return <N4Card id="dash-money" title="Tiền và nghĩa vụ" right={canCash ? <Link href="/admin/cashbook">Sổ quỹ</Link> : undefined}>
    <div className="n4-grid c2">{balancesFailed && <p className="hx-muted">Chưa tải được số dư quỹ.</p>}
      {tiles.map((tile) => <div key={tile.key}><div className="hx-label">{tile.label}</div><div style={{ fontSize: 19, fontWeight: 700 }} className="hx-num">{tile.value}</div>{tile.note && <small className="hx-muted">{tile.note}</small>}</div>)}</div>
    {filtered ? <p className="hx-muted" style={{ fontSize: 13.5 }}>Công nợ nhà cung cấp không áp dụng bộ lọc khách hàng, công trình hoặc nhân viên bán hàng.</p>
      : payables.length > 0 && <ul className="n4-list" style={{ marginTop: 12 }}>{payables.map((item) => <li key={item.id} style={{ padding: "10px 0" }}><Link href={item.href} style={{ flex: 1, minWidth: 0 }}><b>{item.name}</b><small>{item.sub}{item.late ? " · quá hạn" : ""}</small></Link><b className={`hx-num${item.late ? " hx-neg" : ""}`}>{item.amount}</b></li>)}</ul>}
  </N4Card>;
}

export const axDebtSub = (due: string, site?: string | null) => `${site === undefined ? "" : `${site ?? "Chưa gắn công trình"} · `}hạn ${formatBusinessDate(due)}`;
