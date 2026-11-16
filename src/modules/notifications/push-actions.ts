"use server";

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { appPushToken } from "./app-push-token";

const subscription = z.object({
  endpoint: z.url().max(1000).refine((value) => value.startsWith("https://")),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
  userAgent: z.string().max(300).optional(),
});

/** "Bật thông báo trên máy này": stores this browser's push address for the signed-in login (staff, worker or customer — D83). */
export async function savePushSubscriptionAction(input: unknown): Promise<boolean> {
  const parsed = subscription.safeParse(input);
  if (!parsed.success) return false;
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("save_push_subscription", { endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh,
    auth_secret: parsed.data.keys.auth, user_agent: parsed.data.userAgent ?? null });
  return !error;
}

export async function deletePushSubscriptionAction(endpoint: unknown): Promise<boolean> {
  const parsed = z.url().max(1000).safeParse(endpoint);
  if (!parsed.success) return false;
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("delete_push_subscription", { endpoint: parsed.data });
  return !error;
}

const appDevice = z.object({ token: appPushToken, platform: z.literal("ANDROID"), userAgent: z.string().max(300).optional() });

/**
 * D86: inside the Android app — "Bật thông báo trên máy này", or silently when the app may already notify — this phone's
 * Firebase token for the signed-in login. A phone signed in by someone else before is moved to this login.
 */
export async function saveAppPushTokenAction(input: unknown): Promise<boolean> {
  const parsed = appDevice.safeParse(input);
  if (!parsed.success) return false;
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("save_app_push_token", { token: parsed.data.token, platform: parsed.data.platform,
    user_agent: parsed.data.userAgent ?? null });
  return !error;
}

/** D86: the app's notifications are switched off on this phone (Android settings): stop sending to its token. */
export async function deleteAppPushTokenAction(token: unknown): Promise<boolean> {
  const parsed = appPushToken.safeParse(token);
  if (!parsed.success) return false;
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("delete_app_push_token", { token: parsed.data });
  return !error;
}
