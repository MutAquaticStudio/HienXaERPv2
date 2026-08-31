import { createHash } from "node:crypto";

import {
  IdempotencyConflictError,
  PlatformError,
} from "@/modules/platform/errors";
import { assertPermission, assertResourceAccess } from "@/modules/platform/authorization";
import { assertLiveWriteAllowed, type RuntimeEnvironment } from "@/modules/platform/environment";
import type {
  Permission,
  Principal,
  ScopedResource,
} from "@/modules/platform/types";

export interface CommandRecord<Result> {
  requestHash: string;
  result: Result;
}

export interface CommandTransaction {
  find<Result>(
    actorId: string,
    commandName: string,
    idempotencyKey: string,
  ): Promise<CommandRecord<Result> | null>;
  reserve(input: {
    actorId: string;
    commandName: string;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<void>;
  complete<Result>(input: {
    actorId: string;
    commandName: string;
    idempotencyKey: string;
    result: Result;
  }): Promise<void>;
  appendAudit(input: {
    actorId: string;
    eventType: string;
    entityType: string;
    entityId?: string;
    idempotencyKey: string;
  }): Promise<void>;
}

export interface CommandStore {
  transaction<Result>(
    work: (transaction: CommandTransaction) => Promise<Result>,
  ): Promise<Result>;
}

export interface ServerCommandInput<Payload, Result> {
  commandName: string;
  permission: Permission;
  principal: Principal;
  idempotencyKey: string;
  payload: Payload;
  resource?: ScopedResource;
  entityType: string;
  entityId?: string;
  runtime?: RuntimeEnvironment;
  store: CommandStore;
  execute: (transaction: CommandTransaction) => Promise<Result>;
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function runServerCommand<Payload, Result>(
  input: ServerCommandInput<Payload, Result>,
): Promise<Result> {
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(input.idempotencyKey)) {
    throw new PlatformError(
      "Mã chống gửi trùng không hợp lệ.",
      "INVALID_IDEMPOTENCY_KEY",
      400,
    );
  }

  assertLiveWriteAllowed(input.runtime);
  assertPermission(input.principal, input.permission);
  if (input.resource) assertResourceAccess(input.principal, input.resource);

  const requestHash = stableHash(input.payload);

  return input.store.transaction(async (transaction) => {
    const existing = await transaction.find<Result>(
      input.principal.userId,
      input.commandName,
      input.idempotencyKey,
    );

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new IdempotencyConflictError();
      }
      return existing.result;
    }

    await transaction.reserve({
      actorId: input.principal.userId,
      commandName: input.commandName,
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });

    const result = await input.execute(transaction);

    await transaction.complete({
      actorId: input.principal.userId,
      commandName: input.commandName,
      idempotencyKey: input.idempotencyKey,
      result,
    });
    await transaction.appendAudit({
      actorId: input.principal.userId,
      eventType: `${input.commandName}.completed`,
      entityType: input.entityType,
      entityId: input.entityId,
      idempotencyKey: input.idempotencyKey,
    });

    return result;
  });
}
