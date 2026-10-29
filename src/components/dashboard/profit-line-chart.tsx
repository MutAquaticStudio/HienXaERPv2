"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatVnd, vnd } from "@/lib/core/money";
import {
  PROFIT_SERIES, bucketLabel, bucketTitle, compactVnd, granularityLabel, hiddenReason, readySegments, readyValue, valueTicks,
  type MetricQuality, type MoneyMetric, type ProfitSeries, type SeriesKey,
} from "@/modules/reports/profit-series";

// FB18: drawn at the width it is shown (text stays 12 px, height fixed) instead of one 720-wide picture stretched to the card.
const DEFAULT_WIDTH = 720;
const PAD = { top: 16, right: 12, bottom: 30, left: 58 };

export function qualityReason(quality: MetricQuality): string {
  if (quality === "INCOMPLETE") return "Chưa đủ hoặc chưa khớp giá vốn";
  if (quality === "NOT_APPLICABLE") return "Chi phí chung chưa phân bổ theo bộ lọc này";
  if (quality === "FORBIDDEN") return "Không có quyền xem";
  if (quality === "UNAVAILABLE") return "Chưa tải được";
  return "";
}

function metricText(metric: MoneyMetric) {
  const value = readyValue(metric);
  return value === null ? `— (${qualityReason(metric.quality)})` : formatVnd(vnd(value.toString()));
}

