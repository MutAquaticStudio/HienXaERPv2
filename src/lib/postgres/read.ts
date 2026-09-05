import "server-only";

import postgres, { type TransactionSql } from "postgres";
import { assertSafeRuntimeConfiguration } from "@/modules/platform/environment";
import { PlatformError } from "@/modules/platform/errors";
import { observeRead, readContext } from "@/lib/postgres/read-observability";

const MAX_ACTIVE_READS = 4;
const READ_TIMEOUT_MS = 45_000;
let activeReads = 0;
const waiting: Array<() => void> = [];

async function acquireRead(): Promise<() => void> {
  if (activeReads >= MAX_ACTIVE_READS) {
    await new Promise<void>((resolve, reject) => {
      const ready = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => {
        const index = waiting.indexOf(ready);
        if (index >= 0) waiting.splice(index, 1);
        reject(new PlatformError("Hệ thống đang bận. Hãy thử lại.", "DATABASE_READ_BUSY", 503));
      }, 5_000);
      waiting.push(ready);
    });
  } else {
    activeReads += 1;
  }
  return () => {
    const next = waiting.shift();
    if (next) next();
    else activeReads -= 1;
  };
}

export async function withDatabaseRead<T>(
  module: string,
  work: (sql: TransactionSql) => Promise<T>,
): Promise<T> {
  assertSafeRuntimeConfiguration();
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new PlatformError("Chưa cấu hình kết nối dữ liệu.", "DATABASE_NOT_CONFIGURED", 503);

  return observeRead(module, async () => {
    const release = await acquireRead();
    // A read owns its connection: a deadline can close it without aborting a write
    // or another request. Transaction-local settings also work with Supavisor.
    let client: ReturnType<typeof postgres> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const endpoint = new URL(url);
      const mode = endpoint.hostname.endsWith(".pooler.supabase.com")
        ? endpoint.port === "6543" ? "transaction-pooler" : "session-pooler"
        : endpoint.hostname.startsWith("db.") ? "direct" : "other";
      console.info(JSON.stringify({ event: "database.connection", module,
        readId: readContext.getStore()?.id, mode, port: endpoint.port || "5432",
      }));
      client = postgres(url, {
        ssl: "require", max: 1, prepare: false, connect_timeout: 10,
        idle_timeout: 10, max_lifetime: 60,
      });
      const readClient = client;
      return await Promise.race([
        client.begin("read only", async (sql) => {
          await sql`set local statement_timeout = '15s'`;
          await sql`set local lock_timeout = '5s'`;
          await sql`set local idle_in_transaction_session_timeout = '15s'`;
          return work(sql);
        }) as Promise<T>,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new PlatformError("Tải dữ liệu quá lâu. Hãy thử lại.", "DATABASE_READ_TIMEOUT", 503));
            void readClient.end({ timeout: 0 }).catch(() => {});
          }, READ_TIMEOUT_MS);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      try { await client?.end({ timeout: 0 }); }
      finally { release(); }
    }
  });
}
