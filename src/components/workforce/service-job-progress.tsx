// FB8: where a service job is and what comes next, like the delivery page.
const STEPS = ["Lên lịch", "Giao thợ", "Đang làm", "Chờ xác minh", "Đã xác minh"] as const;

/** Index of the current step from the job and its work item, or -1 when cancelled. */
export function serviceStep(state: string, workState: string | null): number {
  if (state === "CANCELLED") return -1;
  if (state === "VERIFIED") return 4;
  if (state === "RESULT_SUBMITTED" || workState === "DONE") return 3;
  if (state === "IN_PROGRESS" || workState === "IN_PROGRESS") return 2;
  if (workState === "AVAILABLE" || workState === "CLAIMED") return 1;
  return 0;
}

export function serviceNextText({ state, workState, operator, unit, actual }: {
  state: string; workState: string | null; operator: string | null; unit: string; actual: string | null;
}): string {
  if (state === "CANCELLED") return "Đơn dịch vụ đã hủy.";
  if (state === "VERIFIED") return "Đã xác minh: công nợ khách đã ghi theo số lượng tính khách.";
  if (state === "RESULT_SUBMITTED" || workState === "DONE") return `${operator ?? "Thợ"} báo ${actual ?? "?"} ${unit}. Kiểm tra rồi bấm “Xác minh & ghi công nợ”.`;
  if (state === "IN_PROGRESS" || workState === "IN_PROGRESS") return `${operator ?? "Thợ"} đang làm. Xong việc thợ bấm số ${unit} thực tế và “Hoàn tất” trên điện thoại.`;
  if (workState === "CLAIMED") return `${operator ?? "Thợ"} đã nhận việc; chờ bấm “Bắt đầu” khi tới công trình.`;
  if (workState === "AVAILABLE") return "Việc đang chờ thợ nhận trên cổng thợ. Có thể giao thẳng cho một người.";
  return "Bước tiếp theo: giao việc cho thợ (hoặc đưa vào danh sách để thợ tự nhận).";
}

export function ServiceJobProgress(props: { state: string; workState: string | null; operator: string | null; unit: string; actual: string | null }) {
  const current = serviceStep(props.state, props.workState);
  if (current < 0) return <p className="form-message" role="status">Đơn dịch vụ đã hủy trước khi giao việc.</p>;
  return <nav className="delivery-progress service-job-steps" aria-label="Tiến trình đơn dịch vụ">
    <ol>{STEPS.map((label, index) => <li key={label} className={index < current || current === 4 ? "done" : index === current ? "current" : undefined}
      aria-current={index === current ? "step" : undefined}>
      <span className="delivery-progress-dot" aria-hidden="true">{index + 1}</span><span>{label}</span></li>)}</ol>
    <p className="muted">{serviceNextText(props)}</p>
  </nav>;
}
