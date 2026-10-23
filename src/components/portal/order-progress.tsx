import { Check } from "lucide-react";

import styles from "@/components/portal/portal.module.css";
import { portalOrderProgress } from "@/modules/portal/presentation";

/** D29: Đã đặt → Cửa hàng duyệt → Giao hàng → Hoàn tất for one customer order; nothing for a cancelled order. */
export function OrderProgress({ order, compact = false }: { order: Parameters<typeof portalOrderProgress>[0]; compact?: boolean }) {
  const steps = portalOrderProgress(order);
  if (!steps) return null;
  return <ol className={`${styles.progress} ${compact ? styles.progressCompact : ""}`} aria-label="Tiến trình đơn">
    {steps.map((step) => <li key={step.label} className={styles[`step_${step.state}`]} aria-current={step.state === "current" ? "step" : undefined}>
      <span className={styles.stepDot} aria-hidden="true">{step.state === "done" ? <Check size={14} strokeWidth={3} /> : null}</span>
      <span className={styles.stepLabel}>{step.label}{step.state === "done" ? <span className="sr-only"> (xong)</span> : null}</span>
    </li>)}
  </ol>;
}
