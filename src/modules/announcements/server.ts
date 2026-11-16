import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import { parseAnnouncements, type Announcement, type AnnouncementSurface, type ComposerOptions, type SentAnnouncement } from "./presentation";

async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

/** D83: what the popup shows on this portal's home now (at most 5, not seen by this account). Empty when unavailable. */
export async function loadPendingAnnouncements(surface: AnnouncementSurface): Promise<Announcement[]> {
  try {
    return parseAnnouncements(await call("pending_announcements", { surface }));
  } catch {
    return [];
  }
}

/** "Thông báo từ cửa hàng": what this account received, newest first. Null when it could not be read. */
export async function loadAnnouncementHistory(surface: AnnouncementSurface): Promise<Announcement[] | null> {
  try {
    return parseAnnouncements(await call("announcement_history", { surface }));
  } catch {
    return null;
  }
}

/** The owner's "Đã gửi gần đây". Null when it could not be read. */
export async function loadSentAnnouncements(branchId: string): Promise<SentAnnouncement[] | null> {
  try {
    const data = await call("sent_announcements", { target_branch_id: branchId });
    return Array.isArray(data) ? data as SentAnnouncement[] : [];
  } catch {
    return null;
  }
}

/** How many accounts each choice of "Gửi tới" reaches. Null when it could not be read. */
export async function loadComposerOptions(branchId: string): Promise<ComposerOptions | null> {
  try {
    const data = await call("announcement_composer_options", { target_branch_id: branchId }) as ComposerOptions | null;
    return data && typeof data.customers === "number" ? { ...data, roles: Array.isArray(data.roles) ? data.roles : [] } : null;
  } catch {
    return null;
  }
}
