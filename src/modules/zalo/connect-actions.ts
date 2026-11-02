"use server";

import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { appOrigin } from "@/lib/auth/app-origin";
import { isAuthoritativeRejection } from "@/lib/core/command-outcome";
import { createServerSupabase } from "@/lib/supabase/server";
import { zaloMessage } from "./presentation";

export type ZaloConnectResult = { ok: true; message: string; url: string } | { ok: false; message: string };
const unknown: ZaloConnectResult = { ok: false, message: "Chưa xác định được kết quả. Tải lại trang để kiểm tra." };

/** "Kết nối Zalo OA": the database keeps the PKCE secret and returns Zalo's permission page; Zalo calls back /api/zalo/oauth/callback. */
export async function startZaloOAuthAction(appId: unknown): Promise<ZaloConnectResult> {
  const parsed = z.string().trim().regex(/^\d{5,30}$/).safeParse(appId);
  if (!parsed.success) return { ok: false, message: zaloMessage("zalo_app_id_invalid") };
  await requireInternalPermission("roles.manage");
  try {
    const redirect = new URL("/api/zalo/oauth/callback", await appOrigin()).toString();
    const { data, error } = await (await createServerSupabase()).rpc("start_zalo_oauth", { target_app_id: parsed.data, redirect_uri: redirect });
    if (error) return isAuthoritativeRejection(error.code) ? { ok: false, message: zaloMessage(error.message) } : unknown;
    if (typeof data !== "string" || !data.startsWith("https://oauth.zaloapp.com/")) return unknown;
    return { ok: true, message: "Đang mở trang cấp quyền của Zalo…", url: data };
  } catch {
    return unknown;
  }
}

