import "server-only";

import postgres, { type Sql } from "postgres";

import { assertSafeRuntimeConfiguration } from "@/modules/platform/environment";
import { PlatformError } from "@/modules/platform/errors";

let databaseClient: Sql | null = null;

export function getDatabaseClient(): Sql {
  assertSafeRuntimeConfiguration();
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new PlatformError(
      "Kết nối cơ sở dữ liệu Production chưa được cấu hình.",
      "DATABASE_NOT_CONFIGURED",
      503,
    );
  }

  databaseClient ??= postgres(connectionString, {
    ssl: "require",
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return databaseClient;
}
