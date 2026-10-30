import { formatPortalMoney as money, sumPortalMoney } from "@/modules/portal/money";
import { formatBusinessDate } from "@/lib/core/business-time";
import { earningStateLabel, earningKindLabel } from "@/modules/portal/presentation";
import styles from "@/components/portal/portal.module.css";
import { getWorkerPortalSnapshot } from "@/modules/portal/actions";
import { requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { componentKindLabel } from "@/modules/payroll/presentation";

type Payslip = {
  id: string; work_days: string; standard_work_days: string; base_amount_vnd: string; overtime_amount_vnd: string; allowance_vnd: string;
  bonus_vnd: string; deduction_vnd: string; manual_bonus_vnd: string; manual_deduction_vnd: string; manual_note: string | null; net_pay_vnd: string;
  details: Array<{ code: string; name: string; kind: string; amount_vnd: string }>;
  payroll_periods: { name: string; period_start: string; period_end: string } | null;
};

export default async function WorkEarningsPage() {
  const access = await requireInternalAccess("/work/login");
  const snapshot = await getWorkerPortalSnapshot();
  const total = sumPortalMoney(snapshot.earnings.map((item) => item.amount_vnd));
  // FB12 (D34b): the person's closed payslips (the database shows nothing else).
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("payroll_lines")
    .select("id, work_days::text, standard_work_days::text, base_amount_vnd::text, overtime_amount_vnd::text, allowance_vnd::text, bonus_vnd::text, deduction_vnd::text, manual_bonus_vnd::text, manual_deduction_vnd::text, manual_note, net_pay_vnd::text, details, payroll_periods(name, period_start, period_end)")
    .eq("employee_id", access.employeeId).eq("included", true).limit(12);
  const payslips = ((data ?? []) as unknown as Payslip[]).sort((a, b) => (b.payroll_periods?.period_start ?? "").localeCompare(a.payroll_periods?.period_start ?? ""));
  return (
    <div className={styles.page}>
      <header className={`${styles.hero} ${styles.heroDark}`}>
        <p className={styles.heroEyebrow}>Thu nhập đã ghi nhận</p>
        <h1>{money(total)}</h1>
        <p>Chỉ các khoản thu nhập của chính bạn; thanh toán thực tế được theo dõi riêng.</p>
      </header>
      {payslips.length > 0 && <section className={styles.card}>
        <h2>Phiếu lương</h2>
        <ul className={styles.attendanceList}>{payslips.map((slip) => <li key={slip.id}>
          <details className={styles.payslip}>
            <summary><span className={styles.attendanceDay}>{slip.payroll_periods?.name ?? "Kỳ lương"}</span> <strong>{money(slip.net_pay_vnd)}</strong></summary>
            <p className={styles.hint}>{slip.payroll_periods ? `${formatBusinessDate(slip.payroll_periods.period_start)} – ${formatBusinessDate(slip.payroll_periods.period_end)}` : ""} · ngày công {slip.work_days}/{slip.standard_work_days}</p>
            <dl>
              <dt>Lương chính</dt><dd>{money(slip.base_amount_vnd)}</dd>
              <dt>Làm thêm giờ</dt><dd>{money(slip.overtime_amount_vnd)}</dd>
              {slip.details.map((item) => <div key={item.code}><dt>{componentKindLabel(item.kind)}: {item.name}</dt><dd>{item.kind === "DEDUCTION" ? "−" : ""}{money(item.amount_vnd)}</dd></div>)}
              {slip.manual_bonus_vnd !== "0" && <div><dt>Cộng thêm</dt><dd>{money(slip.manual_bonus_vnd)}</dd></div>}
              {slip.manual_deduction_vnd !== "0" && <div><dt>Trừ{slip.manual_note ? ` (${slip.manual_note})` : ""}</dt><dd>−{money(slip.manual_deduction_vnd)}</dd></div>}
              <dt>Thực lĩnh</dt><dd><strong>{money(slip.net_pay_vnd)}</strong></dd>
            </dl>
          </details>
        </li>)}</ul>
      </section>}
      <section className={styles.card} aria-labelledby="earning-list">
        <h2 id="earning-list">Các khoản thu nhập</h2>
        {snapshot.earnings.length ? <ul className={styles.timeline}>{snapshot.earnings.map((item) => <li key={item.id} className={styles.earningRow}>
          <span><strong>{earningKindLabel(item.type)}</strong><small>{item.occurred_at ? formatBusinessDate(item.occurred_at) : ""} · {earningStateLabel(item.state)}</small></span>
          <strong>{money(item.amount_vnd)}</strong>
        </li>)}</ul> : <p className={styles.empty}>Chưa có khoản thu nhập được ghi nhận.</p>}
      </section>
    </div>
  );
}
