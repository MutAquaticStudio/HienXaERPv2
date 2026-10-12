import { formatBusinessDate } from "@/lib/core/business-time";
import { financeStateLabel } from "@/modules/finance/presentation";
import { RecordingScopeNotice } from "@/modules/operations/recording-scope-notice";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ActionNotice } from "@/components/sales/action-notice";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { CORE_LIST_PAGE_SIZE, parseCoreListQuery } from "@/lib/core-list";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { createFinanceAccountAction, reconcilePaymentAction, reversePaymentAction } from "@/modules/finance/actions";

type Payment = { id: string; payment_number: string; direction: string; counterparty_name: string; account_code: string; amount_vnd: string; allocated_amount_vnd: string; advance_amount_vnd: string; unallocated_amount_vnd: string; effective_at: string; posting_state: string; reconciliation_state: string; reconciliation_difference_vnd: string; reversal_of_payment_id: string | null };
function localNow() { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(" ", "T"); }

export default async function CashbookPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string; page?: string }> }) {
  const access = await requireInternalPermission("finance.ar.read");
  const query = await searchParams;
  const list = parseCoreListQuery({ page: query.page });
  const supabase = await createServerSupabase();
  const [paymentsResult, summaryResult, accountsResult, advancesResult] = await Promise.all([
    supabase.from("payment_read").select("id, payment_number, direction, counterparty_name, account_code, amount_vnd::text, allocated_amount_vnd::text, advance_amount_vnd::text, unallocated_amount_vnd::text, effective_at, posting_state, reconciliation_state, reconciliation_difference_vnd::text, reversal_of_payment_id").eq("branch_id", access.branchId).order("effective_at", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to + 1),
    supabase.rpc("cashbook_summary", { target_branch_id: access.branchId }).select("net_cash_vnd::text,unmatched_count").single(),
    supabase.from("finance_accounts").select("id, code, name, account_kind, active").eq("branch_id", access.branchId).order("code"),
    supabase.from("advance_position_read").select("advance_side, counterparty_name, balance_vnd::text").eq("branch_id", access.branchId),
  ]);
  if (paymentsResult.error || summaryResult.error || accountsResult.error || advancesResult.error) throw new Error("Không thể tải sổ tiền đầy đủ.");
  const fetched = (paymentsResult.data ?? []) as Payment[];
  const rows = fetched.slice(0, CORE_LIST_PAGE_SIZE);
  const hasNext = fetched.length > CORE_LIST_PAGE_SIZE;
  const summary = summaryResult.data as { net_cash_vnd: string | number; unmatched_count: number };
  const accounts = accountsResult.data;
  const advances = advancesResult.data;
  return <><header className="page-heading"><div><p className="eyebrow">Tiền mặt và ngân hàng</p><h1>Sổ tiền và đối soát</h1><p className="lede">Theo dõi giao dịch thu chi đã ghi sổ, đối soát và giao dịch đảo.</p></div></header><ActionNotice notice={query.notice} error={query.error} />
    <RecordingScopeNotice branchId={access.branchId} />
    <section className="metric-grid"><article className="card metric-card"><span className="metric-label">Dòng tiền ròng</span><strong className="metric-value">{formatVnd(vnd(String(summary.net_cash_vnd)))}</strong></article><article className="card metric-card"><span className="metric-label">Chưa đối soát</span><strong className="metric-value">{summary.unmatched_count}</strong></article><article className="card metric-card"><span className="metric-label">Tài khoản</span><strong className="metric-value">{(accounts ?? []).length}</strong></article><article className="card metric-card"><span className="metric-label">Vị thế ứng trước</span><strong className="metric-value">{(advances ?? []).length}</strong></article></section>
    {access.permissions.has("finance.account.manage") && <details className="card card-pad quick-create"><summary>Tạo tài khoản tiền</summary><form className="inline-create" action={createFinanceAccountAction}><input type="hidden" name="operationId" value={randomUUID()} /><label>Mã<input name="code" required /></label><label>Tên<input name="name" required /></label><label>Loại<select name="kind"><option value="BANK">Ngân hàng</option><option value="CASH">Tiền mặt</option></select></label><button className="button button-primary" type="submit">Tạo tài khoản</button></form></details>}
    <section className="card"><div className="section-head"><h2>Giao dịch đã ghi sổ</h2><span className="scope-chip">Giao dịch thu chi · {CORE_LIST_PAGE_SIZE} dòng/trang</span></div><div className="table-wrap"><table><thead><tr><th>Mã</th><th>Ngày</th><th>Đối tác</th><th>Tài khoản</th><th>Loại</th><th>Số tiền</th><th>Đối soát</th><th>Hành động</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td className="mono">{item.payment_number}</td><td>{formatBusinessDate(item.effective_at)}</td><td>{item.counterparty_name}</td><td>{item.account_code}</td><td><StatusBadge tone={item.posting_state === "REVERSED" ? "danger" : "info"}>{item.reversal_of_payment_id ? "Đảo giao dịch" : item.direction === "RECEIPT" ? "Thu" : "Chi"}</StatusBadge></td><td className="mono">{formatVnd(vnd(String(item.amount_vnd)))}</td><td><strong>{financeStateLabel(item.reconciliation_state)}</strong><small className="table-subline">Lệch {formatVnd(vnd(String(item.reconciliation_difference_vnd)))}</small></td><td><Link className="code-link" href={`/api/payments/${item.id}/voucher/pdf`}>{item.direction === "RECEIPT" ? "Phiếu thu" : "Phiếu chi"}</Link>{item.posting_state === "POSTED" && !item.reversal_of_payment_id && <details><summary>Xử lý</summary>{access.permissions.has("finance.reconcile") && item.reconciliation_state !== "MATCHED" && <form className="mini-command" action={reconcilePaymentAction}><input type="hidden" name="paymentId" value={item.id} /><input type="hidden" name="operationId" value={randomUUID()} /><input name="amount" placeholder="Số tiền đối soát" required /><input type="datetime-local" name="effectiveAt" defaultValue={localNow()} required /><input name="reference" placeholder="Mã dòng ngân hàng" required /><button className="button button-secondary" type="submit">Ghi đối soát</button></form>}{access.permissions.has("finance.payment.reverse") && <form className="mini-command" action={reversePaymentAction}><input type="hidden" name="paymentId" value={item.id} /><input type="hidden" name="operationId" value={randomUUID()} /><input name="reason" minLength={3} placeholder="Lý do đảo" required /><button className="button button-danger" type="submit">Đảo giao dịch</button></form>}</details>}</td></tr>)}</tbody></table>{!rows.length && <p className="empty-inline">Chưa có giao dịch tiền.</p>}</div><ListPager page={list.page} hasNext={hasNext} params={{}} /></section>
  </>;
}
