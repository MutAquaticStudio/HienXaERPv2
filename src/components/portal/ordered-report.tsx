import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Download } from "lucide-react";

import { formatBusinessDateTime } from "@/lib/core/business-time";
import { formatQuantity } from "@/lib/core/quantity";
import { PeriodDates, PickDateButton, RetryButton } from "@/components/portal/ordered-report-controls";
import styles from "@/components/portal/ordered-report.module.css";
import portal from "@/components/portal/portal.module.css";
import { formatPortalMoney, sumPortalMoney } from "@/modules/portal/money";
import {
  dayRows, formatDayInput, orderedExportHref, orderedReportHref, periodPresets, remainingView, reportOrderStateLabel, shortDay, weekdayDay,
  type ResolvedPeriod,
} from "@/modules/portal/ordered-report";
import type { OrderedReport, OrderedReportGood, OrderedReportResult } from "@/modules/portal/ordered-report-schema";

const TONE = { done: styles.done, partial: styles.partial, none: styles.none } as const;

function Goods({ good, showMoney }: { good: OrderedReportGood; showMoney: boolean }) {
  const remaining = remainingView(good);
  const money = showMoney && good.amount_vnd !== undefined;
  return (
    <details className={styles.mrow}>
      <summary className={`${styles.mhit} ${money ? "" : styles.noMoney}`}>
        <span className={styles.mName}>{good.name}</span>
        {money && <span className={`${styles.mAmt} ${styles.amt}`}>{formatPortalMoney(good.amount_vnd)}</span>}
        <ChevronDown className={styles.mChev} aria-hidden size={18} />
        <span className={styles.mStats}>
          <span><small>Đặt</small><b>{formatQuantity(good.ordered_qty)} {good.uom_symbol}</b></span>
          <span><small>Đã giao</small><b>{formatQuantity(good.delivered_qty)}</b></span>
          <span><small>Còn lại</small><b className={TONE[remaining.tone]}>{remaining.text}</b></span>
        </span>
      </summary>
      <p className={styles.srcTitle}>Nằm trong {good.orders.length} đơn</p>
      <ul className={styles.srcList}>
        {good.orders.map((order) => {
          const label = reportOrderStateLabel(order.state);
          const tone = label === "Đã giao" || label === "Hoàn tất" ? styles.pillDone : label === "Chờ duyệt" ? styles.pillWarm : "";
          return <li key={order.order_id}>
            <Link href={`/customer/orders/${order.order_id}`}>
              <span><strong>{order.order_number ?? "Đơn hàng"}</strong><small>Đặt {formatDayInput(order.day)} · {formatQuantity(order.quantity)} {good.uom_symbol}</small></span>
              <span className={`${styles.pill} ${tone}`}>{label}</span>
              <ChevronRight aria-hidden size={16} />
            </Link>
          </li>;
        })}
      </ul>
    </details>
  );
}

function goodsTotal(report: OrderedReport) {
  return report.show_money ? sumPortalMoney(report.goods.map((good) => good.amount_vnd)) : null;
}

/**
 * D98 "Báo cáo hàng đã đặt": the period chips and date boxes, four figures, the goods grouped by kind (tap to see the
 * orders each came from), "Theo ngày" for a period of several days, the day's services and the export buttons.
 * `result` is the whole period; `dayResult` is the one day picked in "Theo ngày" (the goods card then follows it).
 */
