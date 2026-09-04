import "server-only";

import { getDatabaseClient } from "@/lib/postgres/server";
import { executePortalIssueCommand } from "@/modules/portal-issues/postgres-repository";
import type { PortalIssueCommandInput } from "@/modules/portal-issues/types";
import { canUseSyntheticAuth } from "@/modules/platform/environment";
import {
  getTransactionSql,
  PostgresCommandStore,
} from "@/modules/platform/postgres-command-store";
import {
  runServerCommand,
  type CommandRecord,
  type CommandStore,
  type CommandTransaction,
} from "@/modules/platform/server-command";
import type { Principal } from "@/modules/platform/types";

class SyntheticTransaction implements CommandTransaction {
  private readonly records = new Map<string, CommandRecord<unknown>>();

  private key(actorId: string, commandName: string, idempotencyKey: string) {
    return `${actorId}:${commandName}:${idempotencyKey}`;
  }

  async find<Result>(actorId: string, commandName: string, idempotencyKey: string) {
    return (this.records.get(this.key(actorId, commandName, idempotencyKey)) ?? null) as CommandRecord<Result> | null;
  }

  async reserve(input: { actorId: string; commandName: string; idempotencyKey: string; requestHash: string }) {
    this.records.set(this.key(input.actorId, input.commandName, input.idempotencyKey), {
      requestHash: input.requestHash,
      result: null,
    });
  }

  async complete<Result>(input: { actorId: string; commandName: string; idempotencyKey: string; result: Result }) {
    const key = this.key(input.actorId, input.commandName, input.idempotencyKey);
    this.records.set(key, {
      requestHash: this.records.get(key)?.requestHash ?? "synthetic",
      result: input.result,
    });
  }

  async appendAudit() {}
}

class SyntheticStore implements CommandStore {
  private readonly state = new SyntheticTransaction();

  async transaction<Result>(work: (transaction: CommandTransaction) => Promise<Result>) {
    return work(this.state);
  }
}

export async function runPortalIssueCommand(
  principal: Principal,
  idempotencyKey: string,
  input: PortalIssueCommandInput,
) {
  const synthetic = canUseSyntheticAuth();
  return runServerCommand({
    commandName: input.kind,
    permission: "work_item.update_self",
    principal,
    idempotencyKey,
    payload: input,
    entityType: "portal_issue",
    entityId: input.sourceId,
    store: synthetic ? new SyntheticStore() : new PostgresCommandStore(getDatabaseClient()),
    execute: async (transaction) =>
      synthetic
        ? { id: `synthetic-${input.sourceId}`, kind: input.kind }
        : executePortalIssueCommand(
            getTransactionSql(transaction),
            principal,
            idempotencyKey,
            input,
          ),
  });
}
