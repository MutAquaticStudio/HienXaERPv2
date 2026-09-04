"use client";

import { AlertTriangle } from "lucide-react";
import { useActionState, useEffect, useId, useRef } from "react";
import { useFormStatus } from "react-dom";

import {
  runWorkerIssueAction,
  type WorkerIssueActionState,
} from "@/app/work/actions";
import type { PortalIssueSourceType } from "@/modules/portal-issues/types";

const categories = [
  { value: "CUSTOMER_UNREACHABLE", label: "Không liên lạc được khách" },
  { value: "WRONG_ADDRESS", label: "Sai địa chỉ" },
  { value: "VEHICLE_OR_MACHINE_FAILURE", label: "Xe/máy có sự cố" },
  { value: "INSUFFICIENT_GOODS", label: "Hàng không đủ" },
  { value: "CUSTOMER_PARTIAL_REFUSAL", label: "Khách không nhận đủ" },
  { value: "OTHER", label: "Khác" },
] as const;

function SubmitIssue() {
  const { pending } = useFormStatus();
  return (
    <button className="secondary-button worker-issue-submit" disabled={pending} type="submit">
      <AlertTriangle aria-hidden="true" />
      {pending ? "ĐANG GỬI…" : "GỬI SỰ CỐ"}
    </button>
  );
}

export function WorkerIssueForm({
  sourceId,
  sourceType,
}: {
  sourceId: string;
  sourceType: PortalIssueSourceType;
}) {
  // useId is stable across the server render and hydration. A random key here
  // would make the hidden input differ between them before the first submit.
  const formId = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const [state, action] = useActionState(runWorkerIssueAction, {
    status: "idle",
    message: "",
    idempotencyKey: `portal-issue-${formId}`,
  } satisfies WorkerIssueActionState);
  const formRef = useRef<HTMLFormElement>(null);
  const draftRef = useRef<FormData | null>(null);

  useEffect(() => {
    if (state.status !== "error" || !formRef.current || !draftRef.current) return;
    for (const [name, value] of draftRef.current.entries()) {
      const control = formRef.current.elements.namedItem(name);
      if (
        typeof value === "string" &&
        (control instanceof HTMLInputElement ||
          control instanceof HTMLSelectElement ||
          control instanceof HTMLTextAreaElement)
      ) {
        control.value = value;
      }
    }
  }, [state]);

  return (
    <details className="worker-issue-details">
      <summary>
        <AlertTriangle aria-hidden="true" />
        Báo sự cố / cần hỗ trợ
      </summary>
      <form
        action={action}
        className="worker-issue-form"
        onSubmit={(event) => {
          draftRef.current = new FormData(event.currentTarget);
        }}
        ref={formRef}
      >
        <input name="sourceType" type="hidden" value={sourceType} />
        <input name="sourceId" type="hidden" value={sourceId} />
        <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
        <label>
          Loại sự cố
          <select defaultValue="" name="category" required>
            <option disabled value="">Chọn loại sự cố</option>
            {categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mô tả sự cố
          <textarea
            name="description"
            placeholder="Nêu tình huống, vị trí và hỗ trợ cần thiết"
            required
          />
        </label>
        <p className="worker-issue-explainer">
          Báo cáo này chỉ liên kết với công việc hiện tại, không tự đổi trạng thái giao hàng hoặc dịch vụ.
        </p>
        <SubmitIssue />
        {state.message ? (
          <p
            aria-live="polite"
            className={state.status === "error" ? "form-error compact" : "form-success"}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}
