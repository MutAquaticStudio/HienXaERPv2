import { withDatabaseRead } from "@/lib/postgres/read";
import "server-only";

import type { InventoryCommandInput } from "@/modules/inventory/commands";
import { SYNTHETIC_INVENTORY } from "@/modules/inventory/fixtures";
import {
  executeInventoryCommand,
  readInventorySnapshot,
} from "@/modules/inventory/postgres-repository";
import type { InventorySnapshot } from "@/modules/inventory/types";
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
  private readonly state = new SyntheticTransaction();
  async transaction<Result>(
    work: (transaction: CommandTransaction) => Promise<Result>,
  ) {
    return work(this.state);
  }
}

function permissionFor(input: InventoryCommandInput): Permission {
  switch (input.kind) {
    case "inventory.reserve":
    case "reservation.release":
      return "inventory.reserve";
    case "receipt.confirm":
      return "inventory.receive";
    case "issue.confirm":
      return "inventory.issue";
    case "stock-count.record":
      return "inventory.count";
    case "stock-adjustment.approve":
      return "inventory.adjust";
    case "reorder-policy.set":
      return "inventory.policy.manage";
  }
}

export async function getInventorySnapshot(
  principal: Principal,
): Promise<InventorySnapshot> {
  assertPermission(principal, "inventory.read");
  if (canUseSyntheticAuth()) return structuredClone(SYNTHETIC_INVENTORY);
  return withDatabaseRead("inventory", (sql) => readInventorySnapshot(sql, principal));
}

export async function runInventoryCommand(
  principal: Principal,
  idempotencyKey: string,
  input: InventoryCommandInput,
) {
  const synthetic = canUseSyntheticAuth();
  const store = synthetic
    ? new SyntheticStore()
    : new PostgresCommandStore(getDatabaseClient());
  return runServerCommand({
    commandName: `inventory.${input.kind}`,
    permission: permissionFor(input),
    principal,
    idempotencyKey,
    payload: input,
    entityType: input.kind.startsWith("stock-")
      ? "stock_count"
      : input.kind.includes("reservation") || input.kind === "inventory.reserve"
        ? "stock_reservation"
        : "inventory_document",
    store,
    execute: async (transaction) =>
      synthetic
        ? { id: `synthetic-${input.kind}`, kind: input.kind }
        : executeInventoryCommand(
            getTransactionSql(transaction),
            principal,
            input,
          ),
  });
}
