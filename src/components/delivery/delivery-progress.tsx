// FB7: staff assign the driver and the truck; the worker loads the truck and reports "Đã giao", which verifies the delivery.
const STEPS = [
  { states: ["PLANNED"], label: "Lập phiếu" },
  { states: ["ASSIGNED"], label: "Phân người & xe" },
  { states: ["DISPATCHED", "ARRIVED"], label: "Thợ lấy hàng lên xe" },
  { states: ["RESULT_SUBMITTED", "VERIFIED"], label: "Thợ đã giao" },
] as const;

const NEXT: Record<string, string> = {
  PLANNED: "Bước tiếp theo: phân người giao và xe; việc tự sang cổng thợ.",
  ASSIGNED: "Bước tiếp theo: thợ bấm “Đã lấy hàng lên xe” (kèm ảnh) trên cổng thợ.",
  DISPATCHED: "Thợ đang giao. Thợ bấm “Đã giao” (kèm ảnh) là phiếu tự hoàn tất.",
  ARRIVED: "Thợ đang giao. Thợ bấm “Đã giao” (kèm ảnh) là phiếu tự hoàn tất.",
  RESULT_SUBMITTED: "Thợ đã báo giao nhưng hệ thống chưa tự ghi nhận được (ví dụ vượt hạn mức). Kiểm tra rồi xác minh bên dưới.",
  VERIFIED: "Đã hoàn tất: công nợ, doanh thu và giá vốn đã ghi theo lượng thợ báo.",
};

/** Where a delivery is in its flow and what comes next (FB2 Đợt 3). */
export function DeliveryProgress({ state }: { state: string }) {
  if (state === "CANCELLED") return <p className="form-message" role="status">Phiếu giao đã hủy.</p>;
  const current = STEPS.findIndex((step) => (step.states as readonly string[]).includes(state));
  return <nav className="delivery-progress" aria-label="Tiến trình giao hàng">
    <ol>{STEPS.map((step, index) => <li key={step.label} className={index < current || state === "VERIFIED" ? "done" : index === current ? "current" : undefined} aria-current={index === current ? "step" : undefined}>
      <span className="delivery-progress-dot" aria-hidden="true">{index + 1}</span><span>{step.label}</span>
    </li>)}</ol>
    {NEXT[state] && <p className="muted">{NEXT[state]}</p>}
  </nav>;
}
