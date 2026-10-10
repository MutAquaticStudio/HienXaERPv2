import { formatQuantity } from "@/lib/core/quantity";
import { earningTypeLabel, earningClassificationLabel, recognitionKindLabel } from "@/modules/workforce/presentation";
import { financeStateLabel } from "@/modules/finance/presentation";
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import { randomUUID } from "node:crypto";
import { configureRecognitionAction } from "@/modules/workforce/recognition-action";
import { EarningSourceTrace, type EarningSource } from "@/modules/workforce/earning-source-trace";
import { ActionNotice } from "@/components/sales/action-notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { VerifiedWorkEarningForm, type VerifiedWorkRule } from "@/modules/workforce/verified-work-earning-form";
import {
  approveEarningAction, calculateEarningAction, createCompensationRuleAction,
  payEarningAction, recordCompensationBasisAction,
} from "@/modules/workforce/actions";

type Earning = EarningSource & {
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
  const results = await Promise.all([
    supabase.from("earning_event_read").select("*").eq("branch_id", access.branchId).order("created_at", { ascending: false }),
    supabase.from("compensation_rules").select("id, code, name, version, employee_id, earning_type, calculation_kind, effective_from, effective_to").eq("branch_id", access.branchId).order("created_at", { ascending: false }),
    supabase.from("compensation_manual_bases").select("id, employee_id, basis_type, basis_quantity, period_start, period_end, description").eq("branch_id", access.branchId).order("recorded_at", { ascending: false }),
    supabase.from("workforce_read").select("id, code, display_name").eq("branch_id", access.branchId).eq("active", true).order("display_name"),
    supabase.from("finance_accounts").select("id, code, name").eq("branch_id", access.branchId).eq("active", true).order("name"),
  ]);
  if (results.some((result) => result.error)) {
    throw new Error("Không tải được dữ liệu thu nhập. Vui lòng thử lại hoặc liên hệ quản trị viên.");
  }
  const [{ data }, { data: rules }, { data: bases }, { data: workers }, { data: accounts }] = results;
  const rows = (data ?? []) as Earning[];
  const workerOptions = [...new Map((workers ?? []).map((worker) => [worker.id, worker] as const)).values()];
  const { data: recognitionPolicies, error: recognitionError } = await supabase.from("compensation_recognition_policies").select("rule_id, recognition_kind, effective_at").eq("branch_id", access.branchId);
  if (recognitionError) throw new Error("Không tải được cấu hình ghi nhận thu nhập.");
  const canManage = access.permissions.has("compensation.manage");
  const canApprove = access.permissions.has("compensation.approve");
  const canPay = access.permissions.has("finance.payment.post");
  return <>
    <header className="page-heading"><div><p className="eyebrow">Sổ thu nhập nhân sự</p><h1>Thu nhập, lương và hoa hồng</h1><p className="lede">Mỗi khoản thu nhập lưu căn cứ tính, quy tắc áp dụng và lịch sử duyệt. Khoản chi trả được ghi nhận riêng.</p></div></header>
    <ActionNotice notice={query.notice} error={query.error} />
    {canManage && canApprove && <details className="card card-pad quick-create"><summary>Phê duyệt ghi nhận tự động theo sự kiện</summary>
      <p>Áp dụng cho nghiệp vụ phát sinh sau thời điểm hiệu lực. Quy tắc và lịch sử phê duyệt được lưu đầy đủ.</p>
      <form className="command-panel" action={configureRecognitionAction}>
        <input type="hidden" name="operationId" value={randomUUID()} />
        <div className="field"><label>Quy tắc và phiên bản áp dụng</label><select name="ruleId" required><option value="">Chọn quy tắc</option>{(rules ?? []).filter(r => r.employee_id && !recognitionPolicies?.some(p => p.rule_id === r.id)).map(r => <option key={r.id} value={r.id}>{r.code} · Phiên bản {r.version}</option>)}</select></div>
        <div className="field"><label>Sự kiện ghi nhận</label><select name="recognitionKind"><option value="WORK_ITEM_VERIFICATION">Chủ doanh nghiệp xác minh kết quả thợ</option><option value="AR_PAYMENT_ALLOCATION">Phân bổ tiền thu vào công nợ do nhân viên kinh doanh phụ trách</option></select></div>
        <div className="field"><label>Hiệu lực (giờ Việt Nam)</label><input name="effectiveAt" type="datetime-local" required /></div>
        <button type="submit" className="button button-primary">Phê duyệt ghi nhận tự động</button>
      </form>
      <ul>{recognitionPolicies?.map(p => <li key={p.rule_id}>{recognitionKindLabel(p.recognition_kind)} · {formatBusinessDateTime(p.effective_at)} · {rules?.find(rule => rule.id === p.rule_id)?.code ?? "Quy tắc đã chọn"}</li>)}</ul>
    </details>}
    {canManage && <VerifiedWorkEarningForm branchId={access.branchId} rules={(rules ?? []) as VerifiedWorkRule[]} />}
    {canManage && <div className="two-column">
      <details className="card card-pad quick-create"><summary>Tạo phiên bản quy tắc</summary>
        <form className="command-panel" action={createCompensationRuleAction}>
          <input type="hidden" name="operationId" value={randomUUID()} />
          <div className="field"><label>Mã quy tắc</label><input name="code" required /></div>
          <div className="field"><label>Tên quy tắc</label><input name="name" required /></div>
          <div className="field"><label>Nhân viên áp dụng</label><select name="employeeId"><option value="">Toàn chi nhánh</option>{workerOptions.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.display_name}</option>)}</select></div>
          <div className="field"><label>Căn cứ tính</label><select name="earningType">{earningTypes.map((item) => <option key={item} value={item}>{earningTypeLabel(item)}</option>)}</select></div>
          <div className="field"><label>Cách tính</label><select name="calculationKind"><option value="FIXED_PER_BASIS">Số tiền theo mỗi đơn vị căn cứ</option><option value="PERCENT_BPS">Tỷ lệ phần trăm (100 điểm = 1%)</option></select></div>
          <div className="field"><label>Mức tính (VND hoặc điểm phần trăm)</label><input name="rate" inputMode="decimal" required /></div>
          <div className="field"><label>Phân loại</label><select name="classification"><option value="DIRECT_LABOR">Chi phí trực tiếp</option><option value="OPEX">Chi phí vận hành</option><option value="SALES_COMMISSION">Hoa hồng bán hàng</option></select></div>
          <div className="field"><label>Hiệu lực từ</label><input type="date" name="effectiveFrom" defaultValue={currentDate()} required /></div>
          <div className="field"><label>Hiệu lực đến</label><input type="date" name="effectiveTo" /></div>
          <button className="button button-primary" type="submit">Tạo phiên bản quy tắc mới</button>
        </form>
      </details>
      <details className="card card-pad quick-create"><summary>Ghi căn cứ tính thủ công</summary>
        <form className="command-panel" action={recordCompensationBasisAction}>
          <input type="hidden" name="operationId" value={randomUUID()} />
          <div className="field"><label>Nhân viên</label><select name="employeeId" required><option value="">Chọn người</option>{workerOptions.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></div>
          <div className="field"><label>Loại căn cứ tính</label><select name="basisType">{["FIXED_MONTHLY", "PER_SHIFT", "PER_DAY", "BONUS", "ADJUSTMENT"].map(type => <option key={type} value={type}>{earningTypeLabel(type)}</option>)}</select></div>
          <div className="field"><label>Số lượng theo căn cứ</label><input name="basisQuantity" defaultValue="1" inputMode="decimal" required /></div>
          <div className="field"><label>Từ ngày</label><input type="date" name="periodStart" defaultValue={currentDate()} required /></div>
          <div className="field"><label>Đến ngày</label><input type="date" name="periodEnd" defaultValue={currentDate()} required /></div>
          <div className="field"><label>Mã khoản thu nhập cần điều chỉnh</label><input name="adjustsEarningId" placeholder="Bắt buộc khi điều chỉnh" /></div>
          <div className="field"><label>Mã minh chứng</label><input name="evidenceId" /></div>
          <div className="field field-full"><label>Căn cứ</label><textarea name="description" minLength={3} required /></div>
          <button className="button button-primary" type="submit">Ghi căn cứ tính</button>
        </form>
      </details>
    </div>}
    {canManage && !!bases?.length && <section className="card card-pad"><div className="section-head"><h2>Căn cứ tính thủ công</h2><span className="scope-chip">Chọn cách tính phù hợp</span></div>
      <ul className="clean-list">{bases.map((basis) => <li key={basis.id}><strong>{earningTypeLabel(basis.basis_type)} · {formatQuantity(String(basis.basis_quantity))}</strong><small>{basis.description} · {formatBusinessDate(basis.period_start)} → {formatBusinessDate(basis.period_end)}</small>
        <form className="inline-actions" action={calculateEarningAction}><input type="hidden" name="sourceKind" value="MANUAL_BASIS" /><input type="hidden" name="sourceId" value={basis.id} /><input type="hidden" name="returnTo" value="/admin/compensation" /><input type="hidden" name="operationId" value={randomUUID()} /><select name="ruleId" required><option value="">Quy tắc cùng loại căn cứ</option>{(rules ?? []).filter((rule) => rule.earning_type === basis.basis_type).map((rule) => <option key={rule.id} value={rule.id}>{rule.code} · Phiên bản {rule.version}</option>)}</select><button className="button button-secondary" type="submit">Tính thu nhập</button></form>
      </li>)}</ul>
    </section>}
    <section className="card"><div className="section-head"><h2>{rows.length} khoản thu nhập</h2><span className="scope-chip">Lưu đầy đủ lịch sử</span></div>
      <div className="table-wrap"><table><thead><tr><th>Nhân viên / nguồn</th><th>Quy tắc</th><th>Căn cứ tính</th><th>Tính toán</th><th>Duyệt</th><th>Phải trả</th><th>Thao tác</th></tr></thead><tbody>
        {rows.map((earning) => <tr key={earning.id}>
          <td>{earning.employee_name}<EarningSourceTrace source={earning} /></td>
          <td>{earning.rule_code_snapshot} · Phiên bản {earning.rule_version_snapshot}<small className="table-subline">{earningTypeLabel(earning.earning_type)} · {earningClassificationLabel(earning.classification)}</small></td>
          <td className="mono">{formatQuantity(String(earning.basis_quantity))}</td><td className="mono">{formatVnd(vnd(String(earning.calculated_amount_vnd)))}</td>
          <td><StatusBadge tone={earning.approval_state === "APPROVED" ? "success" : "warning"}>{financeStateLabel(earning.approval_state)}</StatusBadge></td>
          <td className="mono">{earning.approval_state === "APPROVED" ? formatVnd(vnd(String(earning.outstanding_amount_vnd))) : "-"}</td>
          <td>
            {earning.approval_state === "DRAFT" && canApprove && <form className="command-panel" action={approveEarningAction}><input type="hidden" name="earningId" value={earning.id} /><input type="hidden" name="version" value={earning.version} /><input type="hidden" name="operationId" value={randomUUID()} /><input type="hidden" name="approvedAmount" value={earning.calculated_amount_vnd} /><input type="date" name="dueDate" defaultValue={currentDate()} required /><button className="button button-secondary" type="submit">Duyệt và ghi công nợ phải trả</button></form>}
            {earning.payable_obligation_id && BigInt(earning.outstanding_amount_vnd) > 0n && canPay && !!accounts?.length && <details><summary>Chi trả</summary><form className="command-panel" action={payEarningAction}><input type="hidden" name="employeeId" value={earning.employee_id} /><input type="hidden" name="obligationId" value={earning.payable_obligation_id} /><input type="hidden" name="operationId" value={randomUUID()} /><div className="field"><label>Tài khoản</label><select name="accountId">{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></div><div className="field"><label>Số tiền</label><input name="amount" defaultValue={earning.outstanding_amount_vnd} inputMode="numeric" required /></div><div className="field"><label>Ngày chi</label><input type="datetime-local" name="effectiveAt" defaultValue={localNow()} required /></div><div className="field"><label>Phương thức</label><select name="method"><option value="BANK_TRANSFER">Chuyển khoản</option><option value="CASH">Tiền mặt</option><option value="OTHER">Khác</option></select></div><div className="field"><label>Tham chiếu</label><input name="reference" /></div><button className="button button-primary" type="submit">Ghi chi trả</button></form></details>}
          </td>
        </tr>)}
      </tbody></table>{!rows.length && <p className="empty-inline">Chưa có khoản thu nhập.</p>}</div>
    </section>
  </>;
}
