import { UpdatePopup } from "@/components/announcements/update-popup";
import { loadPendingAnnouncements } from "@/modules/announcements/server";
import type { AnnouncementSurface } from "@/modules/announcements/presentation";

/**
 * D83: read once when the portal opens (sign-in, opening the app, reloading the tab); the popup then waits for the portal's home
 * page. D92: read again whenever the open page refreshes (LiveRefresh: a push arrived, the tab came back, every minute).
 * Nothing is shown when the announcements cannot be read: the page itself never depends on them.
 */
export async function PendingUpdates({ surface, home }: { surface: AnnouncementSurface; home: string }) {
  const items = await loadPendingAnnouncements(surface);
  if (!items.length) return null;
  return <UpdatePopup items={items} surface={surface} home={home} />;
}
