// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const create = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", async (original) => {
  const real = await original<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic { beta = { messages: { create } }; }
  return { APIError: real.APIError, default: Object.assign(FakeAnthropic, { APIError: real.APIError, RateLimitError: real.RateLimitError, AuthenticationError: real.AuthenticationError, PermissionDeniedError: real.PermissionDeniedError, APIConnectionError: real.APIConnectionError }) };
});

import { APIError } from "@anthropic-ai/sdk";
import { aiFailure, askAssistant } from "./assistant";
import { AGENT_ACTIONS } from "./agent/registry";
import { AI_SOURCES } from "./sources";
import { AI_TOOLS, readData } from "./tools";
import { aiUsageCostUsd } from "./usage";

function fakeSupabase() {
  const calls: Array<[string, ...unknown[]]> = [];
  const query: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "eq", "neq", "gte", "lte", "ilike", "is", "not", "order"]) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.limit = (...args) => { calls.push(["limit", ...args]); return Promise.resolve({ data: [{ order_number: "DB-1", total_vnd: 1500000 }], error: null }); };
  const rpc = vi.fn(async () => ({ data: "id", error: null }));
  return { calls, rpc, client: { from: (table: string) => { calls.push(["from", table]); return query; }, rpc } };
}
const usage = (input: number, output: number) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 });

