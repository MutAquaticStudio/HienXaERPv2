"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Megaphone, ScrollText, Sparkles, Tag, Truck, X } from "lucide-react";

import { AnnouncementLineRow } from "@/components/announcements/announcement-line";
import styles from "@/components/announcements/announcements.module.css";
import portal from "@/components/portal/portal.module.css";
import { Dialog } from "@/components/ui/dialog";
import { QuickCreateFocusGuard } from "@/components/sales/quick-create-focus-guard";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { markAnnouncementsSeenAction } from "@/modules/announcements/actions";
import {
  chipOf, LABEL_NAMES, lineChange, linkLabel, shortDate, signOff, valueText,
  type Announcement, type AnnouncementLine, type AnnouncementSurface,
} from "@/modules/announcements/presentation";

const PORTAL_LINES = 3;
const OFFICE_LINES = 5;

const chipIcon = { price: Tag, pay: Truck, news: Megaphone, feature: Sparkles, rule: ScrollText } as const;

function Chip({ item }: { item: Announcement }) {
  const chip = chipOf(item);
  const Icon = chipIcon[chip.tone];
  return <span className={styles.chip} data-tone={chip.tone}><Icon aria-hidden size={14} strokeWidth={2.2} />{chip.text}</span>;
}

function percentOf(line: AnnouncementLine) {
  if (line.old == null || line.new == null || line.old_kind === "BPS" || BigInt(line.old) === 0n) return null;
  const diff = BigInt(line.new) - BigInt(line.old);
  const tenths = ((diff < 0n ? -diff : diff) * 1000n) / BigInt(line.old);
  return `${(Number(tenths) / 10).toLocaleString("vi-VN")}%`;
}

function Lines({ item, limit, office }: { item: Announcement; limit: number; office: boolean }) {
  const [open, setOpen] = useState(false);
  const shown = open ? item.lines : item.lines.slice(0, limit);
  const hidden = item.lines.length - limit;
  const toggle = hidden > 0 && <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen(!open)}>
    {open ? "Thu gọn" : `Xem thêm ${hidden} ${item.kind === "PAY_RATE" ? "đơn giá" : "mặt hàng"}`}</button>;
  if (!item.lines.length) return null;
  if (office) {
    const from = item.effective_at ? `Từ ${shortDate(item.effective_at)}` : "Giá mới";
    return <>
      <div className="table-wrap"><table className={`card-table ${styles.officeTable}`}>
        <thead><tr><th scope="col">Mã</th><th scope="col">Vật tư</th><th scope="col">ĐVT</th><th scope="col" className={styles.num}>Giá cũ</th>
          <th scope="col" className={styles.num}>{from}</th><th scope="col">Chênh lệch</th></tr></thead>
        <tbody>{shown.map((line) => {
          const change = lineChange(line);
          const pct = percentOf(line);
          return <tr key={`${line.code}-${line.name}-${line.unit}`}>
            <td data-label="Mã">{line.code ?? "—"}</td>
            <td data-label="Vật tư"><strong>{line.name}</strong></td>
            <td data-label="ĐVT">{line.unit ?? "—"}</td>
            <td data-label="Giá cũ" className={styles.num}>{valueText(line.old, line.old_kind)}</td>
            <td data-label={from} className={styles.num}><strong>{valueText(line.new, line.new_kind)}</strong></td>
            <td data-label="Chênh lệch"><span className={styles.delta} data-tone={change.tone}>{change.text}{pct ? ` · ${pct}` : ""}</span></td>
          </tr>;
        })}</tbody>
      </table></div>
      {toggle}
    </>;
  }
  return <><ul className={styles.lines}>{shown.map((line) => <AnnouncementLineRow key={`${line.code}-${line.name}-${line.unit}`} item={item} line={line} />)}</ul>{toggle}</>;
}

function remainingText(remaining: number, next: Announcement | undefined) {
  if (remaining <= 0) return null;
  if (remaining === 1 && next) return `Còn 1 thông báo: ${next.title}`;
  return `Còn ${remaining} thông báo nữa`;
}

/**
 * D83 "Thông báo cập nhật": what changed since the last visit, on the home page of each portal only (a link that opens an order
 * or a job is not interrupted). Several pending: one popup, "1/3", prices first. "Đã hiểu" marks the current one seen and shows
 * the next; "Đóng", Esc or a tap outside marks it seen and leaves the others for the next open. Phone portals: a sheet from the
 * bottom (a centred box on a computer); the office: the shared dialog. Focus stays inside and goes back where it was.
 */
