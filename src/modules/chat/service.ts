import { withDatabaseRead } from "@/lib/postgres/read";
import "server-only";

import { getDatabaseClient } from "@/lib/postgres/server";
import { assertPermission } from "@/modules/platform/authorization";
import { canUseSyntheticAuth } from "@/modules/platform/environment";
import type { CustomerPortalPrincipal } from "@/modules/customer-portal/types";
import { PlatformError } from "@/modules/platform/errors";
import type { Principal } from "@/modules/platform/types";
import {
  SYNTHETIC_CUSTOMER_CHAT,
  SYNTHETIC_OFFICE_CHAT,
  SYNTHETIC_WORKER_CHAT,
} from "@/modules/chat/fixtures";
import {
  executeChatCommand,
  readOperationalChatSnapshot,
} from "@/modules/chat/postgres-repository";
import type { ChatCommand, OperationalChatSnapshot } from "@/modules/chat/types";

export async function getOperationalChatSnapshot(
  principal: Principal,
  surface: "office" | "worker",
): Promise<OperationalChatSnapshot> {
  assertPermission(principal, "chat.read");
  if (canUseSyntheticAuth()) {
    return structuredClone(surface === "worker" ? SYNTHETIC_WORKER_CHAT : SYNTHETIC_OFFICE_CHAT);
  }
  return withDatabaseRead("chat", (sql) => readOperationalChatSnapshot(sql, principal.userId));
}

export async function getCustomerOperationalChatSnapshot(
  principal: CustomerPortalPrincipal,
): Promise<OperationalChatSnapshot> {
  if (canUseSyntheticAuth()) return structuredClone(SYNTHETIC_CUSTOMER_CHAT);
  return withDatabaseRead("chat", (sql) => readOperationalChatSnapshot(sql, principal.authUserId));
}

function permissionFor(command: ChatCommand) {
  if (command.kind === "chat.message.send") return "chat.send" as const;
  if (command.kind === "chat.conversation.close") return "chat.manage" as const;
  return "chat.read" as const;
}

async function runChatCommandForActor(
  actorId: string,
  command: ChatCommand,
  synthetic = canUseSyntheticAuth(),
) {
  if (synthetic) return { id: `synthetic-${command.kind}`, kind: command.kind };
  const result = await getDatabaseClient().begin((sql) => executeChatCommand(sql, actorId, command));
  if (!result.id) {
    throw new PlatformError("Chưa ghi nhận được hội thoại. Hãy thử lại.", "CHAT_COMMAND_FAILED", 503);
  }
  return result;
}

export async function runEmployeeOperationalChatCommand(
  principal: Principal,
  command: ChatCommand,
) {
  assertPermission(principal, permissionFor(command));
  return runChatCommandForActor(principal.userId, command);
}

export async function runCustomerOperationalChatCommand(
  principal: CustomerPortalPrincipal,
  command: ChatCommand,
) {
  return runChatCommandForActor(principal.authUserId, command);
}
