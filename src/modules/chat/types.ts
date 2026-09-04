export const CHAT_CONTEXT_TYPES = [
  "DELIVERY",
  "SALES_ORDER",
  "SERVICE_JOB",
  "PORTAL_ISSUE",
  "CUSTOMER_SUPPORT",
] as const;

export type ChatContextType = (typeof CHAT_CONTEXT_TYPES)[number];
export type ChatConversationStatus = "OPEN" | "CLOSED";

export interface ChatContextOption {
  contextType: ChatContextType;
  contextId: string;
  subject: string;
  audience: "worker" | "customer" | "office";
}

export interface OperationalChatMessage {
  id: string;
  senderUserId: string;
  senderKind: "EMPLOYEE" | "CUSTOMER";
  senderDisplayName: string;
  body: string;
  evidenceId: string | null;
  createdAt: string;
}

export interface OperationalConversation {
  id: string;
  contextType: ChatContextType;
  contextId: string;
  subject: string;
  status: ChatConversationStatus;
  closedAt: string | null;
  closeReason: string | null;
  unreadCount: number;
  messages: OperationalChatMessage[];
}

export interface OperationalChatSnapshot {
  conversations: OperationalConversation[];
  evidence: Array<{ id: string; label: string }>;
}

export type ChatCommand =
  | { kind: "chat.conversation.ensure"; contextType: ChatContextType; contextId: string }
  | { kind: "chat.message.send"; conversationId: string; body: string; evidenceId: string | null; idempotencyKey: string }
  | { kind: "chat.conversation.mark_read"; conversationId: string }
  | { kind: "chat.conversation.close"; conversationId: string; reason: string };
