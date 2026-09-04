import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function migration() {
  const directory = join(process.cwd(), "supabase/migrations");
  const name = readdirSync(directory).find((item) => item.endsWith("_chat1_operational_chat.sql"));
  expect(name).toBeTruthy();
  return readFileSync(join(directory, name as string), "utf8");
}

describe("CHAT1 durable communication boundary", () => {
  it("persists participant-scoped messages, keeps browser writes closed, and publishes only committed rows", () => {
    const sql = migration();
    for (const table of ["conversations", "conversation_participants", "conversation_messages"]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain("unique (conversation_id, sender_user_id, client_idempotency_key)");
    expect(sql).toContain("create trigger conversation_messages_immutable");
    expect(sql).toContain("revoke all on public.conversations, public.conversation_participants, public.conversation_messages");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+public\.conversation_messages\s+to\s+authenticated/i);
    expect(sql).toContain("alter publication supabase_realtime add table public.conversation_messages");
    expect(sql).toContain("authenticated_chat_context_authorized");
  });

  it("authorizes by an active participant plus context and never turns text into a business command", () => {
    const sql = migration();
    const sendBody = sql.slice(sql.indexOf("create or replace function app_private.send_operational_message"), sql.indexOf("create or replace function app_private.mark_operational_conversation_read"));
    expect(sendBody).toContain("chat_context_authorized");
    expect(sendBody).toContain("CHAT_PARTICIPANT_REQUIRED");
    expect(sendBody).toContain("conversation.status <> 'OPEN'");
    expect(sendBody).toContain("CHAT_EVIDENCE_ACCESS_DENIED");
    expect(sendBody).not.toMatch(/(?:update|insert\s+into|delete\s+from)\s+public\.(deliveries|sales_orders|receivables|payments|payment_allocations|work_items|service_jobs)\b/i);
    expect(sql).toContain("evidence_read_chat_participant");
    expect(sql).toContain("evidence_objects_read_chat_participant");
    expect(sql).toContain("ended assignment also ends CHAT1 read access immediately");
  });

  it("keeps Realtime as UI transport after a durable send rather than the source of truth", () => {
    const component = readFileSync(join(process.cwd(), "src/components/operational-chat-panel.tsx"), "utf8");
    const action = readFileSync(join(process.cwd(), "src/app/chat/actions.ts"), "utf8");
    expect(component).toContain("event: \"INSERT\", schema: \"public\", table: \"conversation_messages\"");
    expect(component).toContain("router.refresh()");
    expect(action).toContain("runCustomerOperationalChatCommand");
    expect(action).toContain("runEmployeeOperationalChatCommand");
    expect(action).toContain("không thay đổi báo giá, giao hàng hoặc thanh toán");
  });
});
