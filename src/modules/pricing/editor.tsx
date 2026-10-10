"use client";

import { useActionState, useId, useLayoutEffect, useRef, useState } from "react";
import { savePricingRuleAction } from "./actions";
import { savePurchasePricingRuleAction } from "./purchase-actions";

export type PriceRule = { id: string; scope_type: string; customer_id: string | null; material_id: string | null; material_group_id: string | null; customer_tier_code: string | null; price_uom_id: string; unit_price_vnd: string; version: number; source_type: string; effective_from: string; effective_to: string | null; active: boolean };
export type PurchasePriceRule = { id:string; supplier_id:string; material_id:string; purchase_uom_id:string; unit_cost_vnd:string; version:number; source_type:string; effective_from:string; effective_to:string|null; active:boolean };
export type PriceOptions = { suppliers?: {id:string;name:string}[]; customers: { id: string; name: string }[]; materials: { id: string; name: string }[]; groups: { id: string; name: string }[]; units: { id: string; name: string }[] };

export function PricingRuleEditor({ rule, options, purchase = false, purchaseRule, command, scopeLabel }: { rule?: PriceRule; options: PriceOptions; purchase?:boolean; purchaseRule?:PurchasePriceRule; command?:{targetId:string;operationId:string}; scopeLabel?:string }) {
  const submitting = useRef(false);
  const deactivateButton = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const reasonInput = useRef<HTMLInputElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const fallback = useRef<HTMLElement | null>(null);
  const returnFocus = useRef(false);
  const completed = useRef(false);
  const closePending = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [validation, setValidation] = useState<string>();
  const [state, action, pending] = useActionState(async (previous: Parameters<typeof savePricingRuleAction>[0], form: FormData) => {
    try { return await (purchase ? savePurchasePricingRuleAction : savePricingRuleAction)(previous, form); }
    finally { submitting.current = false; }
  }, undefined);
  useLayoutEffect(() => {
    const summary = root.current?.closest("details")?.querySelector("summary");
    const main = root.current?.closest("main");
    const modal = dialog.current;
    const ruleId = (purchase ? purchaseRule : rule)?.id;
    fallback.current = summary ?? root.current;
    return () => {
      if (!(submitting.current || modal?.open || completed.current || closePending.current)) return;
      const restoreAfterClose = () => {
        const retained = summary?.isConnected ? summary : Array.from(main?.querySelectorAll<HTMLElement>("details[data-price-rule-id]") ?? [])
          .find(row => row.dataset.priceRuleId === ruleId)?.querySelector<HTMLElement>("summary");
        const destination = retained ?? main?.querySelector<HTMLElement>("h1[tabindex]");
        if (destination?.isConnected && !destination.closest("[hidden]")) destination.focus({ preventScroll: true });
      };
      if (modal && (modal.open || closePending.current)) {
        // A native close event can arrive after React has removed this editor.
        modal.addEventListener("close", restoreAfterClose, { once: true });
        if (modal.open) modal.close();
      } else {
        // A removed/filtered row must not be the destination of an unmount cleanup.
        const heading = main?.querySelector<HTMLElement>("h1[tabindex]");
        if (heading?.isConnected) heading.focus({ preventScroll: true });
        else if (summary?.isConnected) summary.focus({ preventScroll: true });
      }
    };
  }, []);
  useLayoutEffect(() => {
    if (state?.success) {
      completed.current = true;
      if (dialog.current?.open) {
        closePending.current = true;
        dialog.current.close();
      } else if (!closePending.current && status.current?.isConnected && !status.current.closest("[hidden]")) {
        status.current.focus({ preventScroll: true });
      }
    } else if (confirming) {
      if (dialog.current && !dialog.current.open && !closePending.current) {
        dialog.current.showModal();
        reasonInput.current?.focus();
      }
    } else if (returnFocus.current && !closePending.current) {
      returnFocus.current = false;
      const origin = deactivateButton.current;
      const destination = origin?.isConnected && !origin.disabled ? origin : fallback.current;
      if (destination?.isConnected && !destination.closest("[hidden]")) destination.focus({ preventScroll: true });
    }
  }, [confirming, state?.success]);
  const targetRule = purchase ? purchaseRule : rule;
  const [scope, setScope] = useState("DEFAULT");
  const id = useId();
  const customerScope = !purchase && (scope === "CUSTOMER_MATERIAL" || scope === "CUSTOMER_GROUP");
  const identity = scopeLabel ?? (purchase && purchaseRule
    ? [options.suppliers?.find(x => x.id === purchaseRule.supplier_id)?.name ?? purchaseRule.supplier_id,
       options.materials.find(x => x.id === purchaseRule.material_id)?.name ?? purchaseRule.material_id].join(" · ")
    : rule ? [rule.scope_type, rule.customer_id ?? rule.customer_tier_code,
       options.materials.find(x => x.id === rule.material_id)?.name ?? rule.material_id ?? rule.material_group_id].filter(Boolean).join(" · ") : "");
  function submit(event: React.FormEvent<HTMLFormElement>, deactivate = false) {
    if (pending || submitting.current || (targetRule && state?.success)) { event.preventDefault(); return; }
    if (deactivate && (reason.trim().length < 3 || reason.trim().length > 500)) {
      event.preventDefault(); setValidation("Cần lý do ngừng sử dụng từ 3 đến 500 ký tự."); return;
    }
    setValidation(undefined); submitting.current = true;
  }
  function cancel() {
    if (pending || submitting.current) return;
    returnFocus.current = true;
    setValidation(undefined);
    if (dialog.current?.open) {
      closePending.current = true;
      dialog.current.close();
    } else setConfirming(false);
  }
  function dialogKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") { event.preventDefault(); cancel(); return; }
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("input:not(:disabled):not([type=hidden]), button:not(:disabled)"));
    const first = controls[0], last = controls[controls.length - 1];
    if (!first || !last) { event.preventDefault(); event.currentTarget.focus(); }
    else if (event.shiftKey && event.target === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && event.target === last) { event.preventDefault(); first.focus(); }
  }
  return <div ref={root} tabIndex={-1}><form onSubmit={event => submit(event)} action={action} className="card card-pad" onReset={() => setScope("DEFAULT")}>
    {command && <><input type="hidden" name="operationId" value={command.operationId}/><input type="hidden" name="targetId" value={command.targetId}/></>}{targetRule && <><input type="hidden" name="supersedesId" value={targetRule.id} /><input type="hidden" name="expectedVersion" value={targetRule.version} /></>}
    {!targetRule && !purchase && <div className="field"><label htmlFor={`${id}-scope`}>Phạm vi *</label><select id={`${id}-scope`} name="scopeType" value={scope} onChange={(event) => setScope(event.target.value)}><option value="DEFAULT">Giá mặc định theo vật tư</option><option value="CUSTOMER_MATERIAL">Khách hàng + vật tư</option><option value="CUSTOMER_GROUP">Khách hàng + nhóm vật tư</option><option value="CUSTOMER_TIER">Nhóm giá khách + vật tư</option></select></div>}
    <div className="form-grid">
      {!targetRule && <>
        {purchase && <div className="field"><label htmlFor={`${id}-supplier`}>Nhà cung cấp *</label><select id={`${id}-supplier`} name="supplierId" required><option value="">Chọn...</option>{options.suppliers?.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}</select></div>}
        {customerScope && <div className="field"><label htmlFor={`${id}-customer`}>Khách hàng *</label><select id={`${id}-customer`} name="customerId" required><option value="">Chọn...</option>{options.customers.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div>}
        {scope === "CUSTOMER_TIER" && <div className="field"><label htmlFor={`${id}-tier`}>Nhóm giá khách *</label><input id={`${id}-tier`} name="tierCode" required maxLength={40} /></div>}
        {scope === "CUSTOMER_GROUP" ? <div className="field"><label htmlFor={`${id}-group`}>Nhóm vật tư *</label><select id={`${id}-group`} name="groupId" required><option value="">Chọn...</option>{options.groups.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div> : <div className="field"><label htmlFor={`${id}-material`}>Vật tư *</label><select id={`${id}-material`} name="materialId" required><option value="">Chọn...</option>{options.materials.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div>}
        <div className="field"><label htmlFor={`${id}-uom`}>Đơn vị giá *</label><select id={`${id}-uom`} name="priceUomId" required><option value="">Chọn...</option>{options.units.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div>
      </>}
      <div className="field"><label htmlFor={`${id}-price`}>Đơn giá (VND) *</label><input id={`${id}-price`} name="unitPriceVnd" inputMode="numeric" pattern="[1-9][0-9]*" defaultValue={purchase ? purchaseRule?.unit_cost_vnd : rule?.unit_price_vnd} required /></div>
      <div className="field"><label htmlFor={`${id}-source`}>Nguồn giá *</label><select id={`${id}-source`} name="sourceType" defaultValue={targetRule?.source_type ?? "LIST"}><option value="LIST">Bảng giá</option><option value="CONTRACT">Hợp đồng</option></select></div>
      <div className="field"><label htmlFor={`${id}-from`}>Hiệu lực từ ngày *</label><input id={`${id}-from`} name="effectiveFrom" type="date" required /></div>
      <div className="field"><label htmlFor={`${id}-to`}>Đến trước ngày</label><input id={`${id}-to`} name="effectiveTo" type="date" /></div>
      <div className="field field-full"><label htmlFor={`${id}-reason`}>Lý do thay đổi *</label><input id={`${id}-reason`} name="reason" value={reason} onChange={event => setReason(event.target.value)} required minLength={3} maxLength={500} /></div>
    </div>
    {targetRule && <p className="muted">Không sửa giá cũ: tạo phiên bản mới hoặc ngừng sử dụng. Chứng từ đã chốt giữ snapshot.</p>}
    {state && <p ref={status} tabIndex={-1} role="status" className="form-message">{state.message}</p>}
    <div className="form-actions"><button className="button button-primary" type="submit" name="mode" value={targetRule ? "replace" : "create"} disabled={pending || (!!targetRule && state?.success)}>{pending ? "Đang lưu..." : targetRule ? "Tạo phiên bản mới" : "Tạo chính sách giá"}</button>{targetRule && <button ref={deactivateButton} className="button button-secondary" type="button" disabled={pending || state?.success || confirming} onClick={() => { setValidation(undefined); setConfirming(true); }}>Ngừng sử dụng</button>}</div>
  </form>
    {targetRule && <dialog ref={dialog} hidden={!confirming} className="card card-pad" aria-labelledby={`${id}-confirm-heading`} aria-describedby={`${id}-confirm-consequence`} aria-modal="true" style={{width:"min(36rem, calc(100vw - 2rem))",maxHeight:"calc(100dvh - 2rem)",overflowY:"auto",margin:"auto"}} onCancel={event => { event.preventDefault(); cancel(); }} onClose={() => { closePending.current = false; setConfirming(false); }} onKeyDown={dialogKeyDown}>
      <h3 id={`${id}-confirm-heading`}>Xác nhận ngừng sử dụng giá</h3>
      <p>{identity}</p>
      <p>Mã quy tắc: {targetRule.id} · Phiên bản: {targetRule.version}</p>
      <p>Giá hiện tại: {purchase ? purchaseRule?.unit_cost_vnd : rule?.unit_price_vnd} VND</p>
      <p id={`${id}-confirm-consequence`}>Ngừng chọn giá này cho chứng từ mới. Lịch sử phiên bản và snapshot chứng từ đã chốt không thay đổi.</p>
      <form action={action} aria-label="Xác nhận ngừng sử dụng" onSubmit={event => submit(event, true)}>
        <input type="hidden" name="mode" value="deactivate" />
        <input type="hidden" name="supersedesId" value={targetRule.id} />
        <input type="hidden" name="expectedVersion" value={targetRule.version} />
        {command && <input type="hidden" name="operationId" value={command.operationId} />}
        <div className="field"><label htmlFor={`${id}-deactivate-reason`}>Lý do ngừng sử dụng *</label><input ref={reasonInput} id={`${id}-deactivate-reason`} name="reason" value={reason} onChange={event => setReason(event.target.value)} required minLength={3} maxLength={500} disabled={pending || state?.success} /></div>
        {validation && <p role="alert" className="form-message">{validation}</p>}
        {state && <p role="status" className="form-message">{state.message}</p>}
        <div className="form-actions">
          <button type="button" className="button button-secondary" disabled={pending} onClick={cancel}>Quay lại</button>
          <button type="submit" formNoValidate className="button button-primary" disabled={pending || state?.success}>{pending ? "Đang ngừng sử dụng..." : "Xác nhận ngừng sử dụng"}</button>
        </div>
      </form>
    </dialog>}
  </div>;
}
