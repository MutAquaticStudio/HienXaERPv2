"use server";

import { z } from "zod";
import { requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

export type NotificationItem = { id: string; kind: string; title: string; body: string | null; link: string | null; created_at: string; read: boolean };
export type NotificationFeed = { unread: number; items: NotificationItem[] };

const feedInput = z.object({ limit: z.number().int().min(1).max(100).default(10), before: z.iso.datetime({ offset: true }).nullable().default(null) });
const markInput = z.object({ ids: z.array(z.uuid()).max(200).nullable() });

/** The bell and /admin/notifications: newest notifications of the active branch the employee may see. Null when unavailable. */
export async function getNotificationFeedAction(input: unknown = {}): Promise<NotificationFeed | null> {
  const parsed = feedInput.safeParse(input ?? {});
  if (!parsed.success) return null;
  const access = await requireInternalAccess();
  const supabase = await createServerSupabase();
  try {
    const { data, error } = await supabase.rpc("notification_feed", { target_branch_id: access.branchId, page_limit: parsed.data.limit, before_at: parsed.data.before });
    if (error || !data) return null;
    const feed = data as NotificationFeed;
    return { unread: Number(feed.unread ?? 0), items: Array.isArray(feed.items) ? feed.items : [] };
  } catch {
    return null;
  }
}

/** Marks the given notifications read for this login, or all of the branch when ids is null. False when it did not go through. */
export async function markNotificationsReadAction(input: unknown): Promise<boolean> {
  const parsed = markInput.safeParse(input);
  if (!parsed.success) return false;
  const access = await requireInternalAccess();
  const supabase = await createServerSupabase();
  try {
    const { error } = await supabase.rpc("mark_notifications_read", { target_branch_id: access.branchId, notification_ids: parsed.data.ids });
    return !error;
  } catch {
    return false;
  }
}
