"use client";

import { startTransition, useActionState, useState } from "react";
import { openReturnCaseAction, type OpenReturnCaseState } from "@/modules/delivery/actions";

type Props = {
  deliveryId: string;
  operationId: string;
  lines: { id: string; label: string }[];
};

const initialState: OpenReturnCaseState = { success: false, error: null };

export function OpenReturnCaseForm({ deliveryId, operationId: initialOperationId, lines }: Props) {
  const [operationId, setOperationId] = useState(initialOperationId);
  const [draft, setDraft] = useState({
    verificationLineId: lines[0]?.id ?? "",
    caseKind: "TRANSIT_REMAINDER",
    quantity: "",
    reason: "",
  });
  const [state, action, pending] = useActionState(async (previous: OpenReturnCaseState, data: FormData) => {
    const result = await openReturnCaseAction(previous, data);
    if (result.success) {
      setDraft((current) => ({ ...current, caseKind: "TRANSIT_REMAINDER", quantity: "", reason: "" }));
      setOperationId(crypto.randomUUID());
    }
    return result;
  }, initialState);

  return (
    <form className="command-panel" method="post" onSubmit={(event) => {
      event.preventDefault();
      if (pending) return;
      // Capture before pending disables controls; a validation error must not reset the form.
      const data = new FormData(event.currentTarget);
      startTransition(() => action(data));
    }}>
      <input type="hidden" name="deliveryId" value={deliveryId} />
      <input type="hidden" name="operationId" value={operationId} />
      <div className="field">
        <label htmlFor="verificationLineId">Dòng giao cần xử lý</label>
        <select id="verificationLineId" name="verificationLineId" required disabled={pending} value={draft.verificationLineId}
          onChange={(event) => setDraft({ ...draft, verificationLineId: event.target.value })}>
          {lines.map((line) => <option key={line.id} value={line.id}>{line.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="caseKind">Vấn đề</label>
        <select id="caseKind" name="caseKind" disabled={pending} value={draft.caseKind}
          onChange={(event) => setDraft({ ...draft, caseKind: event.target.value })}>
          <option value="TRANSIT_REMAINDER">Phần còn trên xe / trả kho</option>
          <option value="TRANSIT_LOSS">Hỏng hoặc hao hụt đang giao</option>
          <option value="CUSTOMER_RETURN">Khách trả sau xác minh</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="returnQuantity">Số lượng theo đơn vị cơ sở</label>
        <input id="returnQuantity" name="quantity" inputMode="decimal" required disabled={pending} value={draft.quantity}
          onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="returnReason">Ghi chú (không bắt buộc)</label>
        <textarea id="returnReason" name="reason" maxLength={500} disabled={pending} value={draft.reason}
          onChange={(event) => setDraft({ ...draft, reason: event.target.value })} />
      </div>
      {state.error && <p className="form-message" role="alert">{state.error}</p>}
      {state.success && <p className="form-message" role="status">Đã mở hồ sơ xử lý.</p>}
      <button className="button button-secondary action-full" type="submit" disabled={pending || !lines.length}>
        {pending ? "Đang mở hồ sơ..." : "Mở hồ sơ xử lý"}
      </button>
    </form>
  );
}
