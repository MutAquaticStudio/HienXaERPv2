import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { PlatformError } from "@/modules/platform/errors";

export function GET() {
  try {
    const configured = Boolean(getSupabasePublicConfig());
    return Response.json({
      ok: true,
      service: "hien-xa-erp",
      environment: process.env.APP_ENV ?? "local",
      supabaseConfigured: configured,
      liveWritesEnabled:
        process.env.APP_ENV === "production" &&
        process.env.VERCEL_ENV === "production" &&
        process.env.ALLOW_LIVE_DB_WRITES === "true",
    });
  } catch (error) {
    const message =
      error instanceof PlatformError ? error.message : "Cấu hình không an toàn.";
    return Response.json({ ok: false, error: message }, { status: 503 });
  }
}
