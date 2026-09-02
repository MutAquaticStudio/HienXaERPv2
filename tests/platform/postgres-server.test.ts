import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sql } from "postgres";

const { postgresMock } = vi.hoisted(() => ({
  postgresMock: vi.fn(),
}));

vi.mock("postgres", () => ({ default: postgresMock }));
vi.mock("server-only", () => ({}));

const originalEnvironment = { ...process.env };

describe("Production Postgres client lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    postgresMock.mockReset();
    process.env.APP_ENV = "production";
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_DB_URL = "postgresql://example.test/db";
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it("recreates a pooler client after its socket closes", async () => {
    const firstClient = (() => {}) as unknown as Sql;
    const secondClient = (() => {}) as unknown as Sql;
    postgresMock
      .mockReturnValueOnce(firstClient)
      .mockReturnValueOnce(secondClient);

    const { getDatabaseClient } = await import("@/lib/postgres/server");

    expect(getDatabaseClient()).toBe(firstClient);
    expect(getDatabaseClient()).toBe(firstClient);

    const firstOptions = postgresMock.mock.calls[0]?.[1] as {
      idle_timeout: number;
      max_lifetime: number;
      onclose: () => void;
    };
    expect(firstOptions.idle_timeout).toBe(10);
    expect(firstOptions.max_lifetime).toBe(300);

    firstOptions.onclose();

    expect(getDatabaseClient()).toBe(secondClient);
    expect(postgresMock).toHaveBeenCalledTimes(2);
  });

  it("does not let an old socket close discard a replacement client", async () => {
    const firstClient = (() => {}) as unknown as Sql;
    const secondClient = (() => {}) as unknown as Sql;
    postgresMock
      .mockReturnValueOnce(firstClient)
      .mockReturnValueOnce(secondClient);

    const { getDatabaseClient } = await import("@/lib/postgres/server");
    getDatabaseClient();
    const firstOptions = postgresMock.mock.calls[0]?.[1] as {
      onclose: () => void;
    };
    firstOptions.onclose();
    getDatabaseClient();

    firstOptions.onclose();

    expect(getDatabaseClient()).toBe(secondClient);
    expect(postgresMock).toHaveBeenCalledTimes(2);
  });
});
