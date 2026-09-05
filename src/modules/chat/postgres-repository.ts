import { observeRead } from "@/lib/postgres/read-observability";
import "server-only";

import type { Sql, TransactionSql } from "postgres";

import { PlatformError } from "@/modules/platform/errors";
import type {
  ChatCommand,
  ChatContextType,
  OperationalChatSnapshot,
  OperationalConversation,
} from "@/modules/chat/types";

interface ConversationRow {
  id: string;
  context_type: ChatContextType;
  context_id: string;
  subject_snapshot: string;
  status: "OPEN" | "CLOSED";
  closed_at: string | null;
  close_reason: string | null;
  last_read_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  sender_kind: "EMPLOYEE" | "CUSTOMER";
  sender_display_name_snapshot: string;
  body: string;
  evidence_id: string | null;
  created_at: string;
}

function readFailed(): never {
  throw new PlatformError(
    "Chưa đọc được hội thoại vận hành. Dữ liệu nghiệp vụ vẫn giữ nguyên; hãy tải lại.",
    "CHAT_READ_FAILED",
    503,
  );
}

export async function readOperationalChatSnapshot(
  sql: Sql | TransactionSql,
  actorId: string,
): Promise<OperationalChatSnapshot> {
  const conversationRows = await observeRead("chat.readOperationalChatSnapshot.1", () => sql<ConversationRow[]>`
    select conversation.id, conversation.context_type, conversation.context_id,
      conversation.subject_snapshot, conversation.status, conversation.closed_at::text,
      conversation.close_reason, participant.last_read_at::text
    from public.conversations conversation
    join public.conversation_participants participant
      on participant.conversation_id = conversation.id
    where participant.actor_user_id = ${actorId}
    order by conversation.created_at desc
    limit 100
  `);
  const ids = conversationRows.map((conversation) => conversation.id);
  const [messageRows, evidenceRows] = await Promise.all([
    ids.length
      ? observeRead("chat.readOperationalChatSnapshot.2", () => sql<MessageRow[]>`
          select id, conversation_id, sender_user_id, sender_kind,
            sender_display_name_snapshot, body, evidence_id, created_at::text
          from public.conversation_messages
          where conversation_id = any(${ids}::uuid[])
          order by created_at asc, id asc
        `)
      : Promise.resolve([] as MessageRow[]),
    observeRead("chat.readOperationalChatSnapshot.3", () => sql<{ id: string; storage_path: string }[]>`
      select id, storage_path from public.evidence
      where owner_user_id = ${actorId}
      order by created_at desc limit 100
    `),
  ]);
  if (!conversationRows || !messageRows || !evidenceRows) readFailed();
  const conversations: OperationalConversation[] = conversationRows.map((conversation) => {
    const messages = messageRows
      .filter((message) => message.conversation_id === conversation.id)
      .slice(-80)
      .map((message) => ({
        id: message.id,
        senderUserId: message.sender_user_id,
        senderKind: message.sender_kind,
        senderDisplayName: message.sender_display_name_snapshot,
        body: message.body,
        evidenceId: message.evidence_id,
        createdAt: message.created_at,
      }));
    return {
      id: conversation.id,
      contextType: conversation.context_type,
      contextId: conversation.context_id,
      subject: conversation.subject_snapshot,
      status: conversation.status,
      closedAt: conversation.closed_at,
      closeReason: conversation.close_reason,
      unreadCount: messages.filter((message) => message.createdAt > conversation.last_read_at && message.senderUserId !== actorId).length,
      messages,
    };
  });
  return {
    conversations,
    evidence: evidenceRows.map((evidence) => ({ id: evidence.id, label: evidence.storage_path })),
  };
}

export async function executeChatCommand(
  sql: TransactionSql,
  actorId: string,
  command: ChatCommand,
) {
  if (command.kind === "chat.conversation.ensure") {
    const [row] = await sql<{ id: string }[]>`
      select app_private.ensure_operational_conversation(
        ${command.contextType}, ${command.contextId}, ${actorId}
      ) as id
    `;
    if (!row?.id) throw new PlatformError("Chưa mở được hội thoại. Hãy thử lại.", "CHAT_OPEN_FAILED", 503);
    return { id: row.id, kind: command.kind };
  }
  if (command.kind === "chat.message.send") {
    const [row] = await sql<{ id: string }[]>`
      select app_private.send_operational_message(
        ${command.conversationId}, ${command.body}, ${command.evidenceId},
        ${command.idempotencyKey}, ${actorId}
      ) as id
    `;
    if (!row?.id) throw new PlatformError("Chưa ghi nhận được tin nhắn. Hãy thử lại.", "CHAT_SEND_FAILED", 503);
    return { id: row.id, kind: command.kind };
  }
  if (command.kind === "chat.conversation.mark_read") {
    await sql`select app_private.mark_operational_conversation_read(${command.conversationId}, ${actorId})`;
    return { id: command.conversationId, kind: command.kind };
  }
  const [row] = await sql<{ id: string }[]>`
    select app_private.close_operational_conversation(
      ${command.conversationId}, ${command.reason}, ${actorId}
    ) as id
  `;
  if (!row?.id) throw new PlatformError("Chưa đóng được hội thoại. Hãy thử lại.", "CHAT_CLOSE_FAILED", 503);
  return { id: row.id, kind: command.kind };
}
