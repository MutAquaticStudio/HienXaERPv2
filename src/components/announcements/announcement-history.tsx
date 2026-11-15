import Link from "next/link";
import styles from "@/components/announcements/announcements.module.css";
import { AnnouncementLineRow } from "@/components/announcements/announcement-line";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { chipOf, linkLabel, type Announcement, type AnnouncementSurface } from "@/modules/announcements/presentation";

/**
 * D83 "Thông báo từ cửa hàng": every announcement this account received (30 newest), to read again after closing the popup.
 * Customers see only their own price lines, exactly as in the popup.
 */
export function AnnouncementHistory({ items, surface, emptyText, first = 5 }: {
  items: Announcement[] | null; surface: AnnouncementSurface; emptyText: string;
  /** Shown at once; the older ones open under "Xem thêm". */
  first?: number;
}) {
  // Inside the worker and customer portals the list takes the portal's colours (D84); in the office the app's.
  const scope = `${styles.scope}${surface === "OFFICE" ? "" : ` ${styles.portal}`}`;
  if (items === null) return <p className="form-message" role="alert">Chưa tải được thông báo. Tải lại trang.</p>;
  if (!items.length) return <p className="muted">{emptyText}</p>;
  const older = items.slice(first);
  return <div className={scope}>
    <HistoryList items={items.slice(0, first)} surface={surface} />
    {older.length > 0 && <details><summary className={styles.toggle}>Xem thêm {older.length} thông báo cũ hơn</summary>
      <HistoryList items={older} surface={surface} /></details>}
  </div>;
}

function HistoryList({ items, surface }: { items: Announcement[]; surface: AnnouncementSurface }) {
  return <ul className={styles.history}>{items.map((item) => {
    const chip = chipOf(item);
    const link = linkLabel(surface, item.link);
    return <li key={item.id} className={styles.historyItem}>
      <header>
        <span className={styles.chip} data-tone={chip.tone}>{chip.text}</span>
        <time dateTime={item.updated_at ?? item.created_at}>{formatBusinessDateTime(item.updated_at ?? item.created_at)}</time>
        {!item.seen_at && <small className={styles.unseen}>Chưa xem</small>}
      </header>
      <h3>{item.title}</h3>
      {item.body && <p className={item.kind === "MANUAL" ? styles.manualBody : undefined}>{item.body}</p>}
      {item.lines.length > 0 && <ul className={styles.lines}>{item.lines.map((line) =>
        <AnnouncementLineRow key={`${line.code}-${line.name}-${line.unit}`} item={item} line={line} />)}</ul>}
      {link && <p><Link href={item.link!}>{link}</Link></p>}
    </li>;
  })}</ul>;
}