export function UpdatePopup({ items, surface, home }: { items: Announcement[]; surface: AnnouncementSurface; home: string }) {
  const pathname = usePathname();
  const [done, setDone] = useState<ReadonlySet<string>>(() => new Set());
  // D92: "Đóng" leaves the ones pending at that moment for the next open; one that arrives later (the page refreshes when a
  // push comes in) still shows.
  const [closedIds, setClosedIds] = useState<ReadonlySet<string>>(() => new Set());
  const shownItems = items.filter((item) => !closedIds.has(item.id));
  const queue = shownItems.filter((item) => !done.has(item.id));
  const current = queue[0];
  const visible = pathname === home && Boolean(current);

  function seen(item: Announcement) {
    setDone((before) => new Set(before).add(item.id));
    void markAnnouncementsSeenAction({ ids: [item.id], operationId: crypto.randomUUID() }).catch(() => false);
  }
  const acknowledge = () => { if (current) seen(current); };
  const close = () => {
    if (current) seen(current);
    setClosedIds((before) => new Set([...before, ...items.map((item) => item.id)]));
  };

  if (!visible || !current) return null;
  const index = shownItems.indexOf(current) + 1;
  const remaining = queue.length - 1;
  const link = linkLabel(surface, current.link);
  const footNote = remainingText(remaining, queue[1]) ?? (shownItems.length > 1 ? "Đây là thông báo cuối" : null);

  if (surface === "OFFICE") {
    const label = current.kind === "PRICE" ? "Cập nhật giá" : LABEL_NAMES[current.label ?? "NEWS"];
    const eyebrow = [label, shownItems.length > 1 ? `${index}/${shownItems.length}` : null, formatBusinessDateTime(current.updated_at ?? current.created_at)].filter(Boolean).join(" · ");
    return <Dialog title={current.title} eyebrow={eyebrow} onClose={close} size={current.lines.length ? "lg" : "md"} initialFocusId="update-popup-ok">
      <div className={`form-stack ${styles.scope}`}>
        {current.body && <p className={styles.manualBody}>{current.body}</p>}
        <Lines key={current.id} item={current} limit={OFFICE_LINES} office />
        <footer className={styles.officeFoot}>
          {footNote && <p>{footNote}</p>}
          {current.kind === "PRICE" && <Link className="button button-secondary" href="/admin/products/pricing" onClick={acknowledge}>Mở bảng giá</Link>}
          {link && <Link className="button button-secondary" href={current.link!} onClick={acknowledge}>{link}</Link>}
          <button id="update-popup-ok" type="button" className="button button-primary" onClick={acknowledge}>Đã hiểu</button>
        </footer>
      </div>
    </Dialog>;
  }
  return <PortalSheet key={current.id} item={current} index={index} total={shownItems.length} link={link} footNote={footNote} onAcknowledge={acknowledge} onClose={close} />;
}

function PortalSheet({ item, index, total, link, footNote, onAcknowledge, onClose }: {
  item: Announcement; index: number; total: number; link: string | null; footNote: string | null; onAcknowledge: () => void; onClose: () => void;
}) {
  const titleId = useId();
  const okRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    okRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const manual = item.kind === "MANUAL";
  return <div className={portal.sheetBackdrop} role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`${portal.sheet} ${styles.panel} ${styles.scope} ${styles.portal}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <QuickCreateFocusGuard />
      <span className={portal.sheetHandle} aria-hidden="true" />
      <div className={styles.top}>
        <Chip item={item} />
        <span className={styles.topRight}>
          {total > 1 && <span className={styles.count} aria-label={`Thông báo ${index} trên ${total}`}>{index}/{total}</span>}
          <button type="button" className={styles.close} aria-label="Đóng" onClick={onClose}><X aria-hidden size={20} strokeWidth={2.2} /></button>
        </span>
      </div>
      <div className={styles.head}>
        <h2 id={titleId}>{item.title}</h2>
        {!manual && item.body && <p>{item.body}</p>}
      </div>
      {manual && item.body && <p className={styles.manualBody}>{item.body}</p>}
      <Lines item={item} limit={PORTAL_LINES} office={false} />
      {manual && <p className={styles.signOff}>{signOff(item)}</p>}
      <div className={styles.footer}>
        {link && <Link className={portal.buttonSecondary} href={item.link!} onClick={onAcknowledge}>{link}</Link>}
        <button ref={okRef} type="button" className={portal.button} onClick={onAcknowledge}>Đã hiểu</button>
        {footNote && <p>{footNote}</p>}
      </div>
    </section>
  </div>;
}
