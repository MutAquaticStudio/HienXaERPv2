import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { CsvDownloadButton } from "@/components/ui/csv-download-button";
import { FormDialog } from "@/components/ui/form-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatMinutes } from "@/modules/attendance/presentation";
import { AdjustPayrollLineForm, PayrollCommandForm } from "@/modules/payroll/forms";
import { componentKindLabel, payBasisLabel, payrollCsv, payrollStateLabel, payrollStateTone } from "@/modules/payroll/presentation";

type Line = {
  id: string; employee_id: string; included: boolean; pay_basis: string; standard_work_days: string; work_days: string; worked_shifts: number;
  paid_leave_days: number; unpaid_days: number; worked_minutes: number; overtime_minutes: number; late_count: number; late_early_minutes: number;
  sales_revenue_vnd: string; base_amount_vnd: string; overtime_amount_vnd: string; allowance_vnd: string; bonus_vnd: string; deduction_vnd: string;
  manual_bonus_vnd: string; manual_deduction_vnd: string; manual_note: string | null; net_pay_vnd: string; other_earnings_vnd: string;
  details: Array<{ code: string; name: string; kind: string; amount_vnd: string }>; earning_event_id: string | null;
};

const money = (value: string | bigint) => formatVnd(vnd(String(value)));
const sum = (lines: Line[], key: keyof Line) => lines.reduce((total, line) => total + BigInt(String(line[key])), 0n);

