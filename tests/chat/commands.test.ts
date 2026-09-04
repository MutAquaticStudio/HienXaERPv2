import { describe, expect, it } from "vitest";

import { parseChatForm } from "@/modules/chat/commands";

const IDS = {
  context: "10000000-0000-4000-8000-000000000001",
  conversation: "10000000-0000-4000-8000-000000000002",
  evidence: "10000000-0000-4000-8000-000000000003",
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("CHAT1 browser command validation", () => {
  it("accepts only an explicit supported context and a retry-safe message key", () => {
    expect(parseChatForm(form({ kind: "chat.conversation.ensure", contextType: "DELIVERY", contextId: IDS.context }))).toEqual({
      kind: "chat.conversation.ensure", contextType: "DELIVERY", contextId: IDS.context,
    });
    expect(parseChatForm(form({
      kind: "chat.message.send", conversationId: IDS.conversation, body: "Tôi đã đến điểm giao.",
      evidenceId: IDS.evidence, idempotencyKey: "chat-retry-safe-key-2026",
    }))).toEqual({
      kind: "chat.message.send", conversationId: IDS.conversation, body: "Tôi đã đến điểm giao.",
      evidenceId: IDS.evidence, idempotencyKey: "chat-retry-safe-key-2026",
    });
  });

  it("rejects unsupported context, malformed ids, duplicate protection gaps, and invalid close reasons", () => {
    expect(() => parseChatForm(form({ kind: "chat.conversation.ensure", contextType: "PAYMENT", contextId: IDS.context }))).toThrow(/Ngữ cảnh/);
    expect(() => parseChatForm(form({ kind: "chat.message.send", conversationId: "guess", body: "x", idempotencyKey: "chat-retry-safe-key" }))).toThrow(/Hội thoại/);
    expect(() => parseChatForm(form({ kind: "chat.message.send", conversationId: IDS.conversation, body: "x", idempotencyKey: "short" }))).toThrow(/chống gửi trùng/);
    expect(() => parseChatForm(form({ kind: "chat.conversation.close", conversationId: IDS.conversation, reason: "ngắn" }))).toThrow(/Lý do đóng/);
  });
});
