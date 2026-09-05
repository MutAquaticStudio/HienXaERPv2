import { withDatabaseRead } from "@/lib/postgres/read";
import "server-only";

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
import type { Principal } from "@/modules/platform/types";
import {
  SYNTHETIC_FLEET_TRACKING,
  SYNTHETIC_WORKER_TRACKING,
} from "@/modules/gps/fixtures";
import {
  executeGpsLocationCommand,
  readFleetTrackingSnapshot,
  readWorkerTrackingSnapshot,
} from "@/modules/gps/postgres-repository";
import type {
  FleetTrackingSnapshot,
  GpsLocationCommand,
  WorkerTrackingSnapshot,
} from "@/modules/gps/types";

class SyntheticTransaction implements CommandTransaction {
  private readonly records = new Map<string, CommandRecord<unknown>>();
  private key(actorId: string, commandName: string, idempotencyKey: string) {
    return `${actorId}:${commandName}:${idempotencyKey}`;
  }
  async find<Result>(actorId: string, commandName: string, idempotencyKey: string) {
    return (this.records.get(this.key(actorId, commandName, idempotencyKey)) ?? null) as CommandRecord<Result> | null;
  }
  async reserve(input: { actorId: string; commandName: string; idempotencyKey: string; requestHash: string }) {
    this.records.set(this.key(input.actorId, input.commandName, input.idempotencyKey), { requestHash: input.requestHash, result: null });
  }
  async complete<Result>(input: { actorId: string; commandName: string; idempotencyKey: string; result: Result }) {
    this.records.set(this.key(input.actorId, input.commandName, input.idempotencyKey), { requestHash: this.records.get(this.key(input.actorId, input.commandName, input.idempotencyKey))?.requestHash ?? "synthetic", result: input.result });
  }
  async appendAudit() {}
}

class SyntheticStore implements CommandStore {
  private readonly transactionState = new SyntheticTransaction();
  async transaction<Result>(work: (transaction: CommandTransaction) => Promise<Result>) {
    return work(this.transactionState);
  }
}

export async function getWorkerTrackingSnapshot(principal: Principal): Promise<WorkerTrackingSnapshot> {
  assertPermission(principal, "gps.location.submit");
  if (canUseSyntheticAuth()) return structuredClone(SYNTHETIC_WORKER_TRACKING);
  return withDatabaseRead("gps", (sql) => readWorkerTrackingSnapshot(sql, principal));
}

export async function getFleetTrackingSnapshot(principal: Principal): Promise<FleetTrackingSnapshot> {
  assertPermission(principal, "gps.location.read_fleet");
  if (canUseSyntheticAuth()) return structuredClone(SYNTHETIC_FLEET_TRACKING);
  return withDatabaseRead("gps", (sql) => readFleetTrackingSnapshot(sql, principal));
}

export async function runGpsLocationCommand(
  principal: Principal,
  idempotencyKey: string,
  command: GpsLocationCommand,
) {
  const synthetic = canUseSyntheticAuth();
  const store = synthetic ? new SyntheticStore() : new PostgresCommandStore(getDatabaseClient());
  return runServerCommand({
    commandName: command.kind,
    permission: "gps.location.submit",
    principal,
    idempotencyKey,
    payload: command,
    entityType: "vehicle_location",
    store,
    execute: async (transaction) => synthetic
      ? { id: `synthetic-gps-${command.recordedAt}` }
      : executeGpsLocationCommand(getTransactionSql(transaction), principal, command),
  });
}
