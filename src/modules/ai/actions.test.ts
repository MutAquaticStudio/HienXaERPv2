// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), ask: vi.fn(), history: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "branch-a", permissions: new Set(["ai.use", "orders.read"]) }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/modules/ai/assistant", () => ({ askAssistant: mocks.ask }));
vi.mock("@/modules/ai/chat-history", () => ({ loadAiChat: mocks.history }));

import { askAiAction, newAiChatAction } from "./actions";

describe("chatbot conversation (D36)", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: "id", error: null }); });

  it("sends the stored turns from the first question, with the person's permissions, and keeps the answered turn", async () => {
    mocks.history.mockResolvedValue([{ id: "1", role: "assistant", text: "Chào" }, { id: "2", role: "user", text: "Đơn hôm nay?" }, { id: "3", role: "assistant", text: "3 đơn." }]);
    mocks.ask.mockResolvedValue({ outcome: "OK", text: "Đã giao 2 đơn.", proposals: 0 });
    expect(await askAiAction({ question: "Đã giao mấy đơn?" })).toEqual({ outcome: "OK", text: "Đã giao 2 đơn.", proposals: 0 });
    const call = mocks.ask.mock.calls[0][0];
    expect(call.history).toEqual([{ role: "user", text: "Đơn hôm nay?" }, { role: "assistant", text: "3 đơn." }]);
    expect([...call.permissions]).toEqual(["ai.use", "orders.read"]);
    expect(mocks.rpc).toHaveBeenCalledWith("save_ai_chat_turn", expect.objectContaining({ target_branch_id: "branch-a", question: "Đã giao mấy đơn?", answer: "Đã giao 2 đơn." }));
  });

  it("does not keep a failed turn, and starts a new chat", async () => {
    mocks.history.mockResolvedValue([]);
    mocks.ask.mockResolvedValue({ outcome: "QUOTA", text: "hết hạn mức", proposals: 0 });
    await askAiAction({ question: "Tóm tắt" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(await newAiChatAction()).toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith("start_new_ai_chat", { target_branch_id: "branch-a" });
  });
});
