"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getCommandDraftAction, lookupCommandOutcomeAction, saveCommandDraftAction } from "@/lib/core/command-outcome-actions";
import type { CommandOutcome } from "@/lib/core/command-outcome";
import type { CreditCommand } from "@/modules/finance/credit-command";

import type { DocumentCommand } from "@/modules/invoicing/document-commands";

import type { NoticeCommand } from "@/modules/finance/notice-commands";

type Props = {
  action: (form: FormData) => Promise<CommandOutcome>;
  command: "post_payment" | "receive_purchase_order" | "verify_supplier_fulfillment" | "allocate_payment" | "resolve_commission_reconciliation" | "create_delivery_expense" | "approve_expense" | "create_warehouse_transfer" | "record_warehouse_transfer_event" | "create_supplier_return" | "record_supplier_return_event" | "approve_supplier_return_credit" | "refund_supplier_credit" | "offset_supplier_credit" | CreditCommand | DocumentCommand | NoticeCommand;
  scope: string;
  operationId: string;
  children: ReactNode;
  className?: string;
  onRestore?: (entries: Array<[string, string]>) => void;
  onNew?: () => void;
};
const keyFor = (scope: string, command: string) => `hx-intent-v1:${scope}:${command}`;
const validId = (value: string | null) => Boolean(value && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value));
function formFor(entries: Array<[string, string]>) {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  return form;
}

export function ReliableCommandForm(props: Props) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const restore = useRef(props.onRestore);
  useEffect(() => { restore.current = props.onRestore; }, [props.onRestore]);
  const [operation, setOperation] = useState(props.operationId);
  const [state, setState] = useState<CommandOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cached, setCached] = useState<Array<[string, string]> | null>(null);
  const key = keyFor(props.scope, props.command);

  useEffect(() => {
    let live = true;
    async function recover() {
      let id: string | null;
      try { id = localStorage.getItem(key); } catch { id = null; }
      if (!validId(id)) { if (live) setLoading(false); return; }
      setOperation(id!);
      try {
        const outcome = await lookupCommandOutcomeAction(id!, props.command);
        if (!live) return;
        if (outcome.status === "SUCCESS") {
          setState(outcome);
          localStorage.removeItem(key);
        } else {
          const entries = await getCommandDraftAction(id!, props.command);
          if (!live) return;
          setCached(entries);
          if (entries) {
            restore.current?.(entries);
            for (const [name, value] of entries) {
              const matches = form.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${CSS.escape(name)}"]`);
              // Repeated PO line IDs/quantities retain their original pair ordering.
              const values = entries.filter(([field]) => field === name).map(([, entry]) => entry);
              matches?.forEach((input, index) => { input.value = values[index] ?? value; });
            }
          }
          setState(outcome);
        }
      } catch { if (live) setState({ status: "UNKNOWN", message: "Chưa tra cứu được kết quả. Giữ nguyên thao tác để kiểm tra lại." }); }
      finally { if (live) setLoading(false); }
    }
    void recover();
    return () => { live = false; };
  }, [key, props.command]);

  async function execute(entries: Array<[string, string]>, id: string) {
    setBusy(true);
    setCached(entries);
    try {
      // Browser persists only an opaque identifier; financial payload is server protected.
      try { localStorage.setItem(key, id); } catch {
        setState({ status: "FAILED", message: "Chưa lưu được mã thao tác trong trình duyệt; chưa gửi lệnh ghi nghiệp vụ. Hãy cho phép lưu dữ liệu của trang rồi thử lại." });
        return;
      }
      const saved = await saveCommandDraftAction(id, props.command, entries);
      if (saved.status !== "SUCCESS") { setState(saved); return; }
      const result = await props.action(formFor(entries));
      setState(result);
      if (result.status !== "UNKNOWN") localStorage.removeItem(key);
      if (result.status === "SUCCESS") router.refresh();
    } catch {
      setState({ status: "UNKNOWN", message: "Phản hồi bị gián đoạn; chưa xác định được kết quả. Tra cứu hoặc thử lại cùng thao tác, không ghi lần mới." });
    } finally { setBusy(false); }
  }
  async function submit(data: FormData) {
    if (loading || busy || state?.status === "UNKNOWN" || state?.status === "SUCCESS") return;
    data.set("operationId", operation);
    const entries: Array<[string, string]> = [];
    for (const [name, value] of data) if (typeof value === "string" && !name.startsWith("$")) entries.push([name, value]);
    await execute(entries, operation);
  }
  async function lookup() {
    setBusy(true);
    try {
      const outcome = await lookupCommandOutcomeAction(operation, props.command);
      setState(outcome);
      if (outcome.status === "SUCCESS") { localStorage.removeItem(key); router.refresh(); }
    } catch { setState({ status: "UNKNOWN", message: "Chưa tra cứu được kết quả. Hãy giữ mã thao tác và thử lại." }); }
    finally { setBusy(false); }
  }
  function next() {
    localStorage.removeItem(key);
    setCached(null);
    setOperation(crypto.randomUUID());
    setState(null);
    props.onNew?.();
  }
  return <form ref={form} action={submit} className={props.className}>
    <input type="hidden" name="operationId" value={operation} />
    <fieldset className="reliable-command-fields" disabled={loading || busy || state !== null}>
      {props.children}
    </fieldset>
    {state && <p className={`form-message ${state.status === "SUCCESS" ? "success" : ""}`} role="status">{state.message}{state.status === "SUCCESS" && <> Mã chứng từ: <span className="mono">{state.resultId}</span>.</>}</p>}
    {state?.status === "UNKNOWN" && <div className="action-cluster">
      <button className="button button-secondary" type="button" disabled={busy} onClick={() => void lookup()}>Tra cứu kết quả</button>
      {cached && <button className="button button-secondary" type="button" disabled={busy} onClick={() => void execute(cached, operation)}>Thử lại cùng thao tác</button>}
    </div>}
    {(state?.status === "SUCCESS" || state?.status === "FAILED") && <button className="button button-secondary" type="button" onClick={next}>Bắt đầu thao tác mới</button>}
  </form>;
}

/** Remains visible when a fully received PO no longer renders its write form. */
export function CommandRecoveryNotice({ scope, command }: { scope: string; command: Props["command"] }) {
  const [outcome, setOutcome] = useState<CommandOutcome | null>(null);
  useEffect(() => {
    let live = true;
    const key = keyFor(scope, command);
    let id: string | null;
    try { id = localStorage.getItem(key); } catch { id = null; }
    if (validId(id)) void lookupCommandOutcomeAction(id!, command).then((result) => {
      if (live && result.status === "SUCCESS") { setOutcome(result); localStorage.removeItem(key); }
    }).catch(() => {});
    return () => { live = false; };
  }, [scope, command]);
  return outcome?.status === "SUCCESS" ? <p className="form-message success" role="status">{outcome.message} Mã chứng từ: <span className="mono">{outcome.resultId}</span>.</p> : null;
}
