import Link from "next/link";

import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { activeTab, DetailTabs, type DetailTab } from "@/components/ui/detail-tabs";
import { FormDialog } from "@/components/ui/form-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBusinessDate } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import {
  CreatePayrollForm, PayrollComponentForm, PayrollHolidayForm, SalaryProfileForm,
  type PayrollComponent, type PersonOption, type SalaryProfile,
} from "@/modules/payroll/forms";
import {
  componentKindLabel, componentMethodLabel, describeTiers, payBasisLabel, payBasisUnit, payrollStateLabel, payrollStateTone,
} from "@/modules/payroll/presentation";

type Period = { id: string; code: string; name: string; period_start: string; period_end: string; state: string; closed_at: string | null };
type Line = { payroll_period_id: string; net_pay_vnd: string; included: boolean };

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

/** FB12 (D34b): "Bảng lương" — kỳ lương, thiết lập lương từng người, thu nhập khác (rules) và ngày lễ. */
export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const access = await requireInternalPermission("compensation.read");
  const canManage = access.permissions.has("compensation.manage");
  const tabs: DetailTab[] = [
    { id: "periods", label: "Bảng lương" },
    { id: "profiles", label: "Thiết lập lương" },
    { id: "components", label: "Thu nhập khác" },
    { id: "holidays", label: "Ngày lễ" },
  ];
  const tab = activeTab(tabs, (await searchParams).tab);
  const supabase = await createServerSupabase();
  const [periodsResult, linesResult, peopleResult, profilesResult, componentsResult, holidaysResult] = await Promise.all([
    supabase.from("payroll_periods").select("id, code, name, period_start, period_end, state, closed_at").eq("branch_id", access.branchId).order("period_start", { ascending: false }).limit(36),
    supabase.from("payroll_lines").select("payroll_period_id, net_pay_vnd::text, included").eq("branch_id", access.branchId),
    supabase.from("workforce_read").select("id, display_name").eq("branch_id", access.branchId).eq("active", true).order("display_name"),
    supabase.from("salary_profiles").select("employee_id, pay_basis, base_rate_vnd::text, overtime_enabled, overtime_hourly_vnd::text, overtime_weekday_pct, overtime_restday_pct, overtime_holiday_pct, rest_weekday, active").eq("branch_id", access.branchId),
    supabase.from("payroll_components").select("id, code, name, kind, method, amount_vnd::text, tiers, employee_id, active").eq("branch_id", access.branchId).order("kind").order("code"),
    supabase.from("payroll_holidays").select("holiday_date, name, active").eq("branch_id", access.branchId).eq("active", true).order("holiday_date", { ascending: false }),
  ]);
  if ([periodsResult, linesResult, peopleResult, profilesResult, componentsResult, holidaysResult].some((result) => result.error)) {
    throw new Error("Không tải được bảng lương. Vui lòng thử lại hoặc liên hệ quản trị viên.");
  }
  const periods = periodsResult.data as Period[];
  const lines = linesResult.data as Line[];
  const people = [...new Map((peopleResult.data as PersonOption[]).map((person) => [person.id, person] as const)).values()];
  const profiles = new Map((profilesResult.data as SalaryProfile[]).map((profile) => [profile.employee_id, profile]));
  const components = componentsResult.data as PayrollComponent[];
  const holidays = holidaysResult.data as Array<{ holiday_date: string; name: string }>;
  const day = today();
  const monthStart = `${day.slice(0, 7)}-01`;
  const lastMonthEnd = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10);
  const lastMonthStart = `${lastMonthEnd.slice(0, 7)}-01`;
  const personName = (id: string | null) => (id ? people.find((person) => person.id === id)?.display_name ?? "Một nhân viên" : "Mọi nhân viên");
  const totalOf = (periodId: string) => lines.filter((line) => line.payroll_period_id === periodId && line.included)
    .reduce((sum, line) => sum + BigInt(line.net_pay_vnd), 0n);

  return <>
    <header className="page-heading">
      <div><p className="eyebrow">Nhân công</p><h1>Bảng lương</h1>
        <p className="lede">Lương tính từ chấm công đã chốt, thiết lập lương từng người và các khoản thu nhập khác. Chốt bảng lương ghi phải trả nhân viên; chi trả ở mục Thu nhập.</p></div>
      <div className="action-cluster">
        <Link className="button button-secondary" href="/admin/attendance">Chấm công</Link>
        {canManage && <FormDialog label="Lập bảng lương" title="Lập bảng lương" buttonClassName="button button-primary">
          <CreatePayrollForm from={lastMonthStart} to={lastMonthEnd} name={`Lương tháng ${lastMonthStart.slice(5, 7)}/${lastMonthStart.slice(0, 4)}`} /></FormDialog>}
      </div>
    </header>
    <DetailTabs tabs={tabs} active={tab} href={(id) => `/admin/payroll?tab=${id}`} label="Bảng lương" />

    {tab === "periods" && <section className="card">
      <div className="section-head"><h2>Các kỳ lương</h2><span className="scope-chip">Tháng này từ {formatBusinessDate(monthStart)}</span></div>
      <div className="table-wrap"><table className="row-link-table">
        <thead><tr><th>Mã</th><th>Tên</th><th>Kỳ</th><th>Thực lĩnh</th><th>Trạng thái</th></tr></thead>
        <tbody>{periods.map((period) => <tr key={period.id}>
          <td className="mono"><Link className="code-link" href={`/admin/payroll/${period.id}`}>{period.code}</Link></td>
          <td>{period.name}</td>
          <td>{formatBusinessDate(period.period_start)} – {formatBusinessDate(period.period_end)}</td>
          <td className="mono">{formatVnd(vnd(totalOf(period.id).toString()))}</td>
          <td><StatusBadge tone={payrollStateTone(period.state)}>{payrollStateLabel(period.state)}</StatusBadge></td>
        </tr>)}</tbody>
      </table>{!periods.length && <p className="empty-inline">Chưa có bảng lương. Thiết lập lương cho nhân viên rồi bấm “Lập bảng lương”.</p>}</div>
    </section>}

    {tab === "profiles" && <section className="card">
      <div className="section-head"><h2>Thiết lập lương</h2><span className="scope-chip">{profiles.size} / {people.length} người đã thiết lập</span></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Nhân viên</th><th>Loại lương</th><th>Mức lương</th><th>Làm thêm</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>{people.map((person) => {
          const profile = profiles.get(person.id);
          return <tr key={person.id}>
            <td>{person.display_name}</td>
            <td>{profile ? payBasisLabel(profile.pay_basis) : <span className="muted">Chưa thiết lập</span>}</td>
            <td className="mono">{profile ? `${formatVnd(vnd(profile.base_rate_vnd))} ${payBasisUnit(profile.pay_basis)}` : "—"}</td>
            <td>{profile ? profile.overtime_enabled ? `${profile.overtime_weekday_pct}% · ${profile.overtime_restday_pct}% · ${profile.overtime_holiday_pct}%` : "Không tính" : "—"}</td>
            <td>{profile && <StatusBadge tone={profile.active ? "success" : "warning"}>{profile.active ? "Đang áp dụng" : "Ngừng"}</StatusBadge>}</td>
            <td className="table-actions">{canManage && <FormDialog label={profile ? "Sửa" : "Thiết lập"} title={`Thiết lập lương ${person.display_name}`} size="lg"
              buttonClassName="button button-secondary button-compact"><SalaryProfileForm person={person} profile={profile} /></FormDialog>}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>}

    {tab === "components" && <section className="card">
      <div className="section-head"><h2>Thu nhập khác</h2>
        {canManage && <FormDialog label="Thêm khoản" title="Thêm khoản thu nhập khác" size="lg" buttonClassName="button button-primary button-compact"
          description="Phụ cấp, thưởng (cả thưởng theo doanh thu bậc) hoặc giảm trừ (đi muộn, nghỉ không phép…) tự tính vào mọi bảng lương.">
          <PayrollComponentForm people={people} /></FormDialog>}</div>
      <div className="table-wrap"><table>
        <thead><tr><th>Mã</th><th>Tên</th><th>Loại</th><th>Cách tính</th><th>Mức</th><th>Áp dụng cho</th><th></th></tr></thead>
        <tbody>{components.map((component) => <tr key={component.id} className={component.active ? undefined : "row-muted"}>
          <td className="mono">{component.code}</td><td>{component.name}{!component.active && <small className="table-subline">Ngừng áp dụng</small>}</td>
          <td><StatusBadge tone={component.kind === "DEDUCTION" ? "danger" : component.kind === "BONUS" ? "success" : "info"}>{componentKindLabel(component.kind)}</StatusBadge></td>
          <td>{componentMethodLabel(component.method)}</td>
          <td className="mono">{component.method === "SALES_TIERS" ? describeTiers(component.tiers) : formatVnd(vnd(component.amount_vnd ?? "0"))}</td>
          <td>{personName(component.employee_id)}</td>
          <td className="table-actions">{canManage && <FormDialog label="Sửa" title={`Sửa ${component.name}`} size="lg" buttonClassName="button button-secondary button-compact">
            <PayrollComponentForm component={component} people={people} /></FormDialog>}</td>
        </tr>)}</tbody>
      </table>{!components.length && <p className="empty-inline">Chưa có khoản nào. Ví dụ: phụ cấp ăn trưa 30.000 đ mỗi ngày công, phạt đi muộn 50.000 đ mỗi lần, thưởng 1% doanh thu từ 100 triệu.</p>}</div>
    </section>}

    {tab === "holidays" && <section className="card">
      <div className="section-head"><h2>Ngày lễ</h2>
        {canManage && <FormDialog label="Thêm ngày lễ" title="Thêm ngày lễ" buttonClassName="button button-primary button-compact"
          description="Làm thêm vào ngày lễ tính theo hệ số ngày lễ (mặc định 300%)."><PayrollHolidayForm /></FormDialog>}</div>
      <div className="table-wrap"><table>
        <thead><tr><th>Ngày</th><th>Tên</th><th></th></tr></thead>
        <tbody>{holidays.map((holiday) => <tr key={holiday.holiday_date}>
          <td>{formatBusinessDate(holiday.holiday_date)}</td><td>{holiday.name}</td>
          <td className="table-actions">{canManage && <FormDialog label="Bỏ" title={`Bỏ ngày lễ ${holiday.name}`} buttonClassName="button button-secondary button-compact">
            <PayrollHolidayForm day={holiday.holiday_date} name={holiday.name} remove /></FormDialog>}</td>
        </tr>)}</tbody>
      </table>{!holidays.length && <p className="empty-inline">Chưa có ngày lễ.</p>}</div>
    </section>}
  </>;
}
