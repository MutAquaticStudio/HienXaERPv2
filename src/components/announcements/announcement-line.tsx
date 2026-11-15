import { ArrowRight } from "lucide-react";
import styles from "@/components/announcements/announcements.module.css";
import { lineChange, unitText, valueText, type Announcement, type AnnouncementLine } from "@/modules/announcements/presentation";

/** One changed line: old → new and the change in words ("Tăng 3.000 ₫"), never only a colour. */
export function AnnouncementLineRow({ item, line }: { item: Announcement; line: AnnouncementLine }) {
  const change = lineChange(line);
  const unit = unitText(item, line);
  return <li>
    <div className={styles.lineHead}><strong>{line.name}</strong>{unit && <span>{unit}</span>}</div>
    <div className={styles.lineValues}>
      {line.old != null && <><span className={styles.old}>{valueText(line.old, line.old_kind)}</span>
        <ArrowRight className={styles.arrow} aria-hidden size={16} strokeWidth={2.2} /><span className="sr-only">thành</span></>}
      {line.new != null && <strong className={styles.next}>{valueText(line.new, line.new_kind)}</strong>}
      <span className={styles.delta} data-tone={change.tone}>{change.text}</span>
    </div>
  </li>;
}
