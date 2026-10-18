import Link from "next/link";
import { revalidatePath } from "next/cache";
import { NotificationList } from "@/components/notifications/notification-bell";
import { requireInternalAccess } from "@/lib/access/context";
import { getNotificationFeedAction, markNotificationsReadAction } from "@/modules/notifications/actions";

const PAGE = 50;

async function markAllRead() {
  "use server";
  await markNotificationsReadAction({ ids: null });
  revalidatePath("/admin/notifications");
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  await requireInternalAccess();
  const query = await searchParams;
  const before = query.before && !Number.isNaN(Date.parse(query.before)) ? new Date(query.before).toISOString() : null;
  const feed = await getNotificationFeedAction({ limit: PAGE, before });
  const items = feed?.items ?? [];
  const last = items.at(-1);
  return <>
    <header className="page-heading"><div><p className="eyebrow">Thông báo</p><h1>Thông báo của chi nhánh</h1>
      <p className="lede">Việc cần xử lý theo quyền của bạn: đơn mua chờ duyệt, phiếu giao chờ xác minh, đơn khách mới…</p></div>
      {feed && feed.unread > 0 && <form action={markAllRead}><button className="button button-secondary" type="submit">Đánh dấu đã đọc hết ({feed.unread})</button></form>}</header>
    <section className="card card-pad">
      {feed ? <NotificationList items={items} /> : <p className="form-message" role="alert">Chưa tải được thông báo. Hãy tải lại trang.</p>}
      <p className="inline-actions">
        {before && <Link className="code-link" href="/admin/notifications">Mới nhất</Link>}
        {items.length === PAGE && last && <Link className="code-link" href={`/admin/notifications?before=${encodeURIComponent(last.created_at)}`}>Cũ hơn</Link>}
      </p>
    </section>
  </>;
}