/** FB12 (D34b): one payroll — a payslip per person, like KiotViet's "Bảng lương" detail. */
export default async function PayrollDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireInternalPermission("compensation.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const canManage = access.permissions.has("compensation.manage");
  const canClose = canManage && access.permissions.has("compensation.approve");
  const supabase = await createServerSupabase();
  const { data: period, error } = await supabase.from("payroll_periods")
    .select("id, code, name, period_start, period_end, state, version, calculated_at, closed_at").eq("id", id).eq("branch_id", access.branchId).maybeSingle();
  if (error) throw new Error("Không tải được bảng lương. Vui lòng thử lại.");
  if (!period) notFound();
  const [linesResult, peopleResult] = await Promise.all([
    supabase.from("payroll_lines").select("id, employee_id, included, pay_basis, standard_work_days::text, work_days::text, worked_shifts, paid_leave_days, unpaid_days, worked_minutes, overtime_minutes, late_count, late_early_minutes, sales_revenue_vnd::text, base_amount_vnd::text, overtime_amount_vnd::text, allowance_vnd::text, bonus_vnd::text, deduction_vnd::text, manual_bonus_vnd::text, manual_deduction_vnd::text, manual_note, net_pay_vnd::text, other_earnings_vnd::text, details, earning_event_id")
      .eq("payroll_period_id", id),
    supabase.from("workforce_read").select("id, display_name").eq("branch_id", access.branchId),
  ]);
  if (linesResult.error || peopleResult.error) throw new Error("Không tải được phiếu lương. Vui lòng thử lại.");
  const names = new Map((peopleResult.data ?? []).map((person) => [person.id as string, person.display_name as string]));
  const lines = (linesResult.data as Line[]).filter((line) => line.included).sort((a, b) => (names.get(a.employee_id) ?? "").localeCompare(names.get(b.employee_id) ?? "", "vi"));
  const eventIds = lines.map((line) => line.earning_event_id).filter(Boolean) as string[];
  const outstandingResult = eventIds.length
    ? await supabase.from("earning_event_read").select("id, outstanding_amount_vnd::text").in("id", eventIds)
    : { data: [], error: null };
  if (outstandingResult.error) throw new Error("Không tải được số tiền còn phải trả.");
  const outstanding = new Map((outstandingResult.data ?? []).map((row) => [row.id as string, String(row.outstanding_amount_vnd ?? "0")]));
  const draft = period.state === "DRAFT";
  const manual = (line: Line) => BigInt(line.manual_bonus_vnd) - BigInt(line.manual_deduction_vnd);
  const csv = payrollCsv(lines.map((line) => ({
    name: names.get(line.employee_id) ?? "", basis: payBasisLabel(line.pay_basis), days: `${line.work_days}/${line.standard_work_days}`,
    overtime: line.overtime_minutes, base: line.base_amount_vnd, ot: line.overtime_amount_vnd, allowance: line.allowance_vnd, bonus: line.bonus_vnd,
    deduction: line.deduction_vnd, manual: manual(line).toString(), net: line.net_pay_vnd, other: line.other_earnings_vnd,
  })), [["name", "Nhân viên"], ["basis", "Loại lương"], ["days", "Ngày công"], ["overtime", "Làm thêm (phút)"], ["base", "Lương chính"], ["ot", "Tiền làm thêm"],
    ["allowance", "Phụ cấp"], ["bonus", "Thưởng"], ["deduction", "Giảm trừ"], ["manual", "Cộng/trừ tay"], ["net", "Thực lĩnh"], ["other", "Thu nhập theo chuyến/việc (đã ghi riêng)"]]);

  return <>
    <header className="page-heading">
      <div><p className="eyebrow"><Link href="/admin/payroll">Bảng lương</Link> · {period.code}</p><h1>{period.name}</h1>
        <p className="lede">Kỳ {formatBusinessDate(period.period_start)} – {formatBusinessDate(period.period_end)} · tính lúc {formatBusinessDateTime(period.calculated_at)}
          {period.closed_at ? ` · chốt lúc ${formatBusinessDateTime(period.closed_at)}` : ""}</p></div>
      <div className="action-cluster">
        <StatusBadge tone={payrollStateTone(period.state)}>{payrollStateLabel(period.state)}</StatusBadge>
        <CsvDownloadButton csv={csv} filename={`${period.code}.csv`} />
        {draft && canManage && <FormDialog label="Tính lại" title="Tính lại bảng lương" buttonClassName="button button-secondary"
          description="Đọc lại chấm công, thiết lập lương và thu nhập khác; các khoản cộng / trừ tay được giữ.">
          <PayrollCommandForm kind="recalculate" payrollId={period.id} version={period.version} /></FormDialog>}
        {draft && canManage && <FormDialog label="Hủy" title="Hủy bảng lương tạm tính" buttonClassName="button button-secondary">
          <PayrollCommandForm kind="cancel" payrollId={period.id} version={period.version} /></FormDialog>}
        {draft && canClose && <FormDialog label="Chốt bảng lương" title="Chốt bảng lương" buttonClassName="button button-primary">
          <PayrollCommandForm kind="close" payrollId={period.id} version={period.version} /></FormDialog>}
      </div>
    </header>
    <section className="metric-grid" aria-label="Tổng bảng lương">
      <article className="card metric-card"><span className="metric-label">Số phiếu lương</span><strong className="metric-value">{lines.length}</strong></article>
      <article className="card metric-card"><span className="metric-label">Tổng thực lĩnh</span><strong className="metric-value">{money(sum(lines, "net_pay_vnd"))}</strong></article>
      <article className="card metric-card"><span className="metric-label">Thu nhập theo chuyến / việc</span><strong className="metric-value">{money(sum(lines, "other_earnings_vnd"))}</strong><span className="metric-note">Đã ghi phải trả riêng ở Thu nhập</span></article>
      <article className="card metric-card"><span className="metric-label">{draft ? "Trạng thái" : "Còn phải trả"}</span><strong className="metric-value">{draft ? "Tạm tính" : money([...outstanding.values()].reduce((total, value) => total + BigInt(value), 0n))}</strong></article>
    </section>
    <section className="card">
      <div className="table-wrap"><table className="payroll-table">
        <thead><tr>
          <th>Nhân viên</th><th>Ngày công</th><th>Lương chính</th><th>Làm thêm</th><th>Phụ cấp</th><th>Thưởng</th><th>Giảm trừ</th><th>Cộng / trừ tay</th>
          <th>Thực lĩnh</th>{!draft && <th>Còn phải trả</th>}<th></th>
        </tr></thead>
        <tbody>{lines.map((line) => <tr key={line.id}>
          <td>{names.get(line.employee_id) ?? "Nhân viên"}<small className="table-subline">{payBasisLabel(line.pay_basis)}</small></td>
          <td className="mono">{line.work_days}/{line.standard_work_days}<small className="table-subline">{line.paid_leave_days ? `phép ${line.paid_leave_days} · ` : ""}{line.unpaid_days ? `vắng ${line.unpaid_days} · ` : ""}{line.late_count ? `muộn ${line.late_count} lần` : ""}</small></td>
          <td className="mono">{money(line.base_amount_vnd)}</td>
          <td className="mono">{money(line.overtime_amount_vnd)}{line.overtime_minutes > 0 && <small className="table-subline">{formatMinutes(line.overtime_minutes)}</small>}</td>
          <td className="mono">{money(line.allowance_vnd)}</td>
          <td className="mono">{money(line.bonus_vnd)}</td>
          <td className="mono">{BigInt(line.deduction_vnd) ? `−${money(line.deduction_vnd)}` : money("0")}</td>
          <td className="mono">{manual(line) < 0n ? `−${money((-manual(line)).toString())}` : money(manual(line).toString())}{line.manual_note && <small className="table-subline">{line.manual_note}</small>}</td>
          <td className="mono"><strong>{money(line.net_pay_vnd)}</strong>{BigInt(line.other_earnings_vnd) > 0n && <small className="table-subline">+ {money(line.other_earnings_vnd)} chuyến / việc</small>}</td>
          {!draft && <td className="mono">{line.earning_event_id ? money(outstanding.get(line.earning_event_id) ?? "0") : "—"}</td>}
          <td className="table-actions">
            <FormDialog label="Chi tiết" title={`Phiếu lương ${names.get(line.employee_id) ?? ""}`} buttonClassName="button button-secondary button-compact">
              <dl className="payslip">
                <dt>Ngày công</dt><dd>{line.work_days} / {line.standard_work_days} (đi làm {line.worked_shifts} ca, nghỉ có phép {line.paid_leave_days}, nghỉ không phép / vắng {line.unpaid_days})</dd>
                <dt>Giờ làm</dt><dd>{formatMinutes(line.worked_minutes)} · làm thêm {formatMinutes(line.overtime_minutes)}</dd>
                <dt>Đi muộn / về sớm</dt><dd>{line.late_count} lần · {formatMinutes(line.late_early_minutes)}</dd>
                <dt>Lương chính</dt><dd>{money(line.base_amount_vnd)}</dd>
                <dt>Làm thêm giờ</dt><dd>{money(line.overtime_amount_vnd)}</dd>
                {line.details.map((item) => <Fragment key={item.code}><dt>{componentKindLabel(item.kind)}: {item.name}</dt><dd>{item.kind === "DEDUCTION" ? "−" : ""}{money(item.amount_vnd)}</dd></Fragment>)}
                {BigInt(line.sales_revenue_vnd) > 0n && <><dt>Doanh thu đã giao</dt><dd>{money(line.sales_revenue_vnd)}</dd></>}
                <dt>Cộng / trừ tay</dt><dd>{money(line.manual_bonus_vnd)} / −{money(line.manual_deduction_vnd)}{line.manual_note ? ` · ${line.manual_note}` : ""}</dd>
                <dt>Thực lĩnh</dt><dd><strong>{money(line.net_pay_vnd)}</strong></dd>
                <dt>Thu nhập theo chuyến / việc</dt><dd>{money(line.other_earnings_vnd)} (đã ghi phải trả riêng)</dd>
              </dl>
            </FormDialog>
            {draft && canManage && <FormDialog label="Cộng / trừ" title={`Cộng / trừ tay · ${names.get(line.employee_id) ?? ""}`} buttonClassName="button button-secondary button-compact">
              <AdjustPayrollLineForm lineId={line.id} bonus={line.manual_bonus_vnd} deduction={line.manual_deduction_vnd} note={line.manual_note} /></FormDialog>}
          </td>
        </tr>)}</tbody>
        {lines.length > 0 && <tfoot><tr>
          <th>Tổng</th><td></td><td className="mono">{money(sum(lines, "base_amount_vnd"))}</td><td className="mono">{money(sum(lines, "overtime_amount_vnd"))}</td>
          <td className="mono">{money(sum(lines, "allowance_vnd"))}</td><td className="mono">{money(sum(lines, "bonus_vnd"))}</td><td className="mono">−{money(sum(lines, "deduction_vnd"))}</td>
          <td></td><td className="mono"><strong>{money(sum(lines, "net_pay_vnd"))}</strong></td>{!draft && <td></td>}<td></td>
        </tr></tfoot>}
      </table>{!lines.length && <p className="empty-inline">Chưa có phiếu lương: thiết lập lương cho nhân viên ở trang Bảng lương rồi bấm “Tính lại”.</p>}</div>
    </section>
    {!draft && <p className="muted">Chi trả lương: mục <Link href="/admin/compensation">Thu nhập</Link> → khoản “Bảng lương” của từng người → Chi trả (ghi Sổ quỹ).</p>}
  </>;
}
