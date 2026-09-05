import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createPostgres } = vi.hoisted(() => ({ createPostgres: vi.fn() }));
vi.mock("postgres", () => ({ default: createPostgres }));
vi.mock("server-only", () => ({}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("bounded snapshot reads", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ALLOW_LOCAL_SYNTHETIC_AUTH", "false");
    vi.stubEnv("SUPABASE_DB_URL", "postgres://example.test/test");
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    createPostgres.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function client() {
    const sql = vi.fn().mockResolvedValue([]);
    const connection = {
      begin: vi.fn(async (_mode, work) => work(sql)),
      end: vi.fn().mockResolvedValue(undefined),
    };
    createPostgres.mockReturnValue(connection);
    return { ...connection, sql };
  }

  it("uses transaction-local query/lock limits and closes a completed read", async () => {
    const connection = client();
    const { withDatabaseRead } = await import("@/lib/postgres/read");
    await expect(withDatabaseRead("sales", async () => ({ ok: true }))).resolves.toEqual({ ok: true });
    expect(connection.begin.mock.calls[0]?.[0]).toBe("read only");
    expect(connection.sql.mock.calls.map(call => call[0].join(""))).toEqual([
      "set local statement_timeout = '15s'",
      "set local lock_timeout = '5s'",
      "set local idle_in_transaction_session_timeout = '15s'",
    ]);
    expect(connection.end).toHaveBeenCalledWith({ timeout: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("terminates the owning read connection when its query never settles", async () => {
    const connection = client();
    const { withDatabaseRead } = await import("@/lib/postgres/read");
    const result = withDatabaseRead("sales", () => new Promise(() => {}));
    const assertion = expect(result).rejects.toMatchObject({ code: "DATABASE_READ_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(45_000);
    await assertion;
    expect(connection.end).toHaveBeenCalledWith({ timeout: 0 });
  });

  it("bounds acquisition wait without closing another reader", async () => {
    const connection = client();
    const { withDatabaseRead } = await import("@/lib/postgres/read");
    const gate = deferred<number>();
    const active = Array.from({ length: 4 }, () => withDatabaseRead("active", () => gate.promise));
    const queued = withDatabaseRead("queued", async () => 5);
    const assertion = expect(queued).rejects.toMatchObject({ code: "DATABASE_READ_BUSY" });
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    expect(createPostgres).toHaveBeenCalledTimes(4);
    expect(connection.end).not.toHaveBeenCalled();
    gate.resolve(1);
    await Promise.all(active);
    await expect(withDatabaseRead("recovered", async () => 2)).resolves.toBe(2);
  });

  it("releases capacity when client construction fails", async () => {
    createPostgres.mockImplementation(() => { throw new Error("invalid connection"); });
    const { withDatabaseRead } = await import("@/lib/postgres/read");
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(withDatabaseRead("bad-config", async () => 0)).rejects.toThrow("invalid connection");
    }
    expect(vi.getTimerCount()).toBe(0);
  });
});
