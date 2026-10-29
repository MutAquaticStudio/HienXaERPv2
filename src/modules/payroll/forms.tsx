"use client";

// FB12 (D34b): forms of "Bảng lương" (see CommandForm for the operation id and popup behaviour).
import { useState } from "react";
import { useRouter } from "next/navigation";

import { CommandForm } from "@/components/ui/command-form";
import { MoneyInput } from "@/components/ui/money-input";
import {
  adjustPayrollLineAction, cancelPayrollAction, closePayrollAction, createPayrollAction, recalculatePayrollAction,
  savePayrollComponentAction, savePayrollHolidayAction, saveSalaryProfileAction, type PayrollFormState,
} from "@/modules/payroll/actions";
import {
  bpsToPercent, COMPONENT_KINDS, COMPONENT_METHODS, componentKindLabel, componentMethodLabel, PAY_BASES, payBasisLabel, type SalesTier,
} from "@/modules/payroll/presentation";

export type PersonOption = { id: string; display_name: string };
export type SalaryProfile = {
  employee_id: string; pay_basis: string; base_rate_vnd: string; overtime_enabled: boolean; overtime_hourly_vnd: string | null;
  overtime_weekday_pct: number; overtime_restday_pct: number; overtime_holiday_pct: number; rest_weekday: number; active: boolean;
};
export type PayrollComponent = {
  id: string; code: string; name: string; kind: string; method: string; amount_vnd: string | null; tiers: SalesTier[] | null;
  employee_id: string | null; active: boolean;
};

const restDays = [[7, "Chủ nhật"], [6, "Thứ 7"], [1, "Thứ 2"], [2, "Thứ 3"], [3, "Thứ 4"], [4, "Thứ 5"], [5, "Thứ 6"]] as const;