describe("AI assistant", () => {
  beforeEach(() => { create.mockReset(); process.env.ANTHROPIC_API_KEY = "test-key"; });

  it("reads only the sources the person may see, listed columns only, inside the branch", async () => {
    const db = fakeSupabase();
    const context = { supabase: db.client as never, branchId: "branch-a", permissions: new Set(["orders.read", "customers.read"]) };
    const text = await readData(context, { source: "sales_order_read", filters: [{ column: "commercial_state", op: "eq", value: "CONFIRMED" }], order_by: "created_at", descending: true, limit: 5 });
    expect(text).toContain("DB-1");
    expect(db.calls).toEqual(expect.arrayContaining([["from", "sales_order_read"], ["eq", "branch_id", "branch-a"], ["eq", "commercial_state", "CONFIRMED"], ["order", "created_at", { ascending: false }], ["limit", 5]]));
    expect(await readData(context, { source: "payment_read", filters: [], order_by: "", descending: false, limit: 5 })).toMatch(/không có quyền xem/);
    expect(await readData(context, { source: "customers", filters: [{ column: "internal_note", op: "ilike", value: "%a%" }], order_by: "", descending: false, limit: 5 })).toMatch(/cột internal_note/);
  });

  it("runs the tool loop, files a proposal instead of writing, and logs the tokens", async () => {
    const db = fakeSupabase();
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", usage: usage(1000, 50), content: [
        { type: "tool_use", id: "t1", name: "doc_du_lieu", input: { source: "receivable_read", filters: [], order_by: "outstanding_amount_vnd", descending: true, limit: 3 } },
        { type: "tool_use", id: "t2", name: "tao_de_xuat", input: { title: "Nhắc thu nợ KH01", body: "Quá hạn 45 ngày.", link_path: "/admin/receivables" } },
      ] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage: usage(1200, 80), content: [{ type: "text", text: "KH01 nợ nhiều nhất; đã ghi đề xuất nhắc nợ." }] });
    const answer = await askAssistant({ supabase: db.client as never, branchId: "branch-a", permissions: new Set(["finance.ar.read"]), history: [], question: "Ai nợ nhiều nhất?", today: "thứ Năm, 29 tháng 10, 2026" });
    expect(answer).toEqual({ outcome: "OK", text: "KH01 nợ nhiều nhất; đã ghi đề xuất nhắc nợ.", proposals: 1, actionIds: [] });
    const request = create.mock.calls[0][0];
    expect(request).toMatchObject({ model: "claude-sonnet-5-5", fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    expect(request.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(request.tools.map((tool: { name: string }) => tool.name)).toEqual(["doc_du_lieu", "tao_de_xuat", "soan_nhan_tin"]);
    // One chatbot: the read tool lists every source the person may see (here only receivables and the cashbook).
    expect(request.tools[0].input_schema.properties.source.enum).toEqual(["receivable_read", "payment_read"]);
    // The request objects share the growing history: [question, tool calls, tool results, final answer].
    const second = create.mock.calls[1][0].messages.at(-2);
    expect(second.content.map((block: { tool_use_id: string; is_error: boolean }) => [block.tool_use_id, block.is_error])).toEqual([["t1", false], ["t2", false]]);
    expect(db.rpc).toHaveBeenCalledWith("create_ai_proposal", expect.objectContaining({ ai_module: "chatbot", proposal_title: "Nhắc thu nợ KH01", proposal_link: "/admin/receivables" }));
    expect(db.rpc).toHaveBeenLastCalledWith("log_ai_usage", expect.objectContaining({ input_count: 2200, output_count: 130, cache_read_count: 200, call_outcome: "OK" }));
  });

  it("tells the person when the API credit is used up, and logs it", async () => {
    const db = fakeSupabase();
    create.mockRejectedValueOnce(new APIError(402, { type: "error", error: { type: "billing_error", message: "credit" } }, "credit", new Headers(), "billing_error"));
    const answer = await askAssistant({ supabase: db.client as never, branchId: "branch-a", permissions: new Set<string>(), history: [], question: "Tóm tắt", today: "hôm nay" });
    // A person who may read nothing still talks to the assistant, which then only offers proposals.
    expect(create.mock.calls[0][0].tools.map((tool: { name: string }) => tool.name)).toEqual(["tao_de_xuat", "soan_nhan_tin"]);
    expect(answer.outcome).toBe("QUOTA");
    expect(answer.text).toContain("hết hạn mức");
    expect(db.rpc).toHaveBeenLastCalledWith("log_ai_usage", expect.objectContaining({ call_outcome: "QUOTA" }));
  });

  it("calls the picked model, without the refusal fallback for Haiku, with the files before the question (D50)", async () => {
    const db = fakeSupabase();
    const answer = { stop_reason: "end_turn", usage: usage(10, 5), content: [{ type: "text", text: "Được." }] };
    create.mockResolvedValue(answer);
    const image = { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBO" } } as const;
    await askAssistant({ supabase: db.client as never, branchId: "branch-a", permissions: new Set<string>(), history: [], question: "Ảnh này là gì?", today: "hôm nay",
      model: "claude-haiku-5-5", attachments: [image] });
    const haiku = create.mock.calls[0][0];
    expect(haiku.model).toBe("claude-haiku-5-5");
    expect(haiku).not.toHaveProperty("fallbacks");
    expect(haiku).not.toHaveProperty("betas");
    const content = haiku.messages[0].content;
    expect(content[0]).toEqual(image);
    expect(content[1]).toMatchObject({ type: "text", text: expect.stringContaining("Ảnh này là gì?"), cache_control: { type: "ephemeral" } });
    expect(db.rpc).toHaveBeenLastCalledWith("log_ai_usage", expect.objectContaining({ ai_model: "claude-haiku-5-5" }));
    await askAssistant({ supabase: db.client as never, branchId: "branch-a", permissions: new Set<string>(), history: [], question: "Tóm tắt", today: "hôm nay", model: "claude-opus-5-5" });
    expect(create.mock.calls[1][0]).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    expect(create.mock.calls[1][0].messages[0].content).toEqual([{ type: "text", text: expect.stringContaining("Tóm tắt") }]);
  });

  it("asks for a key in Cài đặt when neither the app nor the environment has one", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const db = fakeSupabase();
    const answer = await askAssistant({ supabase: db.client as never, branchId: "branch-a", permissions: new Set<string>(), history: [], question: "Xin chào", today: "hôm nay" });
    expect(answer.text).toMatch(/Cài đặt → Trợ lý AI/);
    expect(create).not.toHaveBeenCalled();
  });

  it("prices each call at its model", () => {
    const tokens = { input: 1_000_000, output: 100_000, cacheRead: 0, cacheWrite: 0 };
    expect(aiUsageCostUsd(tokens, "claude-sonnet-5-5")).toBeCloseTo(3);
    expect(aiUsageCostUsd(tokens, "claude-opus-5-5")).toBeCloseTo(6);
    expect(aiUsageCostUsd(tokens, "claude-haiku-5-5")).toBeCloseTo(0.15);
  });

  it("keeps strict tools to the two small ones even for a person with every permission (API grammar limit)", () => {
    const everything = new Set(["ai.use", "ai.manage", ...AI_SOURCES.map((source) => source.permission), ...AGENT_ACTIONS.flatMap((action) => action.permissions)]);
    const context = { supabase: {} as never, branchId: "branch-a", permissions: everything };
    const tools = AI_TOOLS.flatMap((tool) => { const definition = tool.define(context); return definition ? [definition] : []; });
    expect(tools.length).toBeGreaterThan(10);
    expect(tools.filter((tool) => (tool as { strict?: boolean }).strict).map((tool) => tool.name)).toEqual(["doc_du_lieu", "tao_de_xuat"]);
  });

  it("explains other failures without technical codes and estimates the month's cost", () => {
    expect(aiFailure(new Error("boom")).text).toBe("Chưa hỏi được trợ lý AI. Kiểm tra kết nối rồi thử lại.");
    expect(aiFailure(APIError.generate(400, { type: "error", error: { type: "invalid_request_error", message: "bad" } }, "bad", new Headers())).text).toMatch(/lỗi cấu hình yêu cầu/);
    expect(aiFailure(APIError.generate(529, { type: "error", error: { type: "api_error", message: "down" } }, "down", new Headers())).text).toMatch(/gián đoạn/);
    expect(aiUsageCostUsd({ input: 1_000_000, output: 100_000, cacheRead: 0, cacheWrite: 0 })).toBeCloseTo(3);
  });
});
