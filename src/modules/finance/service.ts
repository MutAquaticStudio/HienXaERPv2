import { withDatabaseRead } from "@/lib/postgres/read";
import "server-only";

import type { FinanceCommandInput } from "@/modules/finance/commands";
import { SYNTHETIC_FINANCE } from "@/modules/finance/fixtures";
import {
  executeFinanceCommand,
  readFinanceSnapshot,
} from "@/modules/finance/postgres-repository";
import type { FinanceSnapshot } from "@/modules/finance/types";
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
      { requestHash: input.requestHash, result: null },
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

function permissionFor(input: FinanceCommandInput): Permission {
  switch (input.kind) {
    case "finance.account.create":
      return "finance.manage";
    case "finance.payment.create":
      return "payment.create";
    case "finance.payment.allocate":
    case "finance.advance.apply":
      return "payment.allocate";
    case "finance.payment.post":
      return "payment.post";
    case "finance.payment.reverse":
      return "payment.reverse";
    case "finance.expense.create":
    case "finance.expense.allocate":
    case "finance.expense.post":
    case "finance.expense.reverse":
      return "expense.manage";
    case "finance.adjustment.post":
      return input.targetKind === "RECEIVABLE"
        ? "receivable.adjust"
        : "payable.adjust";
    case "finance.adjustment.reverse":
      return "receivable.adjust";
    case "finance.bank.import":
    case "finance.payment.reconcile":
      return "reconciliation.manage";
  }
}

export async function getFinanceSnapshot(
  principal: Principal,
): Promise<FinanceSnapshot> {
  assertPermission(principal, "finance.read");
  if (canUseSyntheticAuth()) return structuredClone(SYNTHETIC_FINANCE);
  return withDatabaseRead("finance", (sql) => readFinanceSnapshot(sql, principal));
}

export async function runFinanceCommand(
  principal: Principal,
  idempotencyKey: string,
  input: FinanceCommandInput,
) {
  const synthetic = canUseSyntheticAuth();
  const store = synthetic
    ? new SyntheticStore()
    : new PostgresCommandStore(getDatabaseClient());
  return runServerCommand({
    commandName: input.kind,
    permission: permissionFor(input),
    principal,
    idempotencyKey,
    payload: input,
    entityType: "finance",
    store,
    execute: async (transaction) =>
      synthetic
        ? { id: `synthetic-${input.kind}`, kind: input.kind }
        : executeFinanceCommand(
            getTransactionSql(transaction),
            principal,
            input,
          ),
  });
}
