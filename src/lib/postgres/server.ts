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

  if (databaseClient) return databaseClient;

  const client = postgres(connectionString, {
    ssl: "require",
    max: 1,
    // Vercel may freeze a function while the pooler closes an idle socket.
    // Keep the pooler-friendly lifetime short and discard the singleton when
    // the socket closes so the next invocation establishes a fresh connection.
    idle_timeout: 10,
    max_lifetime: 300,
    connect_timeout: 10,
    prepare: false,
    onclose: () => {
      if (databaseClient === client) databaseClient = null;
    },
  });
  databaseClient = client;
  return client;
}
