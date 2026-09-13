import { randomUUID } from "node:crypto";
import { ActionNotice } from "@/components/sales/action-notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  approveEarningAction, calculateEarningAction, createCompensationRuleAction,
  payEarningAction, recordCompensationBasisAction,
} from "@/modules/workforce/actions";

type Earning = {
  id: string; employee_id: string; employee_name: string; rule_code_snapshot: string;
  rule_version_snapshot: number; earning_type: string; classification: string; source_key: string;
  basis_quantity: string; calculated_amount_vnd: string; approval_state: string; version: number;
  payable_obligation_id: string | null; outstanding_amount_vnd: string;
};
const currentDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const localNow = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
}).format(new Date()).replace(" ", "T");
const earningTypes = ["FIXED_MONTHLY","PER_JOB","PER_TRIP","PER_HOUR","PER_SHIFT","PER_DAY","PER_TON","PER_M3","PER_BAG","PER_UNIT","BONUS","ADJUSTMENT","SALES_COMMISSION"];

export default async function CompensationPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("compensation.read");
  const query = await searchParams;
  const supabase = await createServerSupabase();
  const [{ data }, { data: rules }, { data: bases }, { data: workers }, { data: accounts }] = await Promise.all([
    supabase.from("earning_event_read").select("*").eq("branch_id", access.branchId).order("created_at", { ascending: false }),
    supabase.from("compensation_rules").select("id, code, name, version, earning_type, calculation_kind").eq("branch_id", access.branchId).order("created_at", { ascending: false }),
    supabase.from("compensation_manual_bases").select("id, employee_id, basis_type, basis_quantity, period_start, period_end, description").eq("branch_id", access.branchId).order("recorded_at", { ascending: false }),
    supabase.from("workforce_read").select("id, code, display_name").eq("branch_id", access.branchId).eq("active", true).order("display_name"),
    supabase.from("finance_accounts").select("id, code, name").eq("branch_id", access.branchId).eq("active", true).order("name"),
  ]);
  const rows = (data ?? []) as Earning[];
  const canManage = access.permissions.has("compensation.manage");
  const canApprove = access.permissions.has("compensation.approve");
  const canPay = access.permissions.has("finance.payment.post");
  return <>
    <header className="page-heading"><div><p className="eyebrow">Compensation ledger</p><h1>Thu nhập, lương và hoa hồng</h1><p className="lede">Mỗi earning giữ source, basis, rule/version và approval; payment chỉ tất toán nghĩa vụ.</p></div></header>
    <ActionNotice notice={query.notice} error={query.error} />
    {canManage && <div className="two-column">
      <details className="card card-pad quick-create"><summary>Tạo phiên bản rule</summary>
        <form className="command-panel" action={createCompensationRuleAction}>
          <input type="hidden" name="operationId" value={randomUUID()} />
          <div className="field"><label>Mã rule</label><input name="code" required /></div>
          <div className="field"><label>Tên rule</label><input name="name" required /></div>
          <div className="field"><label>Nhân viên áp dụng</label><select name="employeeId"><option value="">Toàn chi nhánh</option>{(workers ?? []).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.display_name}</option>)}</select></div>
          <div className="field"><label>Basis</label><select name="earningType">{earningTypes.map((item) => <option key={item}>{item}</option>)}</select></div>
          <div className="field"><label>Calculator</label><select name="calculationKind"><option value="FIXED_PER_BASIS">VND mỗi đơn vị basis</option><option value="PERCENT_BPS">Basis points lợi nhuận</option></select></div>
          <div className="field"><label>Rate VND hoặc bps</label><input name="rate" inputMode="decimal" required /></div>
          <div className="field"><label>Phân loại</label><select name="classification"><option value="DIRECT_LABOR">Chi phí trực tiếp</option><option value="OPEX">Opex</option><option value="SALES_COMMISSION">Hoa hồng sales</option></select></div>
          <div className="field"><label>Hiệu lực từ</label><input type="date" name="effectiveFrom" defaultValue={currentDate()} required /></div>
          <div className="field"><label>Hiệu lực đến</label><input type="date" name="effectiveTo" /></div>
          <button className="button button-primary" type="submit">Tạo rule version mới</button>
        </form>
      </details>
      <details className="card card-pad quick-create"><summary>Ghi basis thủ công</summary>
        <form className="command-panel" action={recordCompensationBasisAction}>
          <input type="hidden" name="operationId" value={randomUUID()} />
          <div className="field"><label>Nhân viên</label><select name="employeeId" required><option value="">Chọn người</option>{(workers ?? []).map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></div>
          <div className="field"><label>Loại basis</label><select name="basisType"><option>FIXED_MONTHLY</option><option>PER_SHIFT</option><option>PER_DAY</option><option>BONUS</option><option>ADJUSTMENT</option></select></div>
          <div className="field"><label>Số lượng basis</label><input name="basisQuantity" defaultValue="1" inputMode="decimal" required /></div>
          <div className="field"><label>Từ ngày</label><input type="date" name="periodStart" defaultValue={currentDate()} required /></div>
          <div className="field"><label>Đến ngày</label><input type="date" name="periodEnd" defaultValue={currentDate()} required /></div>
          <div className="field"><label>Earning bị điều chỉnh</label><input name="adjustsEarningId" placeholder="Bắt buộc với ADJUSTMENT" /></div>
          <div className="field"><label>Evidence ID</label><input name="evidenceId" /></div>
          <div className="field field-full"><label>Căn cứ</label><textarea name="description" minLength={3} required /></div>
          <button className="button button-primary" type="submit">Ghi basis</button>
        </form>
      </details>
    </div>}
    {canManage && !!bases?.length && <section className="card card-pad"><div className="section-head"><h2>Basis thủ công</h2><span className="scope-chip">Calculator explicit</span></div>
      <ul className="clean-list">{bases.map((basis) => <li key={basis.id}><strong>{basis.basis_type} · {basis.basis_quantity}</strong><small>{basis.description} · {basis.period_start} → {basis.period_end}</small>
        <form className="inline-actions" action={calculateEarningAction}><input type="hidden" name="sourceKind" value="MANUAL_BASIS" /><input type="hidden" name="sourceId" value={basis.id} /><input type="hidden" name="returnTo" value="/admin/compensation" /><input type="hidden" name="operationId" value={randomUUID()} /><select name="ruleId" required><option value="">Rule cùng basis</option>{(rules ?? []).filter((rule) => rule.earning_type === basis.basis_type).map((rule) => <option key={rule.id} value={rule.id}>{rule.code} v{rule.version}</option>)}</select><button className="button button-secondary" type="submit">Tính earning</button></form>
      </li>)}</ul>
    </section>}
    <section className="card"><div className="section-head"><h2>{rows.length} EarningEvent</h2><span className="scope-chip">Traceable và append-only</span></div>
      <div className="table-wrap"><table><thead><tr><th>Nhân viên / nguồn</th><th>Rule</th><th>Basis</th><th>Tính toán</th><th>Duyệt</th><th>Phải trả</th><th>Thao tác</th></tr></thead><tbody>
        {rows.map((earning) => <tr key={earning.id}>
          <td>{earning.employee_name}<small className="table-subline mono">{earning.source_key}</small></td>
          <td>{earning.rule_code_snapshot} v{earning.rule_version_snapshot}<small className="table-subline">{earning.earning_type} · {earning.classification}</small></td>
          <td className="mono">{earning.basis_quantity}</td><td className="mono">{formatVnd(vnd(String(earning.calculated_amount_vnd)))}</td>
          <td><StatusBadge tone={earning.approval_state === "APPROVED" ? "success" : "warning"}>{earning.approval_state}</StatusBadge></td>
          <td className="mono">{earning.approval_state === "APPROVED" ? formatVnd(vnd(String(earning.outstanding_amount_vnd))) : "-"}</td>
          <td>
            {earning.approval_state === "DRAFT" && canApprove && <form className="command-panel" action={approveEarningAction}><input type="hidden" name="earningId" value={earning.id} /><input type="hidden" name="version" value={earning.version} /><input type="hidden" name="operationId" value={randomUUID()} /><input type="hidden" name="approvedAmount" value={earning.calculated_amount_vnd} /><input type="date" name="dueDate" defaultValue={currentDate()} required /><button className="button button-secondary" type="submit">Duyệt và tạo AP</button></form>}
            {earning.payable_obligation_id && BigInt(earning.outstanding_amount_vnd) > 0n && canPay && !!accounts?.length && <details><summary>Chi trả</summary><form className="command-panel" action={payEarningAction}><input type="hidden" name="employeeId" value={earning.employee_id} /><input type="hidden" name="obligationId" value={earning.payable_obligation_id} /><input type="hidden" name="operationId" value={randomUUID()} /><div className="field"><label>Tài khoản</label><select name="accountId">{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></div><div className="field"><label>Số tiền</label><input name="amount" defaultValue={earning.outstanding_amount_vnd} inputMode="numeric" required /></div><div className="field"><label>Ngày chi</label><input type="datetime-local" name="effectiveAt" defaultValue={localNow()} required /></div><div className="field"><label>Phương thức</label><select name="method"><option value="BANK_TRANSFER">Chuyển khoản</option><option value="CASH">Tiền mặt</option><option value="OTHER">Khác</option></select></div><div className="field"><label>Tham chiếu</label><input name="reference" /></div><button className="button button-primary" type="submit">Ghi payment</button></form></details>}
          </td>
        </tr>)}
      </tbody></table>{!rows.length && <p className="empty-inline">Chưa có earning event.</p>}</div>
    </section>
  </>;
}
