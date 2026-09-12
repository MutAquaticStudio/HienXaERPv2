import "server-only";

import postgres from "postgres";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
let client: ReturnType<typeof postgres> | undefined;

export function assertLocalDatabaseUrl(rawUrl = process.env.DATABASE_URL): string {
  if (!rawUrl) throw new Error("DATABASE_URL is required for database access.");
  const parsed = new URL(rawUrl);
  if (!LOCAL_HOSTS.has(parsed.hostname)) throw new Error("Database guard rejected a non-local host.");
  return rawUrl;
}

export function getDatabase() {
  if (!client) {
    client = postgres(assertLocalDatabaseUrl(), {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 5,
      prepare: false,
    });
  }
  return client;
}
