import { snapshotPage, type SnapshotView } from "@/modules/platform/snapshot-view";
import { withDatabaseRead } from "@/lib/postgres/read";
import "server-only";

import type {
  SaveMasterDataInput,
  ToggleMasterDataInput,
} from "@/modules/master-data/commands";
import { SYNTHETIC_MASTER_DATA } from "@/modules/master-data/fixtures";
import {
  readMasterData,
  saveMasterDataRecord,
  toggleMasterDataRecord,
} from "@/modules/master-data/postgres-repository";
import type { MasterDataSnapshot } from "@/modules/master-data/types";
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

class SyntheticCommandTransaction implements CommandTransaction {
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
    const existing = this.records.get(key);
    this.records.set(key, {
      requestHash: existing?.requestHash ?? "synthetic",
      result: input.result,
    });
  }

  async appendAudit() {}
}

class SyntheticCommandStore implements CommandStore {
  private readonly transactionState = new SyntheticCommandTransaction();

  async transaction<Result>(
    work: (transaction: CommandTransaction) => Promise<Result>,
  ): Promise<Result> {
    return work(this.transactionState);
  }
}

export async function getMasterDataSnapshot(
  principal: Principal,
  view?: SnapshotView,
): Promise<MasterDataSnapshot> {
  assertPermission(principal, "master_data.read");
  if (canUseSyntheticAuth()) {
    const data = structuredClone(SYNTHETIC_MASTER_DATA);
    if (view) {
      const sorted = [...data.materials].sort((a,b) => a.id.localeCompare(b.id)).filter(row => !view.after || row.id > view.after);
      const result = snapshotPage(sorted, view);
      data.materials = result.rows;
      data.page = view.tab === "people" ? undefined : result.page;
    }
    return data;
  }
  return withDatabaseRead("master-data", (sql) => readMasterData(sql, principal, view));
}

export async function saveMasterData(
  principal: Principal,
  idempotencyKey: string,
  input: SaveMasterDataInput,
) {
  const synthetic = canUseSyntheticAuth();
  const store = synthetic
    ? new SyntheticCommandStore()
    : new PostgresCommandStore(getDatabaseClient());

  return runServerCommand({
    commandName: `master_data.save.${input.kind}`,
    permission: "master_data.manage",
    principal,
    idempotencyKey,
    payload: input,
    entityType: input.kind,
    store,
    execute: async (transaction) => {
      if (synthetic) return { id: `synthetic-${input.kind}`, kind: input.kind };
      return saveMasterDataRecord(
        getTransactionSql(transaction),
        principal.userId,
        input,
      );
    },
  });
}

export async function toggleMasterData(
  principal: Principal,
  idempotencyKey: string,
  input: ToggleMasterDataInput,
) {
  const synthetic = canUseSyntheticAuth();
  const store = synthetic
    ? new SyntheticCommandStore()
    : new PostgresCommandStore(getDatabaseClient());

  return runServerCommand({
    commandName: `master_data.toggle.${input.kind}`,
    permission: "master_data.manage",
    principal,
    idempotencyKey,
    payload: input,
    entityType: input.kind,
    entityId: input.id,
    store,
    execute: async (transaction) => {
      if (synthetic) return input;
      return toggleMasterDataRecord(
        getTransactionSql(transaction),
        principal.userId,
        input,
      );
    },
  });
}
