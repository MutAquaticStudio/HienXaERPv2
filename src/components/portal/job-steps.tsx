import { Check } from "lucide-react";

import styles from "@/components/portal/portal.module.css";
import { jobSteps } from "@/modules/portal/presentation";

/** FB18: Nhận việc → Lấy hàng → Đang giao → Đã giao (or the service steps), done ones ticked, the current one ringed. */
/** `circles` (job detail, concept): numbered circles, ticked when done, the current one ringed. */
export function JobSteps({ job, tone = "light", variant = "bars" }: { job: Parameters<typeof jobSteps>[0]; tone?: "light" | "onBlue"; variant?: "bars" | "circles" }) {
  const { labels, done } = jobSteps(job);
  return <ol className={`${styles.steps} ${tone === "onBlue" ? styles.stepsOnBlue : ""} ${variant === "circles" ? styles.stepsCircles : ""}`} aria-label="Các bước">
    {labels.map((label, index) => {
      const state = index < done ? "done" : index === done ? "current" : "todo";
      return <li key={label} data-state={state} aria-current={state === "current" ? "step" : undefined}>
        {variant === "circles"
          ? <span className={styles.stepCircle} aria-hidden="true">{state === "done" ? <Check size={14} strokeWidth={3} /> : index + 1}</span>
          : <span className={styles.stepBar} aria-hidden="true" />}<span>{label}</span>
      </li>;
    })}
  </ol>;
}
