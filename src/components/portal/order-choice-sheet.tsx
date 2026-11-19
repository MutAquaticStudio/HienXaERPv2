"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { ChevronRight, ShoppingBag, Wrench } from "lucide-react";

import styles from "@/components/portal/portal.module.css";

/**
 * "Bạn muốn đặt gì?" (D75): the sheet the green "Đặt" button of the customer menu opens, with the two ways to order as equal
 * choices — goods delivered to the site, or a service the store schedules. It traps the focus, closes with Escape, the
 * backdrop or "Đóng", and gives the focus back to the button that opened it.
 */
export function OrderChoiceSheet({ onClose, returnFocusTo }: { onClose: () => void; returnFocusTo: HTMLElement | null }) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const node = panel.current;
    node?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); returnFocusTo?.focus(); };
  }, [returnFocusTo]);

  return <div className={styles.sheetBackdrop} role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <span className={styles.sheetHandle} aria-hidden="true" />
      <h2 id={titleId}>Bạn muốn đặt gì?</h2>
      <Link className={styles.sheetChoice} href="/customer/orders/new" onClick={onClose}>
        <span className={`${styles.sheetIcon} ${styles.sheetIconGoods}`}><ShoppingBag aria-hidden size={26} /></span>
        <span><strong>Hàng hóa</strong><small>Xi măng, sắt, gạch, cát đá… giao đến công trình.</small></span>
        <ChevronRight aria-hidden size={20} />
      </Link>
      <Link className={styles.sheetChoice} href="/customer/services/new" onClick={onClose}>
        <span className={`${styles.sheetIcon} ${styles.sheetIconService}`}><Wrench aria-hidden size={26} /></span>
        <span><strong>Dịch vụ</strong><small>Chạc, máy xúc, máy nâng, vận chuyển, công nhật… Cửa hàng xếp lịch cho bạn.</small></span>
        <ChevronRight aria-hidden size={20} />
      </Link>
      <button type="button" className={styles.sheetClose} onClick={onClose}>Đóng</button>
    </section>
  </div>;
}
