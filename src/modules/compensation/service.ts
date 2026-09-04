import "server-only";

import { getDatabaseClient } from "@/lib/postgres/server";
import { createClient } from "@/lib/supabase/server";
import type { CompensationCommandInput } from "@/modules/compensation/commands";
import {
  SYNTHETIC_COMPENSATION,
  SYNTHETIC_MY_EARNINGS,
} from "@/modules/compensation/fixtures";
import {
  executeCompensationCommand,
  readCompensationSnapshot,
  readMyEarningsSnapshot,
} from "@/modules/compensation/postgres-repository";
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

function permissionFor(input: CompensationCommandInput): Permission {
  switch (input.kind) {
    case "compensation.profile.create":
    case "compensation.plan.create":
    case "compensation.rule.create":
    case "earning.create_from_work":
    case "earning.bonus":
    case "payroll.monthly.generate":
      return "compensation.manage";
    case "earning.approve":
      return "earning.approve";
    case "earning.adjust":
    case "earning.reverse":
      return "earning.adjust";
    case "payroll.period.create":
    case "payroll.close":
    case "payroll.payment.link":
      return "payroll.close";
  }
}

export async function getCompensationSnapshot(principal: Principal) {
  if (canUseSyntheticAuth()) {
    assertPermission(principal, "compensation.read");
    return structuredClone(SYNTHETIC_COMPENSATION);
  }
  return readCompensationSnapshot(await createClient(), principal);
}

export async function getMyEarningsSnapshot(principal: Principal) {
  if (canUseSyntheticAuth()) {
    assertPermission(principal, "earning.read_self");
    return structuredClone(SYNTHETIC_MY_EARNINGS);
  }
  return readMyEarningsSnapshot(await createClient(), principal);
}

export async function runCompensationCommand(
  principal: Principal,
  idempotencyKey: string,
  input: CompensationCommandInput,
) {
  const synthetic = canUseSyntheticAuth();
  return runServerCommand({
    commandName: input.kind,
    permission: permissionFor(input),
    principal,
    idempotencyKey,
    payload: input,
    entityType: "compensation",
    store: synthetic
      ? new SyntheticStore()
      : new PostgresCommandStore(getDatabaseClient()),
    execute: async (transaction) =>
      synthetic
        ? { id: `synthetic-${input.kind}`, kind: input.kind }
        : executeCompensationCommand(
            getTransactionSql(transaction),
            principal,
            input,
          ),
  });
}
