import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { getDatabaseClient } from "@/lib/postgres/server";
import { PlatformError } from "@/modules/platform/errors";

export async function GET() {
  try {
    const configured = Boolean(getSupabasePublicConfig());
    const production =
      process.env.APP_ENV === "production" &&
      process.env.VERCEL_ENV === "production";
    const databaseConfigured = Boolean(process.env.SUPABASE_DB_URL);
    let databaseReachable = false;

    if (production && !databaseConfigured) {
      throw new PlatformError(
        "Kết nối cơ sở dữ liệu Production chưa được cấu hình.",
        "DATABASE_NOT_CONFIGURED",
        503,
      );
    }

    if (databaseConfigured) {
      const [probe] = await getDatabaseClient()<
        { database_reachable: number }[]
      >`select 1 as database_reachable`;
      databaseReachable = probe?.database_reachable === 1;
      if (!databaseReachable) {
        throw new PlatformError(
          "Cơ sở dữ liệu Production không phản hồi.",
          "DATABASE_UNREACHABLE",
          503,
        );
      }
    }

    return Response.json({
      ok: true,
      service: "hien-xa-erp",
      environment: process.env.APP_ENV ?? "local",
      supabaseConfigured: configured,
      databaseConfigured,
      databaseReachable,
      liveWritesEnabled:
        production &&
        process.env.ALLOW_LIVE_DB_WRITES === "true",
    });
  } catch (error) {
    const message =
      error instanceof PlatformError ? error.message : "Cấu hình không an toàn.";
    return Response.json({ ok: false, error: message }, { status: 503 });
  }
}
