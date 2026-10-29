import { formatBusinessDate, parseBusinessDateTime } from "@/lib/core/business-time";
import { financeStateLabel } from "@/modules/finance/presentation";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { PartyPaymentLauncher } from "@/components/finance/party-payment-launcher";
import { ActionNotice } from "@/components/sales/action-notice";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";
import { FormDialog } from "@/components/ui/form-dialog";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricNumber } from "@/components/ui/metric-number";
import { requireInternalPermission } from "@/lib/access/context";
import { CORE_LIST_PAGE_SIZE, parseCoreListQuery } from "@/lib/core-list";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { createFinanceAccountAction, reconcilePaymentAction, reversePaymentAction } from "@/modules/finance/actions";
import { MoneyInput } from "@/components/ui/money-input";
import { CsvDownloadButton } from "@/components/ui/csv-download-button";
import { toCsv } from "@/lib/core/csv";

type Payment = { id: string; payment_number: string; direction: string; counterparty_name: string; account_code: string; amount_vnd: string; allocated_amount_vnd: string; advance_amount_vnd: string; unallocated_amount_vnd: string; effective_at: string; posting_state: string; reconciliation_state: string; reconciliation_difference_vnd: string; reversal_of_payment_id: string | null };
type Period = { opening_vnd: string; receipts_vnd: string; disbursements_vnd: string; closing_vnd: string; payment_count: number };
type Query = { notice?: string; error?: string; page?: string; from?: string; to?: string; account?: string; direction?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;
function localNow() { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(" ", "T"); }

/** The business-day period of the filter: this month so far unless chosen; `to` is the last day included. */
function period(query: Query) {
  const today = localNow().slice(0, 10);
  const valid = (value?: string) => !!value && DATE.test(value) && parseBusinessDateTime(`${value}T00:00`) !== null;
  const from = valid(query.from) ? query.from! : `${today.slice(0, 8)}01`;
  const to = valid(query.to) && query.to! >= from ? query.to! : today >= from ? today : from;
  const fromAt = parseBusinessDateTime(`${from}T00:00`)!;
  const toAt = new Date(Date.parse(parseBusinessDateTime(`${to}T00:00`)!) + 86_400_000).toISOString();
  return { from, to, fromAt, toAt };
}

/**
 * Sổ quỹ (FB2 Đợt 6, KiotViet style): opening, receipts, disbursements and closing for the period and account, the
 * posted receipts and payments of that period, and their reconciliation and reversal in popups.
 */
export default async function CashbookPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("finance.ar.read");
  const query = await searchParams;
  const list = parseCoreListQuery({ page: query.page });
  const range = period(query);
  const accountId = UUID.test(query.account ?? "") ? query.account! : "";
  const direction = query.direction === "RECEIPT" || query.direction === "DISBURSEMENT" ? query.direction : "";
  const can = { post: access.permissions.has("finance.payment.post"), payables: access.permissions.has("finance.ap.read"), reconcile: access.permissions.has("finance.reconcile"), reverse: access.permissions.has("finance.payment.reverse"), expense: access.permissions.has("finance.expense.manage") };
  const supabase = await createServerSupabase();
  let paymentRequest = supabase.from("payment_read").select("id, payment_number, direction, counterparty_name, account_code, amount_vnd::text, allocated_amount_vnd::text, advance_amount_vnd::text, unallocated_amount_vnd::text, effective_at, posting_state, reconciliation_state, reconciliation_difference_vnd::text, reversal_of_payment_id")
    .eq("branch_id", access.branchId).gte("effective_at", range.fromAt).lt("effective_at", range.toAt);
  if (accountId) paymentRequest = paymentRequest.eq("account_id", accountId);
  if (direction) paymentRequest = paymentRequest.eq("direction", direction);
  // FB12 (D34c): the whole filtered period (up to 2.000 rows) for "Xuất file".
  let exportRequest = supabase.from("payment_read").select("payment_number, direction, counterparty_name, account_code, amount_vnd::text, effective_at, posting_state, reconciliation_state")
    .eq("branch_id", access.branchId).gte("effective_at", range.fromAt).lt("effective_at", range.toAt);
  if (accountId) exportRequest = exportRequest.eq("account_id", accountId);
  if (direction) exportRequest = exportRequest.eq("direction", direction);
  const none = Promise.resolve({ data: [] as never[], error: null });
  const [paymentsResult, summaryResult, periodResult, accountsResult, advancesResult, customerResult, supplierResult, nonCashResult, exportResult] = await Promise.all([
    paymentRequest.order("effective_at", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to + 1),
    supabase.rpc("cashbook_summary", { target_branch_id: access.branchId }).select("net_cash_vnd::text,unmatched_count").single(),
    supabase.rpc("cashbook_period_summary", { target_branch_id: access.branchId, from_at: range.fromAt, to_at: range.toAt, target_account_id: accountId || null }),
    supabase.from("finance_accounts").select("id, code, name, account_kind, active").eq("branch_id", access.branchId).order("code"),
    supabase.from("advance_position_read").select("advance_side, counterparty_name, balance_vnd::text").eq("branch_id", access.branchId),
    can.post ? supabase.from("customers").select("id, code, display_name").eq("branch_id", access.branchId).eq("active", true).order("display_name").limit(1000) : none,
    can.post && can.payables ? supabase.from("suppliers").select("id, code, name").eq("branch_id", access.branchId).eq("active", true).order("name").limit(1000) : none,
    // FB7: losses found by stock counts are expenses that move no money; listed beside the cash, never in its balance.
    access.permissions.has("finance.expense.read") ? supabase.from("expense_read").select("id, expense_number, category_name, description, amount_vnd::text, effective_at")
      .eq("branch_id", access.branchId).eq("settlement", "NON_CASH").gte("effective_at", range.fromAt).lt("effective_at", range.toAt).order("effective_at", { ascending: false }).limit(50) : none,
    exportRequest.order("effective_at", { ascending: true }).limit(2000),
  ]);
  if (paymentsResult.error || summaryResult.error || periodResult.error || accountsResult.error || advancesResult.error) throw new Error("Không thể tải sổ quỹ đầy đủ.");
  const fetched = (paymentsResult.data ?? []) as Payment[];
  const rows = fetched.slice(0, CORE_LIST_PAGE_SIZE);
  const hasNext = fetched.length > CORE_LIST_PAGE_SIZE;
  const summary = summaryResult.data as { net_cash_vnd: string | number; unmatched_count: number };
  const totals = periodResult.data as Period;
  const accounts = accountsResult.data ?? [];
  const advances = advancesResult.data;
  const customers = ((customerResult.data ?? []) as { id: string; code: string; display_name: string }[]).map((row) => ({ id: row.id, code: row.code, name: row.display_name }));
  const suppliers = (supplierResult.data ?? []) as { id: string; code: string; name: string }[];
  const money = (value: string) => formatVnd(vnd(String(value)));
  const nonCash = (nonCashResult.data ?? []) as { id: string; expense_number: string; category_name: string; description: string; amount_vnd: string; effective_at: string }[];
  const nonCashTotal = nonCash.reduce((sum, item) => sum + BigInt(item.amount_vnd), 0n);
  const filtered = Boolean(query.from || query.to || accountId || direction);
  const params = { from: query.from ? range.from : undefined, to: query.to ? range.to : undefined, account: accountId || undefined, direction: direction || undefined };
  // FB12 (D34c): KiotViet-style quick periods and one tab per money account ("Tổng quỹ", "Tiền mặt", each bank).
  const href = (next: Partial<Record<"from" | "to" | "account" | "direction", string | undefined>>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, ...next })) if (value) search.set(key, value);
    const text = search.toString();
    return text ? `/admin/cashbook?${text}` : "/admin/cashbook";
  };
  const today = localNow().slice(0, 10);
  const shiftDay = (day: string, delta: number) => new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
  const lastMonthEnd = shiftDay(`${today.slice(0, 8)}01`, -1);
  const presets = [
    { label: "Hôm nay", from: today, to: today },
    { label: "Tuần này", from: shiftDay(today, 1 - weekday), to: today },
    { label: "Tháng này", from: `${today.slice(0, 8)}01`, to: today },
    { label: "Tháng trước", from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd },
  ];
  const exportRows = ((exportResult.data ?? []) as Array<{ payment_number: string; direction: string; counterparty_name: string; account_code: string; amount_vnd: string; effective_at: string; posting_state: string; reconciliation_state: string }>);
  const csv = toCsv(exportRows.map((item) => ({
    number: item.payment_number, date: formatBusinessDate(item.effective_at), kind: item.direction === "RECEIPT" ? "Thu" : "Chi", party: item.counterparty_name,
    account: item.account_code, amount: `${item.direction === "RECEIPT" ? "" : "-"}${item.amount_vnd}`, state: financeStateLabel(item.reconciliation_state),
  })), [["number", "Mã phiếu"], ["date", "Ngày"], ["kind", "Loại"], ["party", "Người nộp / nhận"], ["account", "Tài khoản"], ["amount", "Số tiền (đ)"], ["state", "Đối soát"]]);

  return <div className="page-stack"><header className="page-heading"><div><p className="eyebrow">Tiền mặt và ngân hàng</p><h1>Sổ quỹ</h1><p className="lede">Thu chi đã ghi sổ theo kỳ và tài khoản, đối soát ngân hàng và giao dịch đảo.</p></div>
      <div className="action-cluster">
        {can.post && <PartyPaymentLauncher label="Lập phiếu thu" title="Lập phiếu thu · chọn khách hàng" partyLabel="khách hàng" parties={customers} hrefPrefix="/admin/receivables?customer=" className="button button-primary" />}
        {can.post && can.payables && <PartyPaymentLauncher label="Lập phiếu chi" title="Lập phiếu chi · chọn nhà cung cấp" partyLabel="nhà cung cấp" parties={suppliers} hrefPrefix="/admin/payables?supplier=" />}
        {can.post && can.expense && <Link className="button button-secondary" href="/admin/expenses?new=1">Chi phí khác</Link>}
        {access.permissions.has("finance.account.manage") && <FormDialog label="Tạo tài khoản tiền" title="Tạo tài khoản tiền">
          <form className="form-grid" action={createFinanceAccountAction}><input type="hidden" name="operationId" value={randomUUID()} />
            <label className="field">Mã<input name="code" required /></label><label className="field">Tên<input name="name" required /></label>
            <label className="field">Loại<select name="kind"><option value="BANK">Ngân hàng</option><option value="CASH">Tiền mặt</option></select></label>
            <div className="form-actions"><button className="button button-primary" type="submit">Tạo tài khoản</button></div></form>
        </FormDialog>}
      </div>
    </header><ActionNotice notice={query.notice} error={query.error} />

    <section className="metric-grid" aria-label="Quỹ trong kỳ">
      <article className="card metric-card"><span className="metric-label">Quỹ đầu kỳ</span><strong className="metric-value"><MetricNumber value={money(totals.opening_vnd)} /></strong><small className="table-subline">Trước {formatBusinessDate(range.fromAt)}</small></article>
      <article className="card metric-card"><span className="metric-label">Tổng thu</span><strong className="metric-value text-success"><MetricNumber value={money(totals.receipts_vnd)} /></strong></article>
      <article className="card metric-card"><span className="metric-label">Tổng chi</span><strong className="metric-value text-danger"><MetricNumber value={money(totals.disbursements_vnd)} /></strong></article>
      <article className="card metric-card"><span className="metric-label">Tồn quỹ cuối kỳ</span><strong className="metric-value"><MetricNumber value={money(totals.closing_vnd)} /></strong><small className="table-subline">Đến hết {formatBusinessDate(`${range.to}T12:00:00+07:00`)}</small></article>
    </section>
    <section className="metric-grid metric-grid-compact"><article className="card metric-card"><span className="metric-label">Dòng tiền ròng</span><strong className="metric-value"><MetricNumber value={money(String(summary.net_cash_vnd))} /></strong><small className="table-subline">Toàn bộ tài khoản đến nay</small></article><article className="card metric-card"><span className="metric-label">Chưa đối soát</span><strong className="metric-value">{summary.unmatched_count}</strong></article><article className="card metric-card"><span className="metric-label">Tài khoản</span><strong className="metric-value">{accounts.length}</strong></article><article className="card metric-card"><span className="metric-label">Vị thế ứng trước</span><strong className="metric-value">{(advances ?? []).length}</strong></article></section>
    <nav className="detail-tabs cashbook-accounts" aria-label="Quỹ">
      <Link href={href({ account: undefined })} aria-current={!accountId ? "page" : undefined} scroll={false}>Tổng quỹ</Link>
      {accounts.filter((row) => row.active || row.id === accountId).map((row) => <Link key={row.id} href={href({ account: row.id })} aria-current={row.id === accountId ? "page" : undefined} scroll={false}>
        {row.account_kind === "CASH" ? "Tiền mặt" : "Ngân hàng"} · {row.name}</Link>)}
    </nav>
    <div className="list-layout">
      <AutoFilterForm className="card card-pad list-filters" aria-label="Bộ lọc sổ quỹ">
        <div className="period-presets" role="group" aria-label="Chọn nhanh kỳ">{presets.map((preset) => <Link key={preset.label}
          className={`chip-link${range.from === preset.from && range.to === preset.to ? " active" : ""}`} href={href({ from: preset.from, to: preset.to })}>{preset.label}</Link>)}</div>
        <label>Từ ngày<input type="date" name="from" defaultValue={range.from} /></label>
        <label>Đến ngày<input type="date" name="to" defaultValue={range.to} /></label>
        <label>Tài khoản<select name="account" defaultValue={accountId}><option value="">Tất cả tài khoản</option>{accounts.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}{row.active ? "" : " (ngừng)"}</option>)}</select></label>
        <label>Loại<select name="direction" defaultValue={direction}><option value="">Thu và chi</option><option value="RECEIPT">Phiếu thu</option><option value="DISBURSEMENT">Phiếu chi</option></select></label>
        {filtered && <Link className="code-link" href="/admin/cashbook">Xóa lọc</Link>}
      </AutoFilterForm>
      <section className="card list-main"><div className="section-head"><h2>Giao dịch đã ghi sổ</h2><div className="action-cluster"><span className="scope-chip">{totals.payment_count} giao dịch trong kỳ</span>{exportRows.length > 0 && <CsvDownloadButton csv={csv} filename={`so-quy-${range.from}-${range.to}.csv`} label="Xuất file" />}</div></div><div className="table-wrap" role="region" aria-label="Giao dịch thu chi đã ghi sổ" tabIndex={0}><table className="cashbook-table"><thead><tr><th>Phiếu</th><th>Đối tác</th><th>Tài khoản</th><th>Loại</th><th className="numeric">Số tiền</th><th>Đối soát</th><th>Thao tác</th></tr></thead><tbody>{rows.map((item) => {
        const canHandle = item.posting_state === "POSTED" && !item.reversal_of_payment_id && ((can.reconcile && item.reconciliation_state !== "MATCHED") || can.reverse);
        return <tr key={item.id}><td><span className="mono">{item.payment_number}</span><small className="table-subline">{formatBusinessDate(item.effective_at)}</small></td><td className="cashbook-party">{item.counterparty_name}</td><td>{item.account_code}</td>
          <td><StatusBadge tone={item.posting_state === "REVERSED" ? "danger" : "info"}>{item.reversal_of_payment_id ? "Đảo giao dịch" : item.direction === "RECEIPT" ? "Thu" : "Chi"}</StatusBadge></td>
          <td className={`numeric mono${item.direction === "RECEIPT" ? " text-success" : ""}`}>{item.direction === "RECEIPT" ? "+" : "−"}{money(String(item.amount_vnd))}</td>
          <td><strong>{financeStateLabel(item.reconciliation_state)}</strong><small className="table-subline">Lệch {money(String(item.reconciliation_difference_vnd))}</small></td>
          <td className="table-actions"><Link className="code-link" href={`/api/payments/${item.id}/voucher/pdf`}>In {item.direction === "RECEIPT" ? "phiếu thu" : "phiếu chi"}</Link>
            {canHandle && <FormDialog label="Xử lý" title={`Xử lý ${item.payment_number}`} buttonClassName="button button-secondary button-compact"
              description={<>{item.counterparty_name} · {money(String(item.amount_vnd))} · {formatBusinessDate(item.effective_at)}</>}>
              {can.reconcile && item.reconciliation_state !== "MATCHED" && <form className="mini-command" action={reconcilePaymentAction}><h3>Đối soát ngân hàng</h3><input type="hidden" name="paymentId" value={item.id} /><input type="hidden" name="operationId" value={randomUUID()} /><label className="field" htmlFor={`reconcile-amount-${item.id}`}>Số tiền đối soát (VND)<MoneyInput id={`reconcile-amount-${item.id}`} name="amount" placeholder="Số tiền đối soát" required /></label><label className="field" htmlFor={`reconcile-time-${item.id}`}>Thời điểm đối soát<input id={`reconcile-time-${item.id}`} type="datetime-local" name="effectiveAt" defaultValue={localNow()} required /></label><label className="field" htmlFor={`reconcile-reference-${item.id}`}>Mã dòng ngân hàng<input id={`reconcile-reference-${item.id}`} name="reference" placeholder="Mã dòng ngân hàng" required /></label><button className="button button-secondary" type="submit">Ghi đối soát</button></form>}
              {can.reverse && <form className="mini-command" action={reversePaymentAction}><h3>Đảo giao dịch</h3><p className="muted">Ghi một giao dịch ngược chiều cùng số tiền; giao dịch gốc giữ nguyên trong sổ.</p><input type="hidden" name="paymentId" value={item.id} /><input type="hidden" name="operationId" value={randomUUID()} /><label className="field" htmlFor={`reverse-reason-${item.id}`}>Ghi chú (không bắt buộc)<input id={`reverse-reason-${item.id}`} name="reason" maxLength={500} placeholder="Ví dụ: Ghi nhầm số tiền" /></label><button className="button button-danger" type="submit">Đảo giao dịch</button></form>}
            </FormDialog>}</td></tr>;
      })}</tbody></table>{!rows.length && <p className="empty-inline">{filtered ? "Không có giao dịch phù hợp bộ lọc." : "Chưa có giao dịch tiền trong kỳ này."}</p>}</div>
      <ListPager page={list.page} hasNext={hasNext} params={params} /></section>
      {nonCash.length > 0 && <section className="card" aria-label="Chi phí không dùng tiền"><div className="section-head"><h2>Chi phí không dùng tiền trong kỳ (hao hụt kho)</h2><span className="scope-chip">Tổng {money(String(nonCashTotal))}</span></div>
        <p className="muted">Ghi vào chi phí và trừ lợi nhuận; không tính vào số dư quỹ.</p>
        <div className="table-wrap"><table><thead><tr><th>Mã</th><th>Loại chi / ghi chú</th><th className="numeric">Số tiền</th></tr></thead><tbody>{nonCash.map((item) => <tr key={item.id}>
          <td><Link className="code-link mono" href={`/admin/expenses?focus=${item.id}`}>{item.expense_number}</Link><small className="table-subline">{formatBusinessDate(item.effective_at)}</small></td>
          <td>{item.category_name}<small className="table-subline">{item.description}</small></td><td className="numeric mono">{money(item.amount_vnd)}</td></tr>)}</tbody></table></div></section>}
    </div>
  </div>;
}
