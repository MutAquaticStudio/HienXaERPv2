import "server-only";

import { getDatabaseClient } from "@/lib/postgres/server";
import { createClient } from "@/lib/supabase/server";
import type { ServiceJobCommandInput } from "@/modules/service-jobs/commands";
import { SYNTHETIC_SERVICE_JOBS } from "@/modules/service-jobs/fixtures";
import {
  executeServiceJobCommand,
  readServiceJobSnapshot,
} from "@/modules/service-jobs/postgres-repository";
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

function permissionFor(input: ServiceJobCommandInput): Permission {
  switch (input.kind) {
    case "service.type.create":
    case "service.machine.create":
    case "service.job.create":
    case "service.job.cancel":
      return "service_job.manage";
    case "service.job.assign":
      return "service_job.assign";
    case "service.job.log":
      return "service_job.update_assigned";
    case "service.job.approve":
      return "service_job.approve";
    case "service.job.cost":
      return "service_job.cost.manage";
    case "service.job.confirm":
      return "service_job.confirm";
  }
}

export async function getServiceJobSnapshot(
  principal: Principal,
  view: "office" | "worker",
) {
  if (canUseSyntheticAuth()) {
    const snapshot = structuredClone(SYNTHETIC_SERVICE_JOBS);
    if (view === "worker") {
      snapshot.jobs = snapshot.jobs.filter(
        (job) =>
          job.operatorUserId === principal.userId &&
          !["BILLED", "CANCELLED"].includes(job.status),
      );
      const ids = new Set(snapshot.jobs.map((job) => job.id));
      snapshot.logs = snapshot.logs.filter((log) => ids.has(log.serviceJobId));
      snapshot.serviceTypes = [];
      snapshot.machines = [];
      snapshot.customers = [];
      snapshot.sites = [];
      snapshot.operators = [];
      snapshot.warehouses = [];
    }
    return snapshot;
  }
  return readServiceJobSnapshot(await createClient(), principal, view);
}

export async function runServiceJobCommand(
  principal: Principal,
  idempotencyKey: string,
  input: ServiceJobCommandInput,
) {
  const synthetic = canUseSyntheticAuth();
  return runServerCommand({
    commandName: input.kind,
    permission: permissionFor(input),
    principal,
    idempotencyKey,
    payload: input,
    entityType: "service_job",
    store: synthetic
      ? new SyntheticStore()
      : new PostgresCommandStore(getDatabaseClient()),
    execute: async (transaction) =>
      synthetic
        ? { id: `synthetic-${input.kind}`, kind: input.kind }
        : executeServiceJobCommand(
            getTransactionSql(transaction),
            principal,
            input,
          ),
  });
}
