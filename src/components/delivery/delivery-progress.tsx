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

// FB11: a supplier delivering straight to the site — staff report "NCC đã giao" with a photo, which verifies the delivery.
const SUPPLIER_STEPS = [
  { states: ["PLANNED"], label: "Lập phiếu" },
  { states: ["ASSIGNED"], label: "Giao cho NCC" },
  { states: ["DISPATCHED", "ARRIVED"], label: "NCC đang giao" },
  { states: ["RESULT_SUBMITTED", "VERIFIED"], label: "NCC đã giao" },
] as const;

const SUPPLIER_NEXT: Record<string, string> = {
  PLANNED: "Bước tiếp theo: giao phiếu cho NCC.",
  ASSIGNED: "Khi hàng tới công trình: tải ảnh lên rồi bấm “NCC đã giao”. Phiếu, đơn bán và đơn mua tự cập nhật.",
  DISPATCHED: "Khi hàng tới công trình: tải ảnh lên rồi bấm “NCC đã giao”. Phiếu, đơn bán và đơn mua tự cập nhật.",
  ARRIVED: "Khi hàng tới công trình: tải ảnh lên rồi bấm “NCC đã giao”. Phiếu, đơn bán và đơn mua tự cập nhật.",
  RESULT_SUBMITTED: "Đã báo NCC giao nhưng hệ thống chưa tự ghi nhận được (ví dụ vượt hạn mức). Kiểm tra rồi xác minh bên dưới.",
  VERIFIED: "Đã hoàn tất: công nợ khách, doanh thu và công nợ NCC đã ghi theo lượng NCC giao.",
};

/** Where a delivery is in its flow and what comes next (FB2 Đợt 3). */
export function DeliveryProgress({ state, supplierDirect = false }: { state: string; supplierDirect?: boolean }) {
  if (state === "CANCELLED") return <p className="form-message" role="status">Phiếu giao đã hủy.</p>;
  const steps = supplierDirect ? SUPPLIER_STEPS : STEPS;
  const next = supplierDirect ? SUPPLIER_NEXT : NEXT;
  const current = steps.findIndex((step) => (step.states as readonly string[]).includes(state));
  return <nav className="delivery-progress" aria-label="Tiến trình giao hàng">
    <ol>{steps.map((step, index) => <li key={step.label} className={index < current || state === "VERIFIED" ? "done" : index === current ? "current" : undefined} aria-current={index === current ? "step" : undefined}>
      <span className="delivery-progress-dot" aria-hidden="true">{index + 1}</span><span>{step.label}</span>
    </li>)}</ol>
    {next[state] && <p className="muted">{next[state]}</p>}
  </nav>;
}
