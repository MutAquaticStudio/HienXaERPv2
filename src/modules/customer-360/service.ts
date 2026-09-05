import { snapshotPage, type SnapshotView } from "@/modules/platform/snapshot-view";
import { withDatabaseRead } from "@/lib/postgres/read";
import "server-only";

import type { SaveCustomer360Input } from "@/modules/customer-360/commands";
import { assertCreditOverride } from "@/modules/customer-360/credit";
import { SYNTHETIC_CUSTOMER_360 } from "@/modules/customer-360/fixtures";
import {
  readCustomer360,
  saveCustomer360Record,
} from "@/modules/customer-360/postgres-repository";
import type { Customer360Snapshot } from "@/modules/customer-360/types";
import { getDatabaseClient } from "@/lib/postgres/server";
import { assertPermission, hasPermission } from "@/modules/platform/authorization";
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
  ): Promise<Result> {
    return work(this.transactionState);
  }
}

function permissionFor(input: SaveCustomer360Input): Permission {
  switch (input.kind) {
    case "customer":
    case "contact":
    case "site":
      return "customer.manage";
    case "price-rule":
      return "pricing.manage";
    case "credit-policy":
      return "customer_credit.manage";
    case "credit-override":
      return "customer_credit.override";
  }
}

export async function getCustomer360Snapshot(
  principal: Principal,
  view?: SnapshotView,
): Promise<Customer360Snapshot> {
  assertPermission(principal, "customer.read");
  if (canUseSyntheticAuth()) {
    const data = structuredClone(SYNTHETIC_CUSTOMER_360);
    if (view) {
      const sorted = [...data.customers].sort((a,b) => a.id.localeCompare(b.id)).filter(row => !view.after || row.id > view.after);
      const result = snapshotPage(sorted, view);
      data.customers = result.rows;
      data.page = result.page;
    }
    return data;
  }
  return withDatabaseRead("customer-360", (sql) => readCustomer360(sql, principal, view));
}

export async function saveCustomer360(
  principal: Principal,
  idempotencyKey: string,
  input: SaveCustomer360Input,
) {
  const synthetic = canUseSyntheticAuth();
  const store = synthetic
    ? new SyntheticStore()
    : new PostgresCommandStore(getDatabaseClient());

  return runServerCommand({
    commandName: `customer_360.save.${input.kind}`,
    permission: permissionFor(input),
    principal,
    idempotencyKey,
    payload: input,
    entityType: input.kind,
    store,
    execute: async (transaction) => {
      if (input.kind === "credit-override") {
        assertCreditOverride({
          decision: {
            status: "BLOCKED",
            projectedExposure: input.orderAmount,
            availableCredit: "0",
            reasons: ["Yêu cầu vượt chặn."],
          },
          canOverride: hasPermission(principal, "customer_credit.override"),
          reason: input.reason,
        });
      }
      if (synthetic) {
        return { id: `synthetic-${input.kind}`, kind: input.kind };
      }
      return saveCustomer360Record(
        getTransactionSql(transaction),
        principal.userId,
        input,
      );
    },
  });
}