export function SalaryProfileForm({ person, profile }: { person: PersonOption; profile?: SalaryProfile }) {
  const [basis, setBasis] = useState(profile?.pay_basis ?? "MONTHLY_WORKDAYS");
  const id = person.id;
  return <CommandForm action={saveSalaryProfileAction} submit="Lưu thiết lập lương">
    <input type="hidden" name="employeeId" value={person.id} />
    <div className="form-grid">
      <div className="field"><label htmlFor={`basis-${id}`}>Loại lương</label>
        <select id={`basis-${id}`} name="payBasis" value={basis} onChange={(event) => setBasis(event.target.value)}>
          {PAY_BASES.map((item) => <option key={item} value={item}>{payBasisLabel(item)}</option>)}
        </select></div>
      <div className="field"><label htmlFor={`rate-${id}`}>{basis === "MONTHLY_WORKDAYS" ? "Lương tháng (đủ ngày công chuẩn)" : basis === "PER_SHIFT" ? "Lương mỗi ca" : basis === "PER_HOUR" ? "Lương mỗi giờ" : "Lương cố định mỗi kỳ"}</label>
        <MoneyInput id={`rate-${id}`} name="baseRate" defaultValue={profile?.base_rate_vnd} required /></div>
    </div>
    <p className="muted">{basis === "MONTHLY_WORKDAYS" ? "Lương = lương tháng × (ngày đi làm + nghỉ có phép) ÷ ngày công chuẩn của chi nhánh." : basis === "PER_SHIFT" ? "Lương = lương mỗi ca × số ca đi làm (nghỉ có phép tính 1 ca)." : basis === "PER_HOUR" ? "Lương = lương mỗi giờ × giờ làm trong ca (giờ làm thêm tính riêng)." : "Trả đủ mỗi kỳ, không phụ thuộc ngày công."}</p>
    <fieldset className="check-row attendance-choices"><legend>Làm thêm giờ</legend>
      <label className="check-inline"><input type="checkbox" name="overtime" defaultChecked={profile?.overtime_enabled ?? true} /> Tính làm thêm giờ</label>
    </fieldset>
    <div className="form-grid">
      <div className="field"><label htmlFor={`wk-${id}`}>Ngày thường (%)</label><input id={`wk-${id}`} type="number" name="weekdayPct" min={100} max={1000} defaultValue={profile?.overtime_weekday_pct ?? 150} required /></div>
      <div className="field"><label htmlFor={`rest-${id}`}>Ngày nghỉ tuần (%)</label><input id={`rest-${id}`} type="number" name="restdayPct" min={100} max={1000} defaultValue={profile?.overtime_restday_pct ?? 200} required /></div>
      <div className="field"><label htmlFor={`hol-${id}`}>Ngày lễ (%)</label><input id={`hol-${id}`} type="number" name="holidayPct" min={100} max={1000} defaultValue={profile?.overtime_holiday_pct ?? 300} required /></div>
      <div className="field"><label htmlFor={`restday-${id}`}>Ngày nghỉ trong tuần</label><select id={`restday-${id}`} name="restWeekday" defaultValue={profile?.rest_weekday ?? 7}>
        {restDays.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="field"><label htmlFor={`othour-${id}`}>Lương 1 giờ làm thêm (để trống = tự tính)</label><MoneyInput id={`othour-${id}`} name="overtimeHourly" defaultValue={profile?.overtime_hourly_vnd} /></div>
      <label className="check-inline"><input type="checkbox" name="active" defaultChecked={profile?.active ?? true} /> Đang áp dụng</label>
    </div>
  </CommandForm>;
}

export function PayrollComponentForm({ component, people }: { component?: PayrollComponent; people: PersonOption[] }) {
  const [method, setMethod] = useState(component?.method ?? "FIXED_PER_PERIOD");
  const tiers = component?.tiers?.length ? component.tiers : [{ from_vnd: "0", rate_bps: 0 }];
  const rows = [...tiers, ...Array.from({ length: Math.max(0, 4 - tiers.length) }, () => null)];
  const key = component?.id ?? "new";
  return <CommandForm action={savePayrollComponentAction} submit={component ? "Lưu" : "Thêm khoản"}>
    {component && <input type="hidden" name="componentId" value={component.id} />}
    <div className="form-grid">
      <div className="field"><label htmlFor={`ccode-${key}`}>Mã</label><input id={`ccode-${key}`} name="code" defaultValue={component?.code} placeholder="AN-TRUA" maxLength={24} required /></div>
      <div className="field"><label htmlFor={`cname-${key}`}>Tên</label><input id={`cname-${key}`} name="name" defaultValue={component?.name} placeholder="Phụ cấp ăn trưa" maxLength={80} required /></div>
      <div className="field"><label htmlFor={`ckind-${key}`}>Loại</label><select id={`ckind-${key}`} name="kind" defaultValue={component?.kind ?? "ALLOWANCE"}>
        {COMPONENT_KINDS.map((item) => <option key={item} value={item}>{componentKindLabel(item)}</option>)}</select></div>
      <div className="field"><label htmlFor={`cmethod-${key}`}>Cách tính</label><select id={`cmethod-${key}`} name="method" value={method} onChange={(event) => setMethod(event.target.value)}>
        {COMPONENT_METHODS.map((item) => <option key={item} value={item}>{componentMethodLabel(item)}</option>)}</select></div>
      {method !== "SALES_TIERS" && <div className="field"><label htmlFor={`camount-${key}`}>{method === "FIXED_PER_PERIOD" ? "Số tiền mỗi kỳ" : method === "PER_LATE_MINUTE" ? "Số tiền mỗi phút" : method === "PER_WORKDAY" ? "Số tiền mỗi ngày công" : "Số tiền mỗi lần / ngày"}</label>
        <MoneyInput id={`camount-${key}`} name="amount" defaultValue={component?.amount_vnd} required /></div>}
      <div className="field"><label htmlFor={`cemp-${key}`}>Áp dụng cho</label><select id={`cemp-${key}`} name="employeeId" defaultValue={component?.employee_id ?? ""}>
        <option value="">Mọi nhân viên có thiết lập lương</option>
        {people.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select></div>
      {component && <label className="check-inline"><input type="checkbox" name="active" defaultChecked={component.active} /> Đang áp dụng</label>}
    </div>
    {method === "SALES_TIERS" && <fieldset className="attendance-choices"><legend>Bậc thưởng theo doanh thu đã giao của nhân viên kinh doanh</legend>
      <p className="muted">Doanh thu trong kỳ đạt bậc cao nhất nào thì cả doanh thu tính theo % của bậc đó.</p>
      <div className="payroll-tiers">{rows.map((tier, index) => <div className="form-grid" key={index}>
        <div className="field"><label htmlFor={`tfrom-${key}-${index}`}>Doanh thu từ (đ)</label><MoneyInput id={`tfrom-${key}-${index}`} name="tierFrom" defaultValue={tier?.from_vnd ?? ""} /></div>
        <div className="field"><label htmlFor={`trate-${key}-${index}`}>Thưởng (%)</label><input id={`trate-${key}-${index}`} name="tierPercent" inputMode="decimal" defaultValue={tier ? bpsToPercent(tier.rate_bps) : ""} /></div>
      </div>)}</div>
    </fieldset>}
  </CommandForm>;
}

export function PayrollHolidayForm({ day, name, remove }: { day?: string; name?: string; remove?: boolean }) {
  return <CommandForm action={savePayrollHolidayAction} submit={remove ? "Bỏ ngày lễ" : "Lưu ngày lễ"} danger={remove}>
    {remove ? <>
      <input type="hidden" name="day" value={day} /><input type="hidden" name="name" value={name} /><input type="hidden" name="active" value="off" />
      <p className="muted">Làm thêm vào ngày này sẽ tính theo hệ số ngày thường / ngày nghỉ tuần.</p>
    </> : <div className="form-grid">
      <div className="field"><label htmlFor="holiday-day">Ngày</label><input id="holiday-day" type="date" name="day" defaultValue={day} required /></div>
      <div className="field"><label htmlFor="holiday-name">Tên ngày lễ</label><input id="holiday-name" name="name" defaultValue={name} placeholder="Quốc khánh" maxLength={80} required /></div>
    </div>}
  </CommandForm>;
}

export function CreatePayrollForm({ from, to, name }: { from: string; to: string; name: string }) {
  const router = useRouter();
  return <CommandForm<PayrollFormState> action={createPayrollAction} submit="Lập bảng lương" onSaved={(state) => { if (state?.payrollId) router.push(`/admin/payroll/${state.payrollId}`); }}>
    <div className="form-grid">
      <div className="field field-full"><label htmlFor="payroll-name">Tên bảng lương</label><input id="payroll-name" name="name" defaultValue={name} maxLength={80} required /></div>
      <div className="field"><label htmlFor="payroll-from">Từ ngày</label><input id="payroll-from" type="date" name="fromDate" defaultValue={from} required /></div>
      <div className="field"><label htmlFor="payroll-to">Đến ngày</label><input id="payroll-to" type="date" name="toDate" defaultValue={to} required /></div>
    </div>
    <p className="muted">Bảng lương tạm tính từ chấm công, thiết lập lương và các khoản thu nhập khác; tính lại được cho tới khi chốt.</p>
  </CommandForm>;
}

export function PayrollCommandForm({ kind, payrollId, version }: { kind: "recalculate" | "close" | "cancel"; payrollId: string; version: number }) {
  const action = kind === "recalculate" ? recalculatePayrollAction : kind === "close" ? closePayrollAction : cancelPayrollAction;
  return <CommandForm action={action} submit={kind === "recalculate" ? "Tính lại" : kind === "close" ? "Chốt bảng lương" : "Hủy bảng lương"} danger={kind === "cancel"}>
    <input type="hidden" name="payrollId" value={payrollId} />
    <input type="hidden" name="version" value={version} />
    {kind === "close" && <p className="muted">Cần chốt chấm công đủ các ngày của kỳ. Hệ thống tính lại lần cuối rồi ghi mỗi phiếu lương thành khoản phải trả nhân viên; sau khi chốt không sửa được.</p>}
    {kind === "cancel" && <p className="muted">Bảng lương tạm tính bị hủy; có thể lập lại cho cùng kỳ.</p>}
  </CommandForm>;
}

export function AdjustPayrollLineForm({ lineId, bonus, deduction, note }: { lineId: string; bonus: string; deduction: string; note: string | null }) {
  return <CommandForm action={adjustPayrollLineAction} submit="Lưu">
    <input type="hidden" name="lineId" value={lineId} />
    <div className="form-grid">
      <div className="field"><label htmlFor={`bonus-${lineId}`}>Cộng thêm (thưởng nóng…)</label><MoneyInput id={`bonus-${lineId}`} name="bonus" defaultValue={bonus === "0" ? "" : bonus} /></div>
      <div className="field"><label htmlFor={`ded-${lineId}`}>Trừ (tạm ứng, bồi thường…)</label><MoneyInput id={`ded-${lineId}`} name="deduction" defaultValue={deduction === "0" ? "" : deduction} /></div>
      <div className="field field-full"><label htmlFor={`note-${lineId}`}>Ghi chú</label><input id={`note-${lineId}`} name="note" defaultValue={note ?? ""} maxLength={300} /></div>
    </div>
  </CommandForm>;
}
