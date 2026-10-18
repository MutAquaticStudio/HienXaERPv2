"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { getNotificationFeedAction, markNotificationsReadAction, type NotificationFeed, type NotificationItem } from "@/modules/notifications/actions";
import { createBrowserSupabase } from "@/lib/supabase/browser";

/** Realtime only says "something new for this branch"; the feed is always read again through the authorised command. */
function useNotificationSignal(branchId: string, onSignal: () => void) {
  useEffect(() => {
    let supabase: ReturnType<typeof createBrowserSupabase>;
    try { supabase = createBrowserSupabase(); } catch { return; }
    let active = true;
    const channel = supabase.channel(`notifications-${branchId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `branch_id=eq.${branchId}` }, () => { if (active) onSignal(); });
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token);
      if (active) channel.subscribe();
    })().catch(() => { /* The bell still reloads on focus. */ });
    const reload = () => { if (document.visibilityState === "visible") onSignal(); };
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reload);
    return () => {
      active = false;
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", reload);
      void supabase.removeChannel(channel);
    };
  }, [branchId, onSignal]);
}

export function NotificationList({ items, onOpen }: { items: NotificationItem[]; onOpen?: (item: NotificationItem) => void }) {
  if (!items.length) return <p className="empty-inline">Chưa có thông báo.</p>;
  return <ul className="notification-list">
    {items.map((item) => {
      const content = <><span className="notification-title">{!item.read && <span className="notification-dot" aria-label="Chưa đọc" />}{item.title}</span>
        {item.body && <span className="notification-body">{item.body}</span>}
        <time className="notification-time" dateTime={item.created_at}>{formatBusinessDateTime(item.created_at)}</time></>;
      return <li key={item.id} className={item.read ? "notification-item" : "notification-item unread"}>
        {item.link ? <Link href={item.link} onClick={() => onOpen?.(item)}>{content}</Link> : <div>{content}</div>}
      </li>;
    })}
  </ul>;
}

export function NotificationBell({ branchId }: { branchId: string }) {
  const router = useRouter();
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const load = useCallback(() => { void getNotificationFeedAction({ limit: 10 }).then((next) => { if (next) setFeed(next); }); }, []);
  useEffect(() => { load(); }, [load]);
  useNotificationSignal(branchId, load);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !panel.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) {
        setOpen(false);
        if (event instanceof KeyboardEvent) button.current?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  const unread = feed?.unread ?? 0;
  async function markAll() {
    if (await markNotificationsReadAction({ ids: null })) { load(); router.refresh(); }
  }
  return <div className="notification-bell">
    <button ref={button} type="button" className="notification-button" aria-expanded={open} aria-haspopup="dialog"
      aria-label={unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo"} onClick={() => { setOpen(!open); if (!open) load(); }}>
      <Bell aria-hidden="true" size={22} />{unread > 0 && <span className="notification-count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
    </button>
    {open && <div ref={panel} className="notification-panel" role="dialog" aria-label="Thông báo">
      <div className="notification-head"><strong>Thông báo</strong>
        {unread > 0 && <button type="button" className="link-button" onClick={() => { void markAll(); }}>Đánh dấu đã đọc hết</button>}</div>
      {feed ? <NotificationList items={feed.items} onOpen={(item) => { setOpen(false); if (!item.read) void markNotificationsReadAction({ ids: [item.id] }).then(load); }} />
        : <p className="empty-inline">Đang tải...</p>}
      <Link className="code-link notification-all" href="/admin/notifications" onClick={() => setOpen(false)}>Xem tất cả thông báo</Link>
    </div>}
  </div>;
}
