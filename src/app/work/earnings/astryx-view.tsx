import { WxEmpty, WxHead } from "@/components/astryx/work-kit";
import { formatBusinessDate } from "@/lib/core/business-time";
import { formatPortalMoney as money } from "@/modules/portal/money";
import { earningKindLabel, earningStateLabel } from "@/modules/portal/presentation";
import { componentKindLabel, describeWorkRateItem, workRateCount, type WorkRateItem } from "@/modules/payroll/presentation";
import { WEEK_TONE_LABEL, type WeekDay } from "@/modules/portal/earnings";
import type { WorkerEarning } from "@/modules/portal/types";

export type AxPayslip = {
  id: string; work_days: string; standard_work_days: string; base_amount_vnd: string; overtime_amount_vnd: string;
  manual_bonus_vnd: string; manual_deduction_vnd: string; manual_note: string | null; net_pay_vnd: string;
  details: Array<{ code: string; name: string; kind: string; method?: string; quantity?: number; amount_vnd: string; items?: WorkRateItem[]; unpriced?: WorkRateItem[] }>;
  payroll_periods: { name: string; period_start: string; period_end: string } | null;
  /** Số còn phải chi của phiếu ("0" = đã chi trả), hoặc undefined nếu chưa có khoản phải trả. */
  left?: string;
};
export type AxMonth = { items: readonly WorkerEarning[]; total: string; time: string; trips: string; tripCount: number; other: string };

/** "Thu nhập" kiểu Astryx: thẻ tối Dự kiến nhận + 3 ô, Chấm công tuần T2–CN, Phiếu lương đã chốt, Các khoản tháng này. Số tiền là đồng nguyên, căn phải. */
export function AstryxWorkEarningsView({ monthLabel, month, week, today, notes, payslips }: {
  monthLabel: string; month: AxMonth; week: { days: WeekDay[]; worked: number; scheduled: number }; today: string; notes: WeekDay[]; payslips: AxPayslip[];
}) {
  return <div className="wx-page cols">
    <div className="wx-span"><WxHead sub={`${monthLabel} · tạm tính`} title="Thu nhập của tôi" /></div>
    <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
      <section className="wx-money" aria-label="Dự kiến nhận tháng này">
        <div><p>Dự kiến nhận</p><strong>{money(month.total)}</strong></div>
        <div className="wx-money-tiles">
          <span><small>Lương ngày công</small><b>{money(month.time)}</b></span>
          <span><small>Tiền chuyến · {month.tripCount}</small><b>{money(month.trips)}</b></span>
          <span><small>Thưởng / khác</small><b>{money(month.other)}</b></span>
        </div>
      </section>
      <section className="wx-card" aria-labelledby="week-title">
        <div className="wx-card-head"><h2 id="week-title">Chấm công tuần này</h2><span className="wx-hint">{week.worked} / {week.scheduled} ngày</span></div>
        <ol className="wx-week">{week.days.map((day) => <li key={day.date} data-tone={day.tone} aria-current={day.date === today ? "date" : undefined}>
          {day.weekday}<span title={day.note}>{day.day}</span><small className="sr-only">, {WEEK_TONE_LABEL[day.tone]}</small>
        </li>)}</ol>
        {notes.map((day) => <p key={day.date} className="wx-hint" style={{ marginTop: 8 }}><b>{day.weekday}:</b> {day.note}</p>)}
      </section>
    </div>
    <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
      {payslips.length > 0 && <section className="wx-card" aria-labelledby="payslips">
        <div className="wx-card-head"><h2 id="payslips">Phiếu lương đã chốt</h2></div>
        <ul className="wx-list">{payslips.map((slip) => {
          const paid = slip.left === "0";
          return <li key={slip.id} style={{ display: "block" }}>
            <details className="wx-slip">
              <summary><span className="m"><b>{slip.payroll_periods?.name ?? "Kỳ lương"}</b>
                <small>{paid ? "Đã chi trả" : slip.left ? `Chờ chi trả ${money(slip.left)}` : "Đã chốt"}</small></span><strong className="wx-num">{money(slip.net_pay_vnd)}</strong></summary>
              <p className="wx-hint">{slip.payroll_periods ? `${formatBusinessDate(slip.payroll_periods.period_start)} – ${formatBusinessDate(slip.payroll_periods.period_end)}` : ""} · ngày công {slip.work_days}/{slip.standard_work_days}</p>
              <dl>
                <dt>Lương chính</dt><dd>{money(slip.base_amount_vnd)}</dd>
                <dt>Làm thêm giờ</dt><dd>{money(slip.overtime_amount_vnd)}</dd>
                {slip.details.map((item) => <div key={item.code}><dt>{componentKindLabel(item.kind)}: {item.name}{item.method === "PER_TRIP" ? ` (${item.quantity ?? 0} chuyến)` : item.method === "WORK_RATE" ? workRateCount(item.items) : ""}</dt><dd>{item.kind === "DEDUCTION" ? "−" : ""}{money(item.amount_vnd)}</dd>
                  {item.items?.map((row, index) => <dd key={`paid-${index}`} className="wx-hint">{describeWorkRateItem(row)}</dd>)}
                  {item.unpriced?.map((row, index) => <dd key={`open-${index}`} className="wx-hint">Chưa có đơn giá, chưa tính tiền: {describeWorkRateItem(row)}</dd>)}
                </div>)}
                {slip.manual_bonus_vnd !== "0" && <div><dt>Cộng thêm</dt><dd>{money(slip.manual_bonus_vnd)}</dd></div>}
                {slip.manual_deduction_vnd !== "0" && <div><dt>Trừ{slip.manual_note ? ` (${slip.manual_note})` : ""}</dt><dd>−{money(slip.manual_deduction_vnd)}</dd></div>}
                <dt>Thực lĩnh</dt><dd><strong>{money(slip.net_pay_vnd)}</strong></dd>
              </dl>
            </details>
          </li>;
        })}</ul>
      </section>}
      <section className="wx-card" aria-labelledby="earning-list">
        <div className="wx-card-head"><h2 id="earning-list">Các khoản tháng này</h2></div>
        {month.items.length ? <ul className="wx-list">{month.items.map((item) => <li key={item.id}>
          <span className="m"><b>{earningKindLabel(item.type)}</b><small>{item.occurred_at ? formatBusinessDate(item.occurred_at) : ""} · {earningStateLabel(item.state)}</small></span>
          <strong className="wx-num">{money(item.amount_vnd)}</strong>
        </li>)}</ul> : <WxEmpty title="Tháng này chưa có khoản thu nhập được ghi nhận" />}
      </section>
    </div>
  </div>;
}
