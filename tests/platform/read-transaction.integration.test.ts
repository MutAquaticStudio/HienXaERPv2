import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import EmbeddedPostgres from "embedded-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("postgres", async () => {
  const original = await vi.importActual<{ default: typeof import("postgres") }>("postgres");
  return { default: (url: string, options: Record<string, unknown>) => {
    if (new URL(url).hostname !== "127.0.0.1") throw new Error("Integration tests require a loopback database.");
    return original.default(url, { ...options, ssl: false });
  } };
});

describe("real PostgreSQL read transaction", () => {
  let database: EmbeddedPostgres;
  let started = false;

  beforeAll(async () => {
    const socket = createServer();
    await new Promise<void>(resolve => socket.listen(0, "127.0.0.1", resolve));
    const address = socket.address();
    if (!address || typeof address === "string") throw new Error("No test port");
    const port = address.port;
    await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
    const directory = await mkdtemp(join(tmpdir(), "hienxa-read-transaction-"));
    database = new EmbeddedPostgres({
      databaseDir: directory, port, user: "postgres", password: "local-test-only",
      authMethod: "scram-sha-256", persistent: false, onLog: () => {}, onError: () => {},
    });
    await database.initialise();
    await database.start();
    started = true;
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ALLOW_LOCAL_SYNTHETIC_AUTH", "false");
    vi.stubEnv("SUPABASE_DB_URL", `postgres://postgres:local-test-only@127.0.0.1:${port}/postgres`);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  }, 30_000);

  afterAll(async () => {
    if (started) await database.stop();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("enforces read-only mode and transaction-local settings in PostgreSQL", async () => {
    const { withDatabaseRead } = await import("@/lib/postgres/read");
    const result = await withDatabaseRead("settings", sql => sql`
      select current_setting('transaction_read_only') as read_only,
        current_setting('statement_timeout') as statement_timeout,
        current_setting('lock_timeout') as lock_timeout
    `);
    expect(result[0]).toMatchObject({ read_only: "on", statement_timeout: "15s", lock_timeout: "5s" });
    await expect(withDatabaseRead("reject-write", sql => sql`create table should_not_exist (id int)`)).rejects.toMatchObject({ code: "25006" });
  });

  it("cancels a slow SQL statement and allows a fresh read afterward", async () => {
    const { withDatabaseRead } = await import("@/lib/postgres/read");
    await expect(withDatabaseRead("slow-query", async sql => {
      await sql`set local statement_timeout = '50ms'`;
      return sql`select pg_sleep(1)`;
    })).rejects.toMatchObject({ code: "57014" });
    const recovered = await withDatabaseRead("recovered", sql => sql`select 1 as ok`);
    expect(recovered[0]?.ok).toBe(1);
  });
});
