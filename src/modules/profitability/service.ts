import "server-only";

import { getDatabaseClient } from "@/lib/postgres/server";
import type { ProfitabilityCommandInput } from "@/modules/profitability/commands";
import { SYNTHETIC_PROFITABILITY } from "@/modules/profitability/fixtures";
import {
  executeProfitabilityCommand,
  readProfitabilitySnapshot,
} from "@/modules/profitability/postgres-repository";
import type { ProfitabilitySnapshot } from "@/modules/profitability/types";
import { assertPermission } from "@/modules/platform/authorization";
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
  async find<Result>(
    actorId: string,
    commandName: string,
    idempotencyKey: string,
  ) {
    return (this.records.get(this.key(actorId, commandName, idempotencyKey)) ??
      null) as CommandRecord<Result> | null;
  }
  async reserve(input: {
    actorId: string;
    commandName: string;
    idempotencyKey: string;
    requestHash: string;
  }) {
    this.records.set(
      this.key(input.actorId, input.commandName, input.idempotencyKey),
      {
        requestHash: input.requestHash,
        result: null,
      },
    );
  }
  async complete<Result>(input: {
    actorId: string;
    commandName: string;
    idempotencyKey: string;
    result: Result;
  }) {
    const key = this.key(
      input.actorId,
      input.commandName,
      input.idempotencyKey,
    );
    this.records.set(key, {
      requestHash: this.records.get(key)?.requestHash ?? "synthetic",
      result: input.result,
    });
  }
  async appendAudit() {}
}
class SyntheticStore implements CommandStore {
  private readonly transactionState = new SyntheticTransaction();
  async transaction<Result>(
    work: (transaction: CommandTransaction) => Promise<Result>,
  ) {
    return work(this.transactionState);
  }
}

export async function getProfitabilitySnapshot(
  principal: Principal,
): Promise<ProfitabilitySnapshot> {
  assertPermission(principal, "margin.read");
  if (canUseSyntheticAuth()) return structuredClone(SYNTHETIC_PROFITABILITY);
  return readProfitabilitySnapshot(getDatabaseClient(), principal);
}

export async function runProfitabilityCommand(
  principal: Principal,
  idempotencyKey: string,
  input: ProfitabilityCommandInput,
) {
  const synthetic = canUseSyntheticAuth();
  return runServerCommand({
    commandName: input.kind,
    permission: "profitability.manage",
    principal,
    idempotencyKey,
    payload: input,
    entityType: "order_profitability",
    store: synthetic
      ? new SyntheticStore()
      : new PostgresCommandStore(getDatabaseClient()),
    execute: async (transaction) =>
      synthetic
        ? { id: `synthetic-${input.kind}`, kind: input.kind }
        : executeProfitabilityCommand(
            getTransactionSql(transaction),
            principal,
            input,
          ),
  });
}
