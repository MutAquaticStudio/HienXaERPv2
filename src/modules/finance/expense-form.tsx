"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { MoneyInput } from "@/components/ui/money-input";
import type { CommandOutcome } from "@/lib/core/command-outcome";
import { EXPENSE_TYPE_SUGGESTIONS } from "./operating-expense";

type Option = { id: string; label: string };
type Account = Option & { kind: string };
type PayeeKind = "OTHER" | "SUPPLIER" | "EMPLOYEE";

/**
 * "Ghi chi phí" like KiotViet (FB7): Loại chi (picked or typed), Số tiền, Ngày chi, Người nhận (Khác / Nhà cung cấp /
 * Nhân viên), Thanh toán (Đã trả ngay from a cash/bank account, or Ghi nợ for a supplier) and "Tính vào lợi nhuận" — left
 * unticked when buying something that lasts, such as a truck. A refusal keeps what was typed and puts the cursor on the field
 * to fix; an unclear answer keeps the same operation, so pressing again cannot record twice.
 */
export function OperatingExpenseForm({ action, types, suppliers, employees, accounts, orders, canPay, now }: {
  action: (form: FormData) => Promise<CommandOutcome>;
  types: string[]; suppliers: Option[]; employees: Option[]; accounts: Account[]; orders: Option[]; canPay: boolean; now: string;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [payeeKind, setPayeeKind] = useState<PayeeKind>("OTHER");
  const [settlement, setSettlement] = useState<"PAID_NOW" | "PAYABLE">(canPay ? "PAID_NOW" : "PAYABLE");
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<CommandOutcome | null>(null);
  const offered = [...new Set([...types, ...EXPENSE_TYPE_SUGGESTIONS])];
  const owing = settlement === "PAYABLE" && payeeKind === "SUPPLIER";
  const blocked = !canPay && payeeKind !== "SUPPLIER";

  useEffect(() => {
    if (outcome?.status !== "FAILED" || !outcome.field) return;
    const input = document.getElementById(`expense-${outcome.field}`);
    if (!input) return;
    input.setAttribute("aria-invalid", "true");
    input.focus();
  }, [outcome]);

  function choosePayee(kind: PayeeKind) {
    setPayeeKind(kind);
    if (kind !== "SUPPLIER" && canPay) setSettlement("PAID_NOW");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || !form.current) return;
    form.current.querySelectorAll("[aria-invalid]").forEach((input) => input.removeAttribute("aria-invalid"));
    const data = new FormData(form.current);
    data.set("operationId", operationId);
    data.set("payeeKind", payeeKind);
    data.set("settlement", owing ? "PAYABLE" : "PAID_NOW");
    setSending(true);
    try {
      const result = await action(data);
      setOutcome(result);
      if (result.status === "UNKNOWN") return;
      setOperationId(crypto.randomUUID());
      if (result.status === "SUCCESS") {
        form.current?.reset();
        setPayeeKind("OTHER");
        setSettlement(canPay ? "PAID_NOW" : "PAYABLE");
        router.refresh();
      }
    } catch {
      setOutcome({ status: "UNKNOWN", message: "Mất kết nối, chưa rõ đã ghi được chưa. Bấm Ghi chi phí lần nữa để kiểm tra; hệ thống không ghi hai lần." });
    } finally {
      setSending(false);
    }
  }

  return <form ref={form} className="command-panel expense-form" onSubmit={(event) => { void submit(event); }} noValidate>
    <fieldset className="reliable-command-fields" disabled={sending}>
      <div className="field"><label htmlFor="expense-categoryName">Loại chi</label>
        <input id="expense-categoryName" name="categoryName" list="expense-type-options" placeholder="Chọn hoặc gõ loại mới, VD: Marketing" maxLength={120} autoComplete="off" required />
        <datalist id="expense-type-options">{offered.map((name) => <option key={name} value={name} />)}</datalist></div>
      <div className="field"><label htmlFor="expense-amount">Số tiền</label><MoneyInput id="expense-amount" name="amount" required /></div>
      <div className="field"><label htmlFor="expense-effectiveAt">Ngày chi</label><input id="expense-effectiveAt" name="effectiveAt" type="datetime-local" defaultValue={now} required /></div>
      <fieldset className="segmented-radio" id="expense-payeeKind"><legend>Người nhận</legend>
        <label><input type="radio" name="payee" checked={payeeKind === "OTHER"} onChange={() => choosePayee("OTHER")} /> Khác</label>
        <label><input type="radio" name="payee" checked={payeeKind === "SUPPLIER"} onChange={() => choosePayee("SUPPLIER")} /> Nhà cung cấp</label>
        <label><input type="radio" name="payee" checked={payeeKind === "EMPLOYEE"} onChange={() => choosePayee("EMPLOYEE")} /> Nhân viên</label>
      </fieldset>
      {payeeKind === "OTHER" && <div className="field"><label htmlFor="expense-payeeName">Tên người nhận (không bắt buộc)</label>
        <input id="expense-payeeName" name="payeeName" maxLength={160} placeholder="VD: Công ty quảng cáo, đại lý xe" /></div>}
      {payeeKind === "SUPPLIER" && <div className="field"><label htmlFor="expense-supplierId">Nhà cung cấp nhận tiền</label>
        <select id="expense-supplierId" name="supplierId" required><option value="">Chọn nhà cung cấp</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>}
      {payeeKind === "EMPLOYEE" && <div className="field"><label htmlFor="expense-employeeId">Nhân viên nhận tiền</label>
        <select id="expense-employeeId" name="employeeId" required><option value="">Chọn nhân viên</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>}
      {payeeKind === "SUPPLIER" && <fieldset className="segmented-radio" id="expense-settlement"><legend>Thanh toán</legend>
        <label><input type="radio" name="pay" checked={!owing} disabled={!canPay} onChange={() => setSettlement("PAID_NOW")} /> Đã trả ngay</label>
        <label><input type="radio" name="pay" checked={owing} onChange={() => setSettlement("PAYABLE")} /> Ghi nợ nhà cung cấp</label>
      </fieldset>}
      {!owing && canPay && <div className="field"><label htmlFor="expense-accountId">Chi từ quỹ</label>
        <select id="expense-accountId" name="accountId" required defaultValue={accounts.find((item) => item.kind === "CASH")?.id ?? accounts[0]?.id ?? ""}>
          <option value="">Chọn quỹ</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <small className="muted">Thành phiếu chi trong Sổ quỹ.</small></div>}
      {blocked && <p className="muted" role="note">Bạn chưa có quyền chi tiền từ quỹ; chỉ ghi được chi phí nợ nhà cung cấp.</p>}
      <label className="check-inline"><input type="checkbox" name="countsInProfit" defaultChecked /> Tính vào lợi nhuận</label>
      <small className="muted">Bỏ chọn khi mua tài sản dùng lâu (xe, máy móc): vẫn trừ quỹ nhưng không trừ lợi nhuận kỳ này.</small>
      <div className="field"><label htmlFor="expense-description">Ghi chú (không bắt buộc)</label><textarea id="expense-description" name="description" maxLength={500} /></div>
      {orders.length > 0 && <div className="field"><label htmlFor="expense-salesOrderId">Đơn bán liên quan (không bắt buộc)</label>
        <select id="expense-salesOrderId" name="salesOrderId"><option value="">Chi phí chung</option>{orders.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>}
    </fieldset>
    {outcome && <p className={`form-message ${outcome.status === "SUCCESS" ? "success" : outcome.status === "FAILED" ? "error" : ""}`} role={outcome.status === "SUCCESS" ? "status" : "alert"}>{outcome.message}</p>}
    <button className="button button-primary" type="submit" disabled={sending || blocked}>{sending ? "Đang ghi..." : "Ghi chi phí"}</button>
  </form>;
}
