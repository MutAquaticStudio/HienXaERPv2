import { snapshotPage, type SnapshotView } from "@/modules/platform/snapshot-view";
import { withDatabaseRead } from "@/lib/postgres/read";
import "server-only";

import type { SourcingCommandInput } from "@/modules/sourcing/commands";
import { SYNTHETIC_SOURCING } from "@/modules/sourcing/fixtures";
import {
  executeSourcingCommand,
  readSourcingSnapshot,
} from "@/modules/sourcing/postgres-repository";
import type { SourcingSnapshot } from "@/modules/sourcing/types";
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
  private readonly state = new SyntheticTransaction();
  async transaction<Result>(
    work: (transaction: CommandTransaction) => Promise<Result>,
  ) {
    return work(this.state);
  }
}

function permissionFor(input: SourcingCommandInput): Permission {
  switch (input.kind) {
    case "supplier.create":
      return "supplier.manage";
    case "supplier-price.record":
      return "supplier_price.manage";
    case "supply.allocate":
      return "sourcing.manage";
    case "purchase-order.create":
      return "purchase_order.create";
    case "purchase-order.confirm":
      return "purchase_order.confirm";
    case "purchase-order.send":
    case "purchase-order.acknowledge":
    case "purchase-order.cancel":
      return "purchase_order.send";
  }
}

export async function getSourcingSnapshot(
  principal: Principal,
  view?: SnapshotView,
): Promise<SourcingSnapshot> {
  assertPermission(principal, "sourcing.read");
  assertPermission(principal, "purchase_order.read");
  if (canUseSyntheticAuth()) {
    const data = structuredClone(SYNTHETIC_SOURCING);
    if (view) {
      const candidates = view.tab === "orders" ? data.purchaseOrders
        : view.tab === "suppliers" ? data.suppliers
        : [...new Set([...data.salesOrderLines.map(row => row.id), ...data.allocations.map(row => row.salesOrderLineId)])].map(id => ({ id }));
      const sorted = [...candidates].sort((a,b) => a.id.localeCompare(b.id)).filter(row => !view.after || row.id > view.after);
      const result = snapshotPage(sorted, view);
      const ids = new Set(result.rows.map(row => row.id));
      if (view.tab === "orders") {
        data.purchaseOrders = data.purchaseOrders.filter(row => ids.has(row.id));
        data.purchaseOrderLines = data.purchaseOrderLines.filter(row => ids.has(row.purchaseOrderId));
        data.evidence = data.evidence.filter(row => ids.has(row.purchaseOrderId));
      } else if (view.tab === "suppliers") {
        data.suppliers = data.suppliers.filter(row => ids.has(row.id));
        data.supplierPrices = data.supplierPrices.filter(row => ids.has(row.supplierId));
      } else {
        data.salesOrderLines = data.salesOrderLines.filter(row => ids.has(row.id));
        data.allocations = data.allocations.filter(row => ids.has(row.salesOrderLineId));
        data.fulfillmentRequirements = data.fulfillmentRequirements.filter(row => ids.has(row.salesOrderLineId));
      }
      data.page = result.page;
    }
    return data;
  }
  return withDatabaseRead("sourcing", (sql) => readSourcingSnapshot(sql, principal, view));
}

export async function runSourcingCommand(
  principal: Principal,
  idempotencyKey: string,
  input: SourcingCommandInput,
) {
  const synthetic = canUseSyntheticAuth();
  const store = synthetic
    ? new SyntheticStore()
    : new PostgresCommandStore(getDatabaseClient());

  return runServerCommand({
    commandName: `sourcing.${input.kind}`,
    permission: permissionFor(input),
    principal,
    idempotencyKey,
    payload: input,
    entityType: input.kind.startsWith("supplier")
      ? "supplier"
      : input.kind.startsWith("purchase-order")
        ? "purchase_order"
        : "supply_allocation",
    store,
    execute: async (transaction) => {
      if (synthetic) return { id: `synthetic-${input.kind}`, kind: input.kind };
      return executeSourcingCommand(
        getTransactionSql(transaction),
        principal,
        input,
      );
    },
  });
}
