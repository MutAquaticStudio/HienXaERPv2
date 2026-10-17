const STEPS = [
  { state: "PLANNED", label: "Lập phiếu" },
  { state: "ASSIGNED", label: "Phân xe" },
  { state: "DISPATCHED", label: "Bàn giao lên xe" },
  { state: "ARRIVED", label: "Tới nơi" },
  { state: "RESULT_SUBMITTED", label: "Báo kết quả" },
  { state: "VERIFIED", label: "Xác minh" },
] as const;

const NEXT: Record<string, string> = {
  PLANNED: "Bước tiếp theo: phân xe và người giao.",
  ASSIGNED: "Bước tiếp theo: bàn giao hàng lên xe (ghi lượng thực lấy).",
  DISPATCHED: "Bước tiếp theo: báo tới nơi giao, rồi gửi kết quả.",
  ARRIVED: "Bước tiếp theo: gửi kết quả giao.",
  RESULT_SUBMITTED: "Bước tiếp theo: xác minh lượng khách nhận và lượng tính tiền.",
  VERIFIED: "Đã hoàn tất. Trả hàng hoặc hao hụt mở hồ sơ riêng.",
};

/** Where a delivery is in its flow and what comes next (FB2 Đợt 3). */
export function DeliveryProgress({ state }: { state: string }) {
  if (state === "CANCELLED") return <p className="form-message" role="status">Phiếu giao đã hủy.</p>;
  const current = STEPS.findIndex((step) => step.state === state);
  return <nav className="delivery-progress" aria-label="Tiến trình giao hàng">
    <ol>{STEPS.map((step, index) => <li key={step.state} className={index < current ? "done" : index === current ? "current" : undefined} aria-current={index === current ? "step" : undefined}>
      <span className="delivery-progress-dot" aria-hidden="true">{index + 1}</span><span>{step.label}</span>
    </li>)}</ol>
    {NEXT[state] && <p className="muted">{NEXT[state]}</p>}
  </nav>;
}
