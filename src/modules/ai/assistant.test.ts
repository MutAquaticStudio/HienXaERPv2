// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const create = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", async (original) => {
  const real = await original<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic { beta = { messages: { create } }; }
  return { APIError: real.APIError, default: Object.assign(FakeAnthropic, { APIError: real.APIError, RateLimitError: real.RateLimitError, AuthenticationError: real.AuthenticationError, PermissionDeniedError: real.PermissionDeniedError }) };
});

import { APIError } from "@anthropic-ai/sdk";
import { aiFailure, askAssistant, readData } from "./assistant";
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

  it("reads only listed sources and columns, inside the branch", async () => {
    const db = fakeSupabase();
    const text = await readData(db.client as never, "branch-a", "sales", { source: "sales_order_read", filters: [{ column: "commercial_state", op: "eq", value: "CONFIRMED" }], order_by: "created_at", descending: true, limit: 5 });
    expect(text).toContain("DB-1");
    expect(db.calls).toEqual(expect.arrayContaining([["from", "sales_order_read"], ["eq", "branch_id", "branch-a"], ["eq", "commercial_state", "CONFIRMED"], ["order", "created_at", { ascending: false }], ["limit", 5]]));
    expect(await readData(db.client as never, "branch-a", "sales", { source: "payment_read", filters: [], order_by: "", descending: false, limit: 5 })).toMatch(/không thuộc phạm vi/);
    expect(await readData(db.client as never, "branch-a", "sales", { source: "customers", filters: [{ column: "internal_note", op: "ilike", value: "%a%" }], order_by: "", descending: false, limit: 5 })).toMatch(/cột internal_note/);
  });

  it("runs the tool loop, files a proposal instead of writing, and logs the tokens", async () => {
    const db = fakeSupabase();
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", usage: usage(1000, 50), content: [
        { type: "tool_use", id: "t1", name: "doc_du_lieu", input: { source: "receivable_read", filters: [], order_by: "outstanding_amount_vnd", descending: true, limit: 3 } },
        { type: "tool_use", id: "t2", name: "tao_de_xuat", input: { title: "Nhắc thu nợ KH01", body: "Quá hạn 45 ngày.", link_path: "/admin/receivables" } },
      ] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage: usage(1200, 80), content: [{ type: "text", text: "KH01 nợ nhiều nhất; đã ghi đề xuất nhắc nợ." }] });
    const answer = await askAssistant({ supabase: db.client as never, branchId: "branch-a", module: "finance", history: [], question: "Ai nợ nhiều nhất?", today: "thứ Năm, 29 tháng 10, 2026" });
    expect(answer).toEqual({ outcome: "OK", text: "KH01 nợ nhiều nhất; đã ghi đề xuất nhắc nợ.", proposals: 1 });
    const request = create.mock.calls[0][0];
    expect(request).toMatchObject({ model: "claude-sonnet-5-5", fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    expect(request.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(request.tools.map((tool: { name: string }) => tool.name)).toEqual(["doc_du_lieu", "tao_de_xuat"]);
    // The request objects share the growing history: [question, tool calls, tool results, final answer].
    const second = create.mock.calls[1][0].messages.at(-2);
    expect(second.content.map((block: { tool_use_id: string; is_error: boolean }) => [block.tool_use_id, block.is_error])).toEqual([["t1", false], ["t2", false]]);
    expect(db.rpc).toHaveBeenCalledWith("create_ai_proposal", expect.objectContaining({ proposal_title: "Nhắc thu nợ KH01", proposal_link: "/admin/receivables" }));
    expect(db.rpc).toHaveBeenLastCalledWith("log_ai_usage", expect.objectContaining({ input_count: 2200, output_count: 130, cache_read_count: 200, call_outcome: "OK" }));
  });

  it("tells the person when the API credit is used up, and logs it", async () => {
    const db = fakeSupabase();
    create.mockRejectedValueOnce(new APIError(402, { type: "error", error: { type: "billing_error", message: "credit" } }, "credit", new Headers(), "billing_error"));
    const answer = await askAssistant({ supabase: db.client as never, branchId: "branch-a", module: "overview", history: [], question: "Tóm tắt", today: "hôm nay" });
    expect(answer.outcome).toBe("QUOTA");
    expect(answer.text).toContain("hết hạn mức");
    expect(db.rpc).toHaveBeenLastCalledWith("log_ai_usage", expect.objectContaining({ call_outcome: "QUOTA" }));
  });

  it("explains other failures without technical codes and estimates the month's cost", () => {
    expect(aiFailure(new Error("boom")).text).toBe("Chưa hỏi được trợ lý AI. Kiểm tra kết nối rồi thử lại.");
    expect(aiUsageCostUsd({ input: 1_000_000, output: 100_000, cacheRead: 0, cacheWrite: 0 })).toBeCloseTo(3);
  });
});
