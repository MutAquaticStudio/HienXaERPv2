import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sqlProbe } = vi.hoisted(() => ({ sqlProbe: vi.fn() }));

vi.mock("@/lib/postgres/read", () => ({
  withDatabaseRead: (_module: string, work: (sql: typeof sqlProbe) => unknown) => work(sqlProbe),
}));

vi.mock("@/lib/supabase/config", () => ({
  getSupabasePublicConfig: () => ({
    url: "https://example.supabase.co",
    publishableKey: "test-publishable-key",
  }),
}));

import { GET } from "@/app/api/health/route";

const originalEnvironment = { ...process.env };

describe("Production health check", () => {
  beforeEach(() => {
    process.env.APP_ENV = "production";
    process.env.VERCEL_ENV = "production";
    process.env.ALLOW_LIVE_DB_WRITES = "true";
    process.env.SUPABASE_DB_URL = "postgresql://production.example.test/db";
    sqlProbe.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it("proves the server-only database connection is reachable", async () => {
    sqlProbe.mockResolvedValue([{ database_reachable: 1 }]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      databaseConfigured: true,
      databaseReachable: true,
      liveWritesEnabled: true,
    });
  });

  it("fails closed when Production has no database URL", async () => {
    delete process.env.SUPABASE_DB_URL;

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "Kết nối cơ sở dữ liệu Production chưa được cấu hình.",
    });
    expect(sqlProbe).not.toHaveBeenCalled();
  });

  it("does not expose a database driver error", async () => {
    sqlProbe.mockRejectedValue(new Error("sensitive database driver detail"));

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Cấu hình không an toàn.",
    });
  });
});
