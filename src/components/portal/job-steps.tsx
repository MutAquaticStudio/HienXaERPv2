import styles from "@/components/portal/portal.module.css";
import { jobSteps } from "@/modules/portal/presentation";

/** FB18: Nhận việc → Lấy hàng → Đang giao → Đã giao (or the service steps), done ones ticked, the current one ringed. */
export function JobSteps({ job, tone = "light" }: { job: Parameters<typeof jobSteps>[0]; tone?: "light" | "onBlue" }) {
  const { labels, done } = jobSteps(job);
  return <ol className={`${styles.steps} ${tone === "onBlue" ? styles.stepsOnBlue : ""}`} aria-label="Các bước">
    {labels.map((label, index) => {
      const state = index < done ? "done" : index === done ? "current" : "todo";
      return <li key={label} data-state={state} aria-current={state === "current" ? "step" : undefined}>
        <span className={styles.stepBar} aria-hidden="true" /><span>{label}</span>
      </li>;
    })}
  </ol>;
}
