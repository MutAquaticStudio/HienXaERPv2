"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  Landmark,
  ReceiptText,
  RotateCcw,
  WalletCards,
} from "lucide-react";

import { runFinanceAction, type FinanceActionState } from "@/app/app/finance/actions";
import type {
  FinanceCommandKind,
  FinanceDocumentSummary,
  FinanceSnapshot,
  PaymentDirection,
} from "@/modules/finance/types";

function money(value: string, currency = "VND") {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));
}
function statusLabel(status: string) {
  return ({
    OPEN: "Chưa thanh toán", PARTIALLY_SETTLED: "Đã thanh toán một phần", SETTLED: "Đã thanh toán",
    DRAFT: "Bản nháp", POSTED: "Đã ghi sổ", RECONCILED: "Đã đối chiếu", REVERSED: "Đã hoàn tác",
    PARTIALLY_APPLIED: "Đã cấn trừ một phần", APPLIED: "Đã cấn trừ", UNMATCHED: "Chưa đối chiếu", MATCHED: "Đã đối chiếu",
  } as Record<string, string>)[status] ?? status;
}
function Submit({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "risk" | "secondary" }) {
  const { pending } = useFormStatus();
  return (
    <button className={tone === "risk" ? "finance-risk-button" : tone === "secondary" ? "secondary-button finance-submit" : "primary-button finance-submit"} disabled={pending}>
      {pending ? "Đang lưu…" : children}
    </button>
  );
}
function Form({ kind, idempotencyKey, children, label, tone, className = "finance-form" }: {
  kind: FinanceCommandKind;
  idempotencyKey: string;
  children: ReactNode;
  label: string;
  tone?: "primary" | "risk" | "secondary";
  className?: string;
}) {
  const initial: FinanceActionState = { status: "idle", message: "", idempotencyKey };
  const [state, action] = useActionState(runFinanceAction, initial);
  return (
    <form action={action} className={className}>
      <input name="kind" type="hidden" value={kind} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      {children}
      <Submit tone={tone}>{label}</Submit>
      {state.message ? <p aria-live="polite" className={state.status === "error" ? "form-error compact" : "form-success"}>{state.message}</p> : null}
    </form>
  );
}
function Field({ label, name, defaultValue = "", type = "text", min, step, required = true }: { label: string; name: string; defaultValue?: string; type?: string; min?: string; step?: string; required?: boolean }) {
  return <label className="master-field"><span>{label}</span><input defaultValue={defaultValue} min={min} name={name} required={required} step={step} type={type} /></label>;
}
function Select({ label, name, children, required = true }: { label: string; name: string; children: ReactNode; required?: boolean }) {
  return <label className="master-field"><span>{label}</span><select name={name} required={required}>{children}</select></label>;
}
function DocumentRows({ title, documents, kind, canAdjust, keyFor }: {
  title: string;
  documents: FinanceDocumentSummary[];
  kind: "RECEIVABLE" | "PAYABLE";
  canAdjust: boolean;
  keyFor: (name: string) => string;
}) {
  return (
    <section className="finance-ledger-panel">
      <div className="finance-section-heading"><h2>{title}</h2><span>{documents.filter((item) => item.status !== "SETTLED").length} khoản còn mở</span></div>
      <div className="finance-document-list">
        {documents.map((document) => <article className="finance-document-row" key={document.id}>
          <div><strong>{document.partyName}</strong><small>{document.number} · {document.sourceNumber}</small></div>
          <div><span>Còn phải thanh toán</span><b>{money(document.outstandingAmount, document.currency)}</b></div>
          <div><span>Hạn thanh toán</span><b className={document.daysOverdue > 0 ? "finance-overdue" : ""}>{document.daysOverdue > 0 ? `! Quá hạn ${document.daysOverdue} ngày` : document.dueDate}</b></div>
          <span className={`commercial-status status-${document.status.toLowerCase()}`}>{statusLabel(document.status)}</span>
          {canAdjust && document.status !== "REVERSED" ? <details className="finance-row-action">
            <summary>Điều chỉnh có lý do</summary>
            <Form kind="finance.adjustment.post" idempotencyKey={keyFor(`adjust:${document.id}`)} label="Ghi bút toán điều chỉnh" tone="secondary">
              <input name="targetKind" type="hidden" value={kind} /><input name="targetId" type="hidden" value={document.id} />
              <Field label="Số tiền (+ tăng, - giảm)" name="signedAmount" step="1" type="number" />
              <Field label="Lý do điều chỉnh" name="reason" />
            </Form>
          </details> : null}
        </article>)}
      </div>
    </section>
  );
}

