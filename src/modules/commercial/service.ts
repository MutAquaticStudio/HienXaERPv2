import "server-only";

import type { CommercialCommandInput } from "@/modules/commercial/commands";
import { SYNTHETIC_COMMERCIAL } from "@/modules/commercial/fixtures";
import {
  executeCommercialCommand,
  readCommercialSnapshot,
} from "@/modules/commercial/postgres-repository";
import type { CommercialSnapshot } from "@/modules/commercial/types";
import { getDatabaseClient } from "@/lib/postgres/server";
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
import type { Permission, Principal } from "@/modules/platform/types";

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
    const current = this.records.get(key);
    this.records.set(key, {
      requestHash: current?.requestHash ?? "synthetic",
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

function permissionFor(input: CommercialCommandInput): Permission {
  switch (input.kind) {
    case "quotation.create":
    case "quotation.add-line":
    case "quotation.refresh-prices":
    case "quotation.revise":
      return "quotation.create";
    case "quotation.send":
      return "quotation.send";
    case "quotation.accept":
      return "quotation.accept";
    case "sales-order.convert":
      return "sales_order.create";
    case "sales-order.confirm":
      return "sales_order.confirm";
  }
}

export async function getCommercialSnapshot(
  principal: Principal,
): Promise<CommercialSnapshot> {
  assertPermission(principal, "quotation.read");
  assertPermission(principal, "sales_order.read");
  if (canUseSyntheticAuth()) return structuredClone(SYNTHETIC_COMMERCIAL);
  return readCommercialSnapshot(getDatabaseClient(), principal);
}

export async function runCommercialCommand(
  principal: Principal,
  idempotencyKey: string,
  input: CommercialCommandInput,
) {
  const synthetic = canUseSyntheticAuth();
  const store = synthetic
    ? new SyntheticStore()
    : new PostgresCommandStore(getDatabaseClient());

  return runServerCommand({
    commandName: `commercial.${input.kind}`,
    permission: permissionFor(input),
    principal,
    idempotencyKey,
    payload: input,
    entityType: input.kind.startsWith("quotation")
      ? "quotation"
      : "sales_order",
    store,
    execute: async (transaction) => {
      if (synthetic) return { id: `synthetic-${input.kind}`, kind: input.kind };
      return executeCommercialCommand(
        getTransactionSql(transaction),
        principal,
        input,
      );
    },
  });
}
