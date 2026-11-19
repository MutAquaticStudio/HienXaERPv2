// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), retrieve: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "branch-a", permissions: new Set(["ai.manage"]) }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@anthropic-ai/sdk", async (original) => {
  const real = await original<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic { models = { retrieve: mocks.retrieve }; }
  return { AuthenticationError: real.AuthenticationError, default: Object.assign(FakeAnthropic, { AuthenticationError: real.AuthenticationError, PermissionDeniedError: real.PermissionDeniedError, NotFoundError: real.NotFoundError }) };
});

import { AuthenticationError } from "@anthropic-ai/sdk";
import { clearAiApiKeyAction, saveAiApiKeyAction } from "./settings-actions";

const KEY = "sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA-wxyz";
const operationId = "6f8c2d4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

describe("Cài đặt → Trợ lý AI: the API key (D50)", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.retrieve.mockResolvedValue({ id: "claude-sonnet-5-5" }); mocks.rpc.mockResolvedValue({ data: "wxyz", error: null }); });

  it("tries the key with Claude, then stores it and shows only its last 4 characters", async () => {
    const result = await saveAiApiKeyAction({ apiKey: ` ${KEY} `, operationId });
    expect(result).toEqual({ ok: true, message: expect.stringContaining("…wxyz") });
    expect(mocks.rpc).toHaveBeenCalledWith("set_ai_api_key", { api_key: KEY, operation_id: operationId });
    expect(result.message).not.toContain("AAAAAAAA");
  });

  it("refuses a key Claude does not accept and keeps the one in use", async () => {
    mocks.retrieve.mockRejectedValue(new AuthenticationError(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, "invalid", new Headers()));
    expect(await saveAiApiKeyAction({ apiKey: KEY, operationId })).toEqual({ ok: false, message: expect.stringMatching(/không nhận khóa này/) });
    mocks.retrieve.mockRejectedValue(new Error("network down"));
    expect(await saveAiApiKeyAction({ apiKey: KEY, operationId })).toEqual({ ok: false, message: expect.stringMatching(/Chưa kiểm tra được khóa/) });
    expect(await saveAiApiKeyAction({ apiKey: "abc", operationId })).toEqual({ ok: false, message: expect.stringMatching(/không đúng định dạng/) });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("removes the key, and reports the database's refusal in Vietnamese", async () => {
    expect(await clearAiApiKeyAction({ operationId })).toEqual({ ok: true, message: "Đã gỡ khóa trong ứng dụng." });
    expect(mocks.rpc).toHaveBeenCalledWith("clear_ai_api_key", { operation_id: operationId });
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "forbidden" } });
    expect(await clearAiApiKeyAction({ operationId })).toEqual({ ok: false, message: "Bạn không có quyền quản lý trợ lý AI." });
  });
});