export function OrderedReportView({ period, today, result, dayResult }: {
  period: ResolvedPeriod; today: string; result: OrderedReportResult; dayResult: OrderedReportResult | null;
}) {
  const multi = period.from !== period.to;
  const presets = periodPresets(today);
  const active = period.notice ? null : presets.find((preset) => preset.from === period.from && preset.to === period.to)?.key ?? null;
  const summary = multi ? `Kỳ ${formatDayInput(period.from)} – ${formatDayInput(period.to)}` : `Ngày ${formatDayInput(period.from)}`;
  const note = period.notice ? { text: period.notice, bad: true }
    : result.status === "period" ? { text: "Khoảng ngày này chưa xem được. Chọn tối đa 92 ngày mỗi lần.", bad: true }
    : { text: `${summary} · tự áp dụng khi anh/chị chọn xong`, bad: false };

  const head = <>
    <Link className={styles.back} href="/customer/orders"><ChevronLeft aria-hidden size={20} />Đơn hàng</Link>
    <header className={portal.sectionHead}><div><h1>Báo cáo hàng đã đặt</h1><p>Hàng anh/chị đã đặt, cộng theo từng loại trong kỳ.</p></div></header>
    <section className={styles.filterCard} aria-label="Chọn kỳ">
      <div className={styles.chipRow} role="group" aria-label="Chọn nhanh kỳ">
        {presets.map((preset) => <Link key={preset.key} className={styles.chip} href={orderedReportHref(preset)} aria-current={active === preset.key ? "true" : undefined}>{preset.label}</Link>)}
      </div>
      <PeriodDates key={`${period.from}|${period.to}|${period.fromText}|${period.toText}`} from={period.from} to={period.to}
        fromText={period.fromText} toText={period.toText} note={note} />
    </section>
  </>;

  if (result.status === "forbidden") {
    return <div className={styles.rpt}>{head}
      <div className={styles.empty}><strong>Tài khoản này chưa xem được báo cáo.</strong>
        <span>Liên hệ cửa hàng nếu anh/chị cần xem hàng đã đặt.</span></div></div>;
  }
  if (result.status === "period") {
    return <div className={styles.rpt}>{head}<div className={styles.empty}><span className={styles.emptyIcon}><CalendarDays aria-hidden size={24} /></span><strong>Chọn lại khoảng ngày.</strong><PickDateButton /></div></div>;
  }
  if (result.status === "error") {
    return <div className={styles.rpt}>{head}
      <div className={styles.errorBox} role="alert"><p><CircleAlert aria-hidden size={18} /><span>Chưa tải được. <small>Mạng chập chờn hoặc máy chủ bận. Đơn của anh/chị vẫn còn nguyên.</small></span></p><RetryButton /></div></div>;
  }

  const report = result.report;
  if (report.order_count === 0 && report.services.length === 0) {
    return <div className={styles.rpt}>{head}
      <div className={styles.empty}>
        <span className={styles.emptyIcon}><CalendarDays aria-hidden size={24} /></span>
        <strong>Chưa có đơn trong khoảng này.</strong>
        <span>Đơn đặt qua Zalo, điện thoại hay trên app đều hiện ở đây theo ngày đặt.</span>
        <PickDateButton />
      </div>
      {report.cancelled_count > 0 && <p className={styles.cutoff}>{report.cancelled_count} đơn đã hủy, không tính.</p>}
    </div>;
  }

  const money = report.show_money;
  const dayReport = period.day && dayResult?.status === "ok" ? dayResult.report : null;
  const shown = period.day ? dayReport : report;
  const rows = multi ? dayRows(report) : [];
  const total = goodsTotal(report);
  const serviceTotal = money ? sumPortalMoney(report.services.map((service) => service.amount_vnd)) : null;
  const shownTotal = shown ? goodsTotal(shown) : null;
  // The split is told only when it adds up to the database's total; otherwise the card says what it can vouch for.
  const splits = report.services.length > 0 && total !== null && serviceTotal !== null && report.total_vnd === (BigInt(total) + BigInt(serviceTotal)).toString();
  const totalNote = splits ? `hàng ${formatPortalMoney(total)} · dịch vụ ${formatPortalMoney(serviceTotal)}` : report.total_vnd === total ? "tiền hàng" : "";
  const exportPeriod = period.day ? { from: period.day, to: period.day } : { from: period.from, to: period.to };
  const [stampDay, stampTime] = formatBusinessDateTime(report.generated_at).split(" ");

  return (
    <div className={styles.rpt}>
      {head}
      <dl className={styles.kpis} aria-label="Số liệu chính">
        <div className={styles.kpi}><dt>Số đơn</dt><dd><span className={styles.kv}>{report.order_count}</span>
          <span className={styles.kn}>{report.cancelled_count > 0 ? `${report.cancelled_count} đơn đã hủy, không tính` : "không có đơn hủy"}</span></dd></div>
        <div className={styles.kpi}><dt>Số loại hàng</dt><dd><span className={styles.kv}>{report.material_kinds}</span><span className={styles.kn}>gộp theo từng loại hàng</span></dd></div>
        <div className={styles.kpi}><dt>Đã giao</dt><dd><span className={styles.kv}>{report.delivered_kinds}/{report.material_kinds}</span><span className={styles.kn}>loại đã giao đủ</span></dd></div>
        {money && report.total_vnd !== undefined && <div className={styles.kpi}><dt>Tổng tiền</dt><dd><span className={styles.kv}>{formatPortalMoney(report.total_vnd).replace(" ", " ")}</span>
          <span className={styles.kn}>{totalNote}</span></dd></div>}
      </dl>

      {rows.length > 0 && <section className={styles.tcard} aria-labelledby="ordered-days">
        <div className={styles.tHead}><h2 id="ordered-days">Theo ngày</h2><span className={styles.scopeChip}>{rows.length} ngày</span></div>
        <p className={styles.tNote}>Bấm một ngày để chỉ xem hàng của ngày đó.</p>
        {rows.map((row) => {
          const selected = period.day === row.day;
          const detail = [row.orders > 0 ? `${row.orders} đơn` : null, row.services > 0 ? `${row.services} dịch vụ` : null, row.kinds > 0 ? `${row.kinds} loại hàng` : null].filter(Boolean).join(" · ");
          return <Link key={row.day} className={styles.dayRow} aria-current={selected ? "true" : undefined}
            href={orderedReportHref({ from: period.from, to: period.to, day: selected ? null : row.day })}>
            <span><strong>{weekdayDay(row.day)}</strong><small>{detail}</small></span>
            {money && row.amountVnd !== undefined ? <span className={styles.amt}>{formatPortalMoney(row.amountVnd)}</span> : <span />}
            <ChevronRight aria-hidden size={16} />
          </Link>;
        })}
      </section>}

      <section className={styles.tcard} aria-labelledby="ordered-goods">
        <div className={styles.tHead}><h2 id="ordered-goods">Hàng đã đặt</h2>{shown && <span className={styles.scopeChip}>{shown.goods.length} dòng</span>}</div>
        {period.day
          ? <div className={styles.dayFilterBar}><span>Đang xem ngày {weekdayDay(period.day)}</span>
            <Link href={orderedReportHref({ from: period.from, to: period.to })}>Bỏ lọc ngày</Link></div>
          : <p className={styles.tNote}>Bấm một dòng để xem hàng đó nằm ở đơn nào.</p>}
        {shown ? <>
          {shown.goods.length === 0 && <p className={styles.tNote}>Ngày này chỉ có dịch vụ, không có hàng.</p>}
          {shown.goods.map((good) => <Goods key={`${good.material_id}|${good.uom_symbol}`} good={good} showMoney={money} />)}
          {shown.goods.length > 0 && <div className={styles.totCard}>
            <div className={styles.totTop}><strong>Tổng cộng</strong>{money && shownTotal !== null && <span className={styles.amt}>{formatPortalMoney(shownTotal)}</span>}</div>
            <small>{shown.goods.length} loại hàng · {period.day ? `ngày ${shortDay(period.day)}` : `${report.order_count} đơn`}</small>
          </div>}
        </> : <div className={styles.errorBox} role="alert"><p><CircleAlert aria-hidden size={18} /><span>Chưa tải được hàng của ngày này. <small>Bấm “Bỏ lọc ngày” hoặc thử lại.</small></span></p><RetryButton /></div>}
      </section>

      {shown && shown.services.length > 0 && <section className={styles.tcard} aria-labelledby="ordered-services">
        <div className={styles.tHead}><h2 id="ordered-services">Dịch vụ</h2><span className={styles.scopeChip}>{shown.services.length} việc</span></div>
        {shown.services.map((service) => <div className={styles.svcRow} key={service.service_job_id}>
          <strong>{[service.name, `${formatQuantity(service.quantity)}${service.unit_label ? ` ${service.unit_label}` : ""}`].join(" · ")}</strong>
          {money && service.amount_vnd !== undefined ? <span className={styles.amt}>{formatPortalMoney(service.amount_vnd)}</span> : <span />}
          <small>Ngày {formatDayInput(service.day)}</small>
        </div>)}
      </section>}

      <div className={styles.exportRow}>
        <a className={`${portal.buttonSecondary} ${styles.exportBtn}`} href={orderedExportHref("xlsx", exportPeriod)}><Download aria-hidden size={18} />Xuất Excel</a>
        <a className={`${portal.buttonSecondary} ${styles.exportBtn}`} href={orderedExportHref("csv", exportPeriod)}><Download aria-hidden size={18} />Xuất CSV</a>
      </div>
      <p className={styles.cutoff}>Cập nhật đến {stampTime} ngày {stampDay}. Đơn đã hủy không tính{report.cancelled_count > 0 ? ` (${report.cancelled_count} đơn trong kỳ)` : ""}.</p>
    </div>
  );
}
