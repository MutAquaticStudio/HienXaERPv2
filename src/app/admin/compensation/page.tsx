import Decimal from "decimal.js";
import { formatQuantity } from "@/lib/core/quantity";
import { earningTypeLabel, earningClassificationLabel } from "@/modules/workforce/presentation";
import { financeStateLabel } from "@/modules/finance/presentation";
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { EarningSourceTrace, type EarningSource } from "@/modules/workforce/earning-source-trace";
import { ActionNotice } from "@/components/sales/action-notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { CommissionReviewForm } from "@/modules/workforce/commission-review-form";
import { CommandRecoveryNotice } from "@/components/reliable-command-form";
import { approveEarningAction, payEarningAction } from "@/modules/workforce/actions";
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

export default async function CompensationPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("compensation.read");
  const query = await searchParams;
  const supabase = await createServerSupabase();
  const results = await Promise.all([
    supabase.from("earning_event_read").select("id,branch_id,employee_id,employee_name,rule_id,rule_code_snapshot,rule_version_snapshot,earning_type,classification,source_key,basis_quantity::text,basis_amount_vnd::text,rate_vnd_per_unit_snapshot::text,rate_bps_snapshot,calculated_amount_vnd::text,approved_amount_vnd::text,approval_state,version,created_at,approved_at,service_verification_id,work_item_verification_id,sales_order_id,manual_basis_id,payable_obligation_id,outstanding_amount_vnd::text,payment_allocation_id,reverses_earning_event_id,payment_id,receivable_obligation_id,allocated_at,payment_number,payment_effective_at,work_item_result_id,work_item_id,work_verified_at,recognition_effective_at,delivery_id,basis_quantity_policy").eq("branch_id", access.branchId).order("created_at", { ascending: false }),
    supabase.from("compensation_rules").select("id, code, name, version, employee_id, earning_type, calculation_kind, classification, rate_vnd_per_unit::text, rate_bps, effective_from, effective_to").eq("branch_id", access.branchId).order("created_at", { ascending: false }),
    supabase.from("workforce_read").select("id, code, display_name").eq("branch_id", access.branchId).eq("active", true).order("display_name"),
    supabase.from("finance_accounts").select("id, code, name").eq("branch_id", access.branchId).eq("active", true).order("name"),
    supabase.from("commission_reconciliation_cases").select("id, employee_id, original_earning_event_id, reduction_amount_vnd::text, reason, recorded_at")
      .eq("branch_id", access.branchId).order("recorded_at", { ascending: false }).limit(25),
  ]);
  if (results.some((result) => result.error)) {
    throw new Error("Không tải được dữ liệu thu nhập. Vui lòng thử lại hoặc liên hệ quản trị viên.");
  }
  const [{ data }, { data: rules }, { data: workers }, { data: accounts }, { data: commissionReviews }] = results;
  const reviewIds = (commissionReviews ?? []).map(item => item.id);
  const resolutionsResult = reviewIds.length ? await supabase.from("commission_review_resolutions").select("id, case_id, resolution_kind, reason, recorded_at").in("case_id", reviewIds).eq("branch_id", access.branchId) : { data: [], error: null };
  if (resolutionsResult.error) throw new Error("Không thể tải quyết định đối chiếu hoa hồng.");
  const resolutions = new Map((resolutionsResult.data ?? []).map(item => [item.case_id, item]));
  const rows = (data ?? []) as Earning[];
  const workerOptions = [...new Map((workers ?? []).map((worker) => [worker.id, worker] as const)).values()];
  const canManage = access.permissions.has("compensation.manage");
  const canApprove = access.permissions.has("compensation.approve");
  const canPay = access.permissions.has("finance.payment.post");
  return <>
    <header className="page-heading"><div><p className="eyebrow">Nhân công</p><h1>Thu nhập đã ghi</h1><p className="lede">Tiền chuyến, tiền việc và hoa hồng nay tính trong Bảng lương. Trang này giữ các khoản thu nhập đã ghi (kể cả lương đã chốt) và chi trả phần còn nợ.</p></div>
      <div className="action-cluster"><Link className="button button-primary" href="/admin/payroll">Bảng lương</Link></div>
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
    {!!rules?.length && <section className="card list-main"><div className="section-head"><h2>Quy tắc thu nhập cũ</h2><span className="scope-chip">Không còn tự tính · {rules.length} phiên bản</span></div>
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
