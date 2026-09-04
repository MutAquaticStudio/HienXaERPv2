import "server-only";

import { getDatabaseClient } from "@/lib/postgres/server";
import { createClient } from "@/lib/supabase/server";
import type { WorkCommandInput } from "@/modules/workforce/commands";
import { SYNTHETIC_WORKFORCE } from "@/modules/workforce/fixtures";
import {
  executeWorkCommand,
  readWorkforceSnapshotFromSupabase,
} from "@/modules/workforce/postgres-repository";
import type { WorkforceSnapshot } from "@/modules/workforce/types";
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
import { orderWorkerWorkItems } from "@/modules/workforce/workflow";

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

function permissionFor(input: WorkCommandInput): Permission {
  switch (input.kind) {
    case "work.claim":
      return "work_item.claim";
    case "work.start":
    case "work.block":
    case "work.complete":
      return "work_item.update_self";
    case "work.heartbeat":
      return "work_item.heartbeat";
    case "work.verify":
      return "work_item.verify";
    case "work.supervise":
    case "work.sweep":
      return "work_item.supervise";
  }
}

export async function getWorkforceSnapshot(
  principal: Principal,
  view: "worker" | "office",
): Promise<WorkforceSnapshot> {
  if (canUseSyntheticAuth()) {
    const snapshot = structuredClone(SYNTHETIC_WORKFORCE);
    if (view === "worker") {
      snapshot.assigned = orderWorkerWorkItems([
        ...snapshot.assigned.filter((item) => item.claimedBy === principal.userId),
        ...snapshot.completed.filter((item) => item.claimedBy === principal.userId),
      ]);
      snapshot.completed = snapshot.completed.filter((item) => item.claimedBy === principal.userId);
      snapshot.pool = snapshot.pool.map((item) => ({
        ...item,
        customerName: null,
        pickupAddress: null,
        dropAddress: null,
      }));
      snapshot.attention = [];
      snapshot.workers = [];
    }
    return snapshot;
  }
  return readWorkforceSnapshotFromSupabase(await createClient(), principal, view);
}

export async function runWorkCommand(
  principal: Principal,
  idempotencyKey: string,
  input: WorkCommandInput,
) {
  const synthetic = canUseSyntheticAuth();
  return runServerCommand({
    commandName: input.kind,
    permission: permissionFor(input),
    principal,
    idempotencyKey,
    payload: input,
    entityType: "work_item",
    store: synthetic ? new SyntheticStore() : new PostgresCommandStore(getDatabaseClient()),
    execute: async (transaction) =>
      synthetic
        ? { id: "workItemId" in input ? input.workItemId : principal.userId, kind: input.kind }
        : executeWorkCommand(getTransactionSql(transaction), principal, idempotencyKey, input),
  });
}