export function FinanceWorkspace({ data, initialKeys, canManage, canCreate, canAllocate, canPost, canReverse, canReconcile, canManageExpense, canAdjust }: {
  data: FinanceSnapshot;
  initialKeys: Record<string, string>;
  canManage: boolean;
  canCreate: boolean;
  canAllocate: boolean;
  canPost: boolean;
  canReverse: boolean;
  canReconcile: boolean;
  canManageExpense: boolean;
  canAdjust: boolean;
}) {
  const [direction, setDirection] = useState<PaymentDirection>("RECEIPT");
  const keyFor = (name: string) => initialKeys[name] ?? `finance-${name}`;
  const openReceivables = data.receivables.filter((item) => ["OPEN", "PARTIALLY_SETTLED"].includes(item.status));
  const openPayables = data.payables.filter((item) => ["OPEN", "PARTIALLY_SETTLED"].includes(item.status));
  return (
    <div className="finance-workspace">
      <header className="finance-page-header">
        <div><h1>Tài chính và dòng tiền</h1><p>Theo dõi tiền phải thu, phải trả và các khoản đã ghi sổ từ một nơi.</p></div>
        <CircleDollarSign aria-hidden="true" size={38} />
      </header>

      <section className="finance-kpis" aria-label="Tổng quan vốn lưu động">
        <article><ArrowDownToLine /><span>Phải thu</span><strong>{money(data.summary.receivables)}</strong><small>{money(data.summary.overdueReceivables)} đã quá hạn</small></article>
        <article><ArrowUpFromLine /><span>Phải trả</span><strong>{money(data.summary.payables)}</strong><small>{money(data.summary.overduePayables)} đã quá hạn</small></article>
        <article><WalletCards /><span>Tiền hiện có</span><strong>{money(data.summary.cashBalance)}</strong><small>Trên các tài khoản đang hoạt động</small></article>
        <article><CalendarClock /><span>Tiền ứng trước</span><strong>{money(String(Number(data.summary.customerAdvances) + Number(data.summary.supplierAdvances)))}</strong><small>Tách riêng khỏi công nợ</small></article>
      </section>

      {canCreate ? <section className="finance-primary-task">
        <div className="finance-task-copy"><Banknote /><div><h2>Ghi nhận khoản thu hoặc chi</h2><p>Khoản mới được lưu ở bản nháp. Chỉ nút “Ghi sổ” mới làm thay đổi số dư.</p></div></div>
        {data.accounts.length ? <Form kind="finance.payment.create" idempotencyKey={keyFor("payment:create")} label="LƯU BẢN NHÁP">
          <div className="finance-form-grid">
            <label className="master-field"><span>Loại giao dịch</span><select name="direction" onChange={(event) => setDirection(event.target.value as PaymentDirection)} value={direction}><option value="RECEIPT">Thu tiền khách hàng</option><option value="DISBURSEMENT">Chi tiền nhà cung cấp</option><option value="INTERNAL_TRANSFER">Chuyển giữa hai tài khoản</option></select></label>
            <Select label={direction === "INTERNAL_TRANSFER" ? "Tài khoản chuyển" : "Tài khoản tiền"} name="accountId">{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select>
            {direction === "RECEIPT" ? <Select label="Khách hàng" name="customerId">{data.customers.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}</Select> : <input name="customerId" type="hidden" value="" />}
            {direction === "DISBURSEMENT" ? <Select label="Nhà cung cấp" name="supplierId">{data.suppliers.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}</Select> : <input name="supplierId" type="hidden" value="" />}
            {direction === "INTERNAL_TRANSFER" ? <Select label="Tài khoản nhận" name="destinationAccountId">{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select> : <input name="destinationAccountId" type="hidden" value="" />}
            <Field label="Số tiền" min="1" name="amount" step="1" type="number" />
            <Field defaultValue={data.summary.asOfDate} label="Ngày thu chi" name="paymentDate" type="date" />
            <Field defaultValue="VND" label="Tiền tệ" name="currency" />
            <Field label="Mã tham chiếu (nếu có)" name="externalReference" required={false} />
            <Field label="Ghi chú (nếu có)" name="note" required={false} />
          </div>
        </Form> : <p className="finance-empty-note">Hãy tạo ít nhất một tài khoản tiền trước khi lập khoản thu chi.</p>}
      </section> : null}

      {canManage ? <details className="finance-secondary-task">
        <summary><Landmark />Tạo tài khoản tiền</summary>
        <Form kind="finance.account.create" idempotencyKey={keyFor("account:create")} label="Tạo tài khoản" tone="secondary">
          <div className="finance-form-grid"><Field label="Mã tài khoản" name="accountCode" /><Field label="Tên tài khoản" name="accountName" /><Select label="Loại tài khoản" name="accountType"><option value="BANK">Ngân hàng</option><option value="CASH">Tiền mặt</option></Select><Field defaultValue="VND" label="Tiền tệ" name="currency" /><Field label="Tên ngân hàng (nếu có)" name="bankName" required={false} /><Field label="Số tài khoản đã che (nếu có)" name="maskedNumber" required={false} /></div>
        </Form>
      </details> : null}

      <section className="finance-payments-panel">
        <div className="finance-section-heading"><h2>Khoản thu chi</h2><span>{data.payments.length} giao dịch</span></div>
        <div className="finance-payment-list">
          {data.payments.map((payment) => {
            const targets = payment.direction === "RECEIPT"
              ? openReceivables.filter((item) => item.partyId === payment.partyId)
              : openPayables.filter((item) => item.partyId === payment.partyId);
            const unmatchedBank = data.bankTransactions.filter((item) => item.status === "UNMATCHED");
            return <article className="finance-payment-row" key={payment.id}>
              <div className="finance-payment-main"><span className="finance-payment-icon">{payment.direction === "RECEIPT" ? <ArrowDownToLine /> : <ArrowUpFromLine />}</span><div><strong>{payment.number}</strong><b>{payment.partyName}</b><small>{payment.paymentDate} · {payment.accountName}</small></div></div>
              <div className="finance-payment-amount"><strong>{money(payment.amount, payment.currency)}</strong><span className={`commercial-status status-${payment.status.toLowerCase()}`}>{statusLabel(payment.status)}</span></div>
              {payment.status === "DRAFT" ? <div className="finance-payment-actions">
                {canAllocate && payment.direction !== "INTERNAL_TRANSFER" && targets.length ? <Form className="finance-inline-action" kind="finance.payment.allocate" idempotencyKey={keyFor(`allocate:${payment.id}`)} label="Phân bổ" tone="secondary">
                  <input name="paymentId" type="hidden" value={payment.id} /><input name="targetKind" type="hidden" value={payment.direction === "RECEIPT" ? "RECEIVABLE" : "PAYABLE"} />
                  <Select label="Công nợ cần thanh toán" name="targetId">{targets.map((target) => <option key={target.id} value={target.id}>{target.number} · còn {money(target.outstandingAmount, target.currency)}</option>)}</Select>
                  <Field defaultValue={String(Math.max(0, Number(payment.amount) - Number(payment.allocatedAmount)))} label="Số tiền phân bổ" min="1" name="amount" step="1" type="number" />
                </Form> : null}
                {canPost ? <Form className="finance-inline-action finance-post-action" kind="finance.payment.post" idempotencyKey={keyFor(`post:${payment.id}`)} label={payment.direction === "RECEIPT" ? "GHI SỔ KHOẢN THU" : payment.direction === "DISBURSEMENT" ? "GHI SỔ KHOẢN CHI" : "GHI SỔ CHUYỂN TIỀN"}>
                  <input name="paymentId" type="hidden" value={payment.id} /><p>Ghi sổ sẽ cập nhật số dư. Phần chưa phân bổ được ghi riêng là tiền ứng trước.</p>
                </Form> : null}
              </div> : null}
              {payment.status === "POSTED" && canReconcile && unmatchedBank.length ? <Form className="finance-inline-action" kind="finance.payment.reconcile" idempotencyKey={keyFor(`reconcile:${payment.id}`)} label="Xác nhận đối chiếu" tone="secondary">
                <input name="paymentId" type="hidden" value={payment.id} /><Select label="Giao dịch ngân hàng" name="bankTransactionId">{unmatchedBank.map((transaction) => <option key={transaction.id} value={transaction.id}>{transaction.externalId} · {money(transaction.amount, transaction.currency)}</option>)}</Select>
              </Form> : null}
              {["POSTED", "RECONCILED"].includes(payment.status) && canReverse ? <details className="finance-reversal"><summary><RotateCcw />Hoàn tác khoản này</summary><Form kind="finance.payment.reverse" idempotencyKey={keyFor(`reverse:${payment.id}`)} label="HOÀN TÁC BẰNG BÚT TOÁN BÙ" tone="risk"><input name="paymentId" type="hidden" value={payment.id} /><Field label="Lý do hoàn tác" name="reason" /><p>Hệ thống giữ nguyên giao dịch cũ và tạo bút toán bù để khôi phục công nợ.</p></Form></details> : null}
            </article>;
          })}
        </div>
      </section>

      <div className="finance-ledger-grid">
        <DocumentRows canAdjust={canAdjust} documents={data.receivables} keyFor={keyFor} kind="RECEIVABLE" title="Phải thu khách hàng" />
        <DocumentRows canAdjust={canAdjust} documents={data.payables} keyFor={keyFor} kind="PAYABLE" title="Phải trả nhà cung cấp" />
      </div>

      <section className="finance-bottom-grid">
        <article className="finance-simple-panel"><div className="finance-section-heading"><h2>Tiền ứng trước</h2><span>Không trừ âm vào công nợ</span></div>{data.advances.map((advance) => {
          const targets = (advance.kind === "CUSTOMER" ? openReceivables : openPayables).filter((item) => item.partyName === advance.partyName);
          const canApply = canAllocate && ["OPEN", "PARTIALLY_APPLIED"].includes(advance.status);
          return <div className="finance-advance-row" key={advance.id}><div><strong>{advance.partyName}</strong><small>{advance.kind === "CUSTOMER" ? "Khách đã ứng trước" : "Đã ứng nhà cung cấp"}</small></div><b>{money(advance.remainingAmount, advance.currency)}</b><span>{statusLabel(advance.status)}</span>{canApply && targets.length ? <Form className="finance-inline-action" kind="finance.advance.apply" idempotencyKey={keyFor(`advance:${advance.id}`)} label="Cấn trừ vào công nợ" tone="secondary"><input name="advanceKind" type="hidden" value={advance.kind} /><input name="advanceId" type="hidden" value={advance.id} /><Select label="Công nợ" name="targetId">{targets.map((item) => <option key={item.id} value={item.id}>{item.number}</option>)}</Select><Field defaultValue={advance.remainingAmount} label="Số tiền" min="1" name="amount" step="1" type="number" /></Form> : canApply ? <small className="finance-empty-note">Chưa có công nợ phù hợp để cấn trừ.</small> : null}</div>;
        })}</article>
        <article className="finance-simple-panel"><div className="finance-section-heading"><h2>Chi phí</h2><span>{data.expenses.length} khoản</span></div>{canManageExpense && data.accounts.length ? <Form kind="finance.expense.create" idempotencyKey={keyFor("expense:create")} label="Lưu chi phí nháp" tone="secondary"><div className="finance-form-grid"><Select label="Tài khoản chi" name="accountId">{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select><Field defaultValue={data.summary.asOfDate} label="Ngày chi phí" name="expenseDate" type="date" /><Field label="Nhóm chi phí" name="category" /><Field label="Nội dung" name="description" /><Field defaultValue="VND" label="Tiền tệ" name="currency" /><Field label="Số tiền" min="1" name="amount" step="1" type="number" /></div></Form> : null}{data.expenses.map((expense) => <div className="finance-expense-row" key={expense.id}><ReceiptText /><div><strong>{expense.category}</strong><small>{expense.description}</small></div><b>{money(expense.amount, expense.currency)}</b><span>{statusLabel(expense.status)}</span>{expense.status === "DRAFT" && canManageExpense ? <Form className="finance-compact-form" kind="finance.expense.post" idempotencyKey={keyFor(`expense-post:${expense.id}`)} label="Ghi sổ" tone="secondary"><input name="expenseId" type="hidden" value={expense.id} /></Form> : null}</div>)}</article>
      </section>

      {canReconcile && data.accounts.some((account) => account.type === "BANK") ? <details className="finance-secondary-task"><summary><Landmark />Ghi giao dịch ngân hàng để đối chiếu</summary><Form kind="finance.bank.import" idempotencyKey={keyFor("bank:import")} label="Ghi giao dịch" tone="secondary"><div className="finance-form-grid"><Select label="Tài khoản ngân hàng" name="accountId">{data.accounts.filter((account) => account.type === "BANK").map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select><Field label="Mã giao dịch ngân hàng" name="externalId" /><Field defaultValue={data.summary.asOfDate} label="Ngày giao dịch" name="transactionDate" type="date" /><Field label="Số tiền (+ thu, - chi)" name="signedAmount" step="1" type="number" /><Field defaultValue="VND" label="Tiền tệ" name="currency" /><Field label="Nội dung giao dịch" name="description" /></div></Form></details> : null}
    </div>
  );
}
