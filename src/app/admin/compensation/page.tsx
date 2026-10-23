import Decimal from "decimal.js";
import { formatQuantity } from "@/lib/core/quantity";
import { earningTypeLabel, earningClassificationLabel, recognitionKindLabel } from "@/modules/workforce/presentation";
import { financeStateLabel } from "@/modules/finance/presentation";
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import { randomUUID } from "node:crypto";
import { configureRecognitionAction, postMonthlySalariesAction } from "@/modules/workforce/recognition-action";
import { EarningSourceTrace, type EarningSource } from "@/modules/workforce/earning-source-trace";
import { ActionNotice } from "@/components/sales/action-notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { VerifiedWorkEarningForm, type VerifiedWorkRule } from "@/modules/workforce/verified-work-earning-form";
import { CommissionReviewForm } from "@/modules/workforce/commission-review-form";
import { CommandRecoveryNotice } from "@/components/reliable-command-form";
import { FormDialog } from "@/components/ui/form-dialog";
import {
  approveEarningAction, calculateEarningAction, createCompensationRuleAction,
  payEarningAction, recordCompensationBasisAction,
} from "@/modules/workforce/actions";
import { MoneyInput } from "@/components/ui/money-input";

type Earning = EarningSource & {
  id: string; employee_id: string; employee_name: string; rule_code_snapshot: string;
  rule_version_snapshot: number; earning_type: string; classification: string; source_key: string;
  basis_quantity: string; calculated_amount_vnd: string; approval_state: string; version: number; basis_quantity_policy: string | null;
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
    supabase.from("earning_event_read").select("id,branch_id,employee_id,employee_name,rule_id,rule_code_snapshot,rule_version_snapshot,earning_type,classification,source_key,basis_quantity::text,basis_amount_vnd::text,rate_vnd_per_unit_snapshot::text,rate_bps_snapshot,calculated_amount_vnd::text,approved_amount_vnd::text,approval_state,version,created_at,approved_at,service_verification_id,work_item_verification_id,sales_order_id,manual_basis_id,payable_obligation_id,outstanding_amount_vnd::text,payment_allocation_id,reverses_earning_event_id,payment_id,receivable_obligation_id,allocated_at,payment_number,payment_effective_at,work_item_result_id,work_item_id,work_verified_at,recognition_effective_at,delivery_id,basis_quantity_policy").eq("branch_id", access.branchId).order("created_at", { ascending: false }),
    supabase.from("compensation_rules").select("id, code, name, version, employee_id, earning_type, calculation_kind, classification, rate_vnd_per_unit::text, rate_bps, effective_from, effective_to").eq("branch_id", access.branchId).order("created_at", { ascending: false }),
    supabase.from("compensation_manual_bases").select("id, employee_id, basis_type, basis_quantity, period_start, period_end, description").eq("branch_id", access.branchId).order("recorded_at", { ascending: false }),
    supabase.from("workforce_read").select("id, code, display_name").eq("branch_id", access.branchId).eq("active", true).order("display_name"),
    supabase.from("finance_accounts").select("id, code, name").eq("branch_id", access.branchId).eq("active", true).order("name"),
    supabase.from("commission_reconciliation_cases").select("id, employee_id, original_earning_event_id, reduction_amount_vnd::text, reason, recorded_at")
      .eq("branch_id", access.branchId).order("recorded_at", { ascending: false }).limit(25),
  ]);
  if (results.some((result) => result.error)) {
    throw new Error("Không tải được dữ liệu thu nhập. Vui lòng thử lại hoặc liên hệ quản trị viên.");
  }
  const [{ data }, { data: rules }, { data: bases }, { data: workers }, { data: accounts }, { data: commissionReviews }] = results;
  const reviewIds = (commissionReviews ?? []).map(item => item.id);
  const resolutionsResult = reviewIds.length ? await supabase.from("commission_review_resolutions").select("id, case_id, resolution_kind, reason, recorded_at").in("case_id", reviewIds).eq("branch_id", access.branchId) : { data: [], error: null };
  if (resolutionsResult.error) throw new Error("Không thể tải quyết định đối chiếu hoa hồng.");
  const resolutions = new Map((resolutionsResult.data ?? []).map(item => [item.case_id, item]));
  const rows = (data ?? []) as Earning[];
  const workerOptions = [...new Map((workers ?? []).map((worker) => [worker.id, worker] as const)).values()];
  const { data: recognitionPolicies, error: recognitionError } = await supabase.from("compensation_recognition_policies").select("rule_id, employee_id, recognition_kind, effective_at").eq("branch_id", access.branchId);
  if (recognitionError) throw new Error("Không tải được cấu hình ghi nhận thu nhập.");
  const recognitionScope = (employeeId?: string | null) => employeeId ? workerOptions.find(worker => worker.id === employeeId)?.display_name ?? "Một nhân viên" : "Mọi thợ";
  const canManage = access.permissions.has("compensation.manage");
  const canApprove = access.permissions.has("compensation.approve");
  const canPay = access.permissions.has("finance.payment.post");
  return <>
    <header className="page-heading"><div><p className="eyebrow">Sổ thu nhập nhân sự</p><h1>Thu nhập, lương và hoa hồng</h1><p className="lede">Mỗi khoản thu nhập lưu căn cứ tính, quy tắc áp dụng và lịch sử duyệt. Khoản chi trả được ghi nhận riêng.</p></div>
      {canManage && <div className="action-cluster">
        <FormDialog label="Ghi căn cứ tính thủ công" title="Ghi căn cứ tính thủ công" buttonClassName="button button-primary" size="lg"
          description="Căn cứ cho lương tháng, ca, ngày, thưởng hoặc điều chỉnh; tính thu nhập từ căn cứ ở mục bên dưới.">
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
        </FormDialog>
        <FormDialog label="Tạo phiên bản quy tắc" title="Tạo phiên bản quy tắc" size="lg"
          description="Mỗi lần đổi mức tính là một phiên bản mới; khoản đã tính giữ phiên bản cũ.">
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
        </FormDialog>
        {canApprove && <FormDialog label="Tính lương tháng" title="Tính lương tháng" buttonClassName="button button-primary"
          description="Tạo khoản lương đã duyệt (ghi phải trả) cho mọi người có quy tắc Lương tháng còn hiệu lực. Bấm lại cùng tháng không tính hai lần.">
          <form className="command-panel" action={postMonthlySalariesAction}>
            <input type="hidden" name="operationId" value={randomUUID()} />
            <div className="field"><label htmlFor="salary-month">Tháng</label><input id="salary-month" name="month" type="month" defaultValue={currentDate().slice(0, 7)} max={currentDate().slice(0, 7)} required /></div>
            <button type="submit" className="button button-primary">Tính lương tháng</button>
          </form>
        </FormDialog>}
        {canApprove && <FormDialog label="Hoa hồng tự động" title="Hoa hồng tự động theo tiền thu" size="lg">
      <p className="muted">Quy tắc Theo chuyến / Theo việc tự áp dụng khi việc được xác minh, không cần phê duyệt. Mục này chỉ bật hoa hồng tự tính khi thu tiền khách của nhân viên kinh doanh.</p>
      <form className="command-panel" action={configureRecognitionAction}>
        <input type="hidden" name="operationId" value={randomUUID()} />
        <input type="hidden" name="recognitionKind" value="AR_PAYMENT_ALLOCATION" />
        <div className="field"><label>Quy tắc hoa hồng</label><select name="ruleId" required><option value="">Chọn quy tắc</option>{(rules ?? []).filter(r => r.employee_id && r.earning_type === "SALES_COMMISSION" && !recognitionPolicies?.some(p => p.rule_id === r.id)).map(r => <option key={r.id} value={r.id}>{r.code} · Phiên bản {r.version} · {recognitionScope(r.employee_id)}</option>)}</select></div>
        <div className="field"><label>Hiệu lực (giờ Việt Nam)</label><input name="effectiveAt" type="datetime-local" required /></div>
        <button type="submit" className="button button-primary">Bật hoa hồng tự động</button>
      </form>
      <ul>{recognitionPolicies?.map(p => <li key={p.rule_id}>{recognitionKindLabel(p.recognition_kind)} · {formatBusinessDateTime(p.effective_at)} · {rules?.find(rule => rule.id === p.rule_id)?.code ?? "Quy tắc đã chọn"} · {recognitionScope(p.employee_id)}</li>)}</ul>
        </FormDialog>}
      </div>}
    </header>
    <ActionNotice notice={query.notice} error={query.error} />
    {!!commissionReviews?.length && <section className="card card-pad" id="commission-reconciliation"><h2>Hoa hồng cần đối chiếu theo nguồn</h2>
      <p className="muted">Nguồn thu đã giảm nhưng hoa hồng đã chi hoặc không còn đủ phần chưa thanh toán. Giữ khoản đã duyệt và khoản chi thực tế; đối chiếu nghĩa vụ còn lại trước khi điều chỉnh hoặc chi tiếp.</p>
      <ul className="clean-list">{commissionReviews.map(item => <li key={item.id}><strong>{workers?.find(worker => worker.id === item.employee_id)?.display_name ?? "Nhân viên theo nguồn"} · giảm theo nguồn {formatVnd(vnd(String(item.reduction_amount_vnd)))}</strong>
        <small>{item.reason} · {formatBusinessDateTime(item.recorded_at)} · khoản thu nhập <span className="mono">{item.original_earning_event_id}</span></small>
        <CommandRecoveryNotice command="resolve_commission_reconciliation" scope={`${access.authUserId}:${access.branchId}:COMMISSION:${item.id}`} />
        {resolutions.has(item.id) ? <p>Đã có quyết định: {resolutions.get(item.id)!.resolution_kind === "WAIVE" ? "Không thu hồi theo phê duyệt của chủ doanh nghiệp" : "Đã giảm nguồn hoa hồng còn chưa trả"}. {resolutions.get(item.id)!.reason}</p>
          : canManage && <CommissionReviewForm caseId={item.id} operationId={randomUUID()} scope={`${access.authUserId}:${access.branchId}:COMMISSION:${item.id}`} canWaive={access.permissions.has("roles.manage")}
            targets={rows.filter(row => row.employee_id === item.employee_id && row.classification === "SALES_COMMISSION" && row.approval_state === "APPROVED" && BigInt(String(row.calculated_amount_vnd)) > 0n && BigInt(String(row.outstanding_amount_vnd)) >= BigInt(String(item.reduction_amount_vnd)))
              .map(row => ({ id: row.id, version: row.version, label: row.rule_code_snapshot, remaining: String(row.outstanding_amount_vnd) }))}
            rules={(rules ?? []).filter(rule => rule.earning_type === "ADJUSTMENT" && rule.calculation_kind === "FIXED_PER_BASIS" && rule.classification === "OPEX" && Number(rule.rate_vnd_per_unit) === 1 && rule.effective_from <= currentDate() && (!rule.effective_to || rule.effective_to >= currentDate()) && (!rule.employee_id || rule.employee_id === item.employee_id))
              .map(rule => ({ id: rule.id, label: `${rule.code} · ${rule.name}` }))} />}
        </li>)}</ul>
    </section>}
    {canManage && <VerifiedWorkEarningForm branchId={access.branchId} rules={(rules ?? []) as VerifiedWorkRule[]} />}
    {canManage && !!bases?.length && <section className="card card-pad"><div className="section-head"><h2>Căn cứ tính thủ công</h2><span className="scope-chip">Chọn cách tính phù hợp</span></div>
      <ul className="clean-list">{bases.map((basis) => <li key={basis.id}><strong>{earningTypeLabel(basis.basis_type)} · {formatQuantity(String(basis.basis_quantity))}</strong><small>{basis.description} · {formatBusinessDate(basis.period_start)} → {formatBusinessDate(basis.period_end)}</small>
        <form className="inline-actions" action={calculateEarningAction}><input type="hidden" name="sourceKind" value="MANUAL_BASIS" /><input type="hidden" name="sourceId" value={basis.id} /><input type="hidden" name="returnTo" value="/admin/compensation" /><input type="hidden" name="operationId" value={randomUUID()} /><select name="ruleId" required><option value="">Quy tắc cùng loại căn cứ</option>{(rules ?? []).filter((rule) => rule.earning_type === basis.basis_type).map((rule) => <option key={rule.id} value={rule.id}>{rule.code} · Phiên bản {rule.version}</option>)}</select><button className="button button-secondary" type="submit">Tính thu nhập</button></form>
      </li>)}</ul>
    </section>}
    {!!rules?.length && <section className="card list-main"><div className="section-head"><h2>Quy tắc thu nhập</h2><span className="scope-chip">{rules.length} phiên bản</span></div>
      <div className="table-wrap"><table><thead><tr><th>Quy tắc</th><th>Áp dụng</th><th>Căn cứ tính</th><th className="numeric">Mức tính</th><th>Hiệu lực</th></tr></thead><tbody>
        {rules.map((rule) => <tr key={rule.id} className={rule.effective_to && rule.effective_to < currentDate() ? "row-muted" : undefined}>
          <td><strong>{rule.code}</strong> · Phiên bản {rule.version}<small className="table-subline">{rule.name}</small></td>
          <td>{rule.employee_id ? workerOptions.find((worker) => worker.id === rule.employee_id)?.display_name ?? "Nhân viên đã chọn" : "Toàn chi nhánh"}</td>
          <td>{earningTypeLabel(rule.earning_type)}<small className="table-subline">{earningClassificationLabel(rule.classification)}</small></td>
          <td className="numeric mono">{rule.calculation_kind === "PERCENT_BPS" ? `${formatQuantity(new Decimal(rule.rate_bps ?? 0).div(100).toFixed())}%` : `${formatQuantity(String(rule.rate_vnd_per_unit ?? "0"))} ₫ / đơn vị`}</td>
          <td>{formatBusinessDate(rule.effective_from)} → {rule.effective_to ? formatBusinessDate(rule.effective_to) : "không thời hạn"}</td>
        </tr>)}
      </tbody></table></div>
    </section>}
    <section className="card"><div className="section-head"><h2>{rows.length} khoản thu nhập</h2><span className="scope-chip">Lưu đầy đủ lịch sử</span></div>
      <div className="table-wrap"><table><thead><tr><th>Nhân viên / nguồn</th><th>Quy tắc</th><th>Căn cứ tính</th><th>Tính toán</th><th>Duyệt</th><th>Phải trả</th><th>Thao tác</th></tr></thead><tbody>
        {rows.map((earning) => <tr key={earning.id}>
          <td>{earning.employee_name}<EarningSourceTrace source={earning} /></td>
          <td>{earning.rule_code_snapshot} · Phiên bản {earning.rule_version_snapshot}<small className="table-subline">{earningTypeLabel(earning.earning_type)} · {earningClassificationLabel(earning.classification)}</small></td>
          <td className="mono">{formatQuantity(String(earning.basis_quantity))}{earning.basis_quantity_policy === "DURATION_HALF_UP_6" && <small className="table-subline">Giờ quy đổi từ thời gian, làm tròn 6 chữ số trước tính tiền.</small>}</td><td className="mono">{formatVnd(vnd(String(earning.calculated_amount_vnd)))}</td>
          <td><StatusBadge tone={earning.approval_state === "APPROVED" ? "success" : "warning"}>{financeStateLabel(earning.approval_state)}</StatusBadge></td>
          <td className="mono">{earning.approval_state === "APPROVED" ? formatVnd(vnd(String(earning.outstanding_amount_vnd))) : "-"}</td>
          <td>
            {earning.approval_state === "DRAFT" && canApprove && <form className="command-panel" action={approveEarningAction}><input type="hidden" name="earningId" value={earning.id} /><input type="hidden" name="version" value={earning.version} /><input type="hidden" name="operationId" value={randomUUID()} /><input type="hidden" name="approvedAmount" value={earning.calculated_amount_vnd} /><input type="date" name="dueDate" defaultValue={currentDate()} required /><button className="button button-secondary" type="submit">Duyệt và ghi công nợ phải trả</button></form>}
            {earning.payable_obligation_id && BigInt(earning.outstanding_amount_vnd) > 0n && canPay && !!accounts?.length && <details><summary>Chi trả</summary><form className="command-panel" action={payEarningAction}><input type="hidden" name="employeeId" value={earning.employee_id} /><input type="hidden" name="obligationId" value={earning.payable_obligation_id} /><input type="hidden" name="operationId" value={randomUUID()} /><div className="field"><label>Tài khoản</label><select name="accountId">{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></div><div className="field"><label>Số tiền</label><MoneyInput name="amount" defaultValue={earning.outstanding_amount_vnd} required /></div><div className="field"><label>Ngày chi</label><input type="datetime-local" name="effectiveAt" defaultValue={localNow()} required /></div><div className="field"><label>Phương thức</label><select name="method"><option value="BANK_TRANSFER">Chuyển khoản</option><option value="CASH">Tiền mặt</option><option value="OTHER">Khác</option></select></div><div className="field"><label>Tham chiếu</label><input name="reference" /></div><button className="button button-primary" type="submit">Ghi chi trả</button></form></details>}
          </td>
        </tr>)}
      </tbody></table>{!rows.length && <p className="empty-inline">Chưa có khoản thu nhập.</p>}</div>
    </section>
  </>;
}
