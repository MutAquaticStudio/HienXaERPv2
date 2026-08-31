import { describe, expect, it } from "vitest";

import {
  assertLiveWriteAllowed,
  assertSafeRuntimeConfiguration,
  canUseSyntheticAuth,
} from "@/modules/platform/environment";

const hostedUrl = "https://example-project.supabase.co";

describe("single hosted Production guard", () => {
  it("fails closed when Preview receives a hosted Supabase endpoint", () => {
    expect(() =>
      assertSafeRuntimeConfiguration({
        appEnv: "production",
        vercelEnv: "preview",
        supabaseUrl: hostedUrl,
      }),
    ).toThrowError(/ngoài Production/i);
  });

  it("rejects privileged credentials outside Production", () => {
    expect(() =>
      assertSafeRuntimeConfiguration({
        appEnv: "local",
        supabaseSecretKey: "not-a-real-secret",
      }),
    ).toThrowError(/đặc quyền/i);
  });

  it("allows a hosted write only in Vercel Production with explicit opt-in", () => {
    expect(() =>
      assertLiveWriteAllowed({
        appEnv: "production",
        vercelEnv: "production",
        supabaseUrl: hostedUrl,
        allowLiveDbWrites: "true",
      }),
    ).not.toThrow();

    expect(() =>
      assertLiveWriteAllowed({
        appEnv: "production",
        vercelEnv: "production",
        supabaseUrl: hostedUrl,
        allowLiveDbWrites: "false",
      }),
    ).toThrowError(/Ghi dữ liệu live bị chặn/i);
  });

  it("permits synthetic authentication only in local or test", () => {
    expect(
      canUseSyntheticAuth({
        appEnv: "test",
        allowLocalSyntheticAuth: "true",
      }),
    ).toBe(true);
    expect(() =>
      canUseSyntheticAuth({
        appEnv: "production",
        vercelEnv: "production",
        allowLocalSyntheticAuth: "true",
      }),
    ).toThrowError(/đăng nhập giả lập/i);
  });
});