export function ProfitLineChart({ series }: { series: ProfitSeries }) {
  const titleId = useId();
  const points = series.points;
  const [active, setActive] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [WIDTH, setWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const HEIGHT = WIDTH < 560 ? 200 : 240;
  const PLOT_W = WIDTH - PAD.left - PAD.right;
  const PLOT_H = HEIGHT - PAD.top - PAD.bottom;
  const visible = PROFIT_SERIES.filter((item) => hiddenReason(points, item.key) === null);
  const hidden = PROFIT_SERIES.flatMap((item) => {
    const reason = hiddenReason(points, item.key);
    return reason ? [{ ...item, reason }] : [];
  });

  if (!points.length) return <p className="empty-inline">Kỳ đã chọn chưa bắt đầu nên chưa có số liệu để vẽ.</p>;

  const drawn = visible.flatMap((item) => points.flatMap((point) => {
    const value = readyValue(point[item.key]);
    return value === null ? [] : [value];
  }));
  const ticks = valueTicks(drawn);
  const low = ticks[0];
  const span = Number(ticks[ticks.length - 1] - low) || 1;
  const x = (index: number) => PAD.left + (points.length === 1 ? PLOT_W / 2 : (index * PLOT_W) / (points.length - 1));
  const y = (value: bigint) => PAD.top + PLOT_H - (Number(value - low) / span) * PLOT_H;
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(PLOT_W / 72))));
  // The table lists only the periods with figures (a month by day was 31 rows of 0 đ), totals first.
  const moving = points.filter((item) => PROFIT_SERIES.some((column) => { const value = readyValue(item[column.key]); return value !== null && value !== 0n; }));
  const total = (key: SeriesKey) => points.every((item) => readyValue(item[key]) !== null)
    ? points.reduce((sum, item) => sum + readyValue(item[key])!, 0n) : null;
  const allZero = drawn.length > 0 && drawn.every((value) => value === 0n);

  function path(key: SeriesKey) {
    return readySegments(points, key).map((segment) => segment.map((index, order) =>
      `${order ? "L" : "M"}${x(index).toFixed(1)},${y(readyValue(points[index][key])!).toFixed(1)}`).join(" ")).join(" ");
  }

  function track(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const position = ((event.clientX - box.left) / box.width) * WIDTH;
    const index = points.length === 1 ? 0 : Math.round(((position - PAD.left) / PLOT_W) * (points.length - 1));
    setActive(Math.min(points.length - 1, Math.max(0, index)));
  }

  function keyboard(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowLeft" ? -1 : 1;
    setActive((current) => Math.min(points.length - 1, Math.max(0, (current ?? (step > 0 ? -1 : points.length)) + step)));
  }

  const point = active === null ? null : points[active];
  const tooltipLeft = active === null ? 0 : Math.min(82, Math.max(18, (x(active) / WIDTH) * 100));

  return <div className="profit-chart">
    <ul className="profit-chart-legend" aria-label="Chú giải">
      {visible.map((item) => <li key={item.key}><i style={{ background: item.color }} aria-hidden="true" />{item.label}</li>)}
      <li className="muted">{granularityLabel(series.granularity)}</li>
    </ul>
    {allZero && <p className="metric-note">Chưa có thu chi trong kỳ đã chọn.</p>}
    <div className="profit-chart-scroll"><div className="profit-chart-plot" ref={box}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} role="img" aria-labelledby={titleId} tabIndex={0}
        onPointerMove={track} onPointerLeave={() => setActive(null)} onFocus={() => setActive((current) => current ?? points.length - 1)}
        onBlur={() => setActive(null)} onKeyDown={keyboard}>
        {/* A single string: React renders a <title> with several children empty on the server (hydration mismatch). */}
        <title id={titleId}>{`Biểu đồ đường Thu, Chi và Lợi nhuận ${granularityLabel(series.granularity).toLowerCase()}. Dùng phím mũi tên để xem từng kỳ.`}</title>
        {ticks.map((tick) => <g key={tick.toString()}>
          <line className={tick === 0n ? "profit-chart-zero" : "profit-chart-grid"} x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} />
          <text className="profit-chart-axis" x={PAD.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">{compactVnd(tick)}</text>
        </g>)}
        {points.map((item, index) => index % labelEvery === 0 || (index === points.length - 1 && index % labelEvery >= Math.ceil(labelEvery / 2))
          ? <text key={item.start} className="profit-chart-axis" x={x(index)} y={HEIGHT - 10} textAnchor="middle">{bucketLabel(item, series.granularity)}</text>
          : null)}
        {active !== null && <line className="profit-chart-crosshair" x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + PLOT_H} />}
        {visible.map((item) => <path key={item.key} d={path(item.key)} fill="none" stroke={item.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
        {visible.map((item) => {
          const index = active ?? points.length - 1;
          const value = readyValue(points[index][item.key]);
          return value === null ? null : <circle key={item.key} cx={x(index)} cy={y(value)} r={4} fill={item.color} stroke="var(--surface)" strokeWidth={2} />;
        })}
      </svg>
      {point && <div className="profit-chart-tooltip" role="status" style={{ left: `${tooltipLeft}%` }}>
        <strong>{bucketTitle(point, series.granularity)}</strong>
        {PROFIT_SERIES.map((item) => <span key={item.key}><i style={{ background: item.color }} aria-hidden="true" />{item.label}: {metricText(point[item.key])}</span>)}
      </div>}
    </div></div>
    {hidden.map((item) => <p key={item.key} className="metric-note">Không vẽ “{item.label}”: {qualityReason(item.reason)}.</p>)}
    <details className="profit-chart-table">
      <summary>{moving.length ? `Xem bảng số liệu · ${moving.length} ${series.granularity === "DAY" ? "ngày" : series.granularity === "WEEK" ? "tuần" : "tháng"} có phát sinh` : "Xem bảng số liệu"}</summary>
      <div className="table-wrap"><table>
        <thead><tr><th>Kỳ</th>{PROFIT_SERIES.map((item) => <th key={item.key} className="numeric">{item.label}</th>)}</tr></thead>
        <tbody>
          <tr className="profit-chart-total"><td>Cả kỳ</td>{PROFIT_SERIES.map((column) => { const value = total(column.key); return <td key={column.key} className="numeric mono">{value === null ? "—" : formatVnd(vnd(value.toString()))}</td>; })}</tr>
          {moving.map((item) => <tr key={item.start}><td>{bucketTitle(item, series.granularity)}</td>
            {PROFIT_SERIES.map((column) => <td key={column.key} className="numeric mono">{metricText(item[column.key])}</td>)}</tr>)}
          {!moving.length && <tr><td colSpan={PROFIT_SERIES.length + 1} className="muted">Không có kỳ nào phát sinh thu chi.</td></tr>}
        </tbody>
      </table></div>
    </details>
  </div>;
}
