import { describe, expect, it, vi } from "vitest";

import { runServerCommand } from "@/modules/platform/server-command";
import type {
  CommandRecord,
  CommandStore,
  CommandTransaction,
} from "@/modules/platform/server-command";
import { SYNTHETIC_OFFICE_PRINCIPAL } from "@/modules/platform/synthetic-principals";

function createMemoryStore() {
  const records = new Map<string, CommandRecord<unknown>>();
  const pending = new Map<string, string>();
  const audits: unknown[] = [];

  const keyFor = (actorId: string, commandName: string, key: string) =>
    `${actorId}:${commandName}:${key}`;

  const transaction: CommandTransaction = {
    async find<Result>(actorId: string, commandName: string, key: string) {
      return (records.get(keyFor(actorId, commandName, key)) as
        | CommandRecord<Result>
        | undefined) ?? null;
    },
    async reserve(input) {
      pending.set(
        keyFor(input.actorId, input.commandName, input.idempotencyKey),
        input.requestHash,
      );
    },
    async complete(input) {
      const key = keyFor(
        input.actorId,
        input.commandName,
        input.idempotencyKey,
      );
      records.set(key, {
        requestHash: pending.get(key) ?? "",
        result: input.result,
      });
    },
    async appendAudit(input) {
      audits.push(input);
    },
  };

  const store: CommandStore = {
    async transaction<Result>(work: (tx: CommandTransaction) => Promise<Result>) {
      return work(transaction);
    },
  };

  return { store, audits };
}

const productionRuntime = {
  appEnv: "production",
  vercelEnv: "production",
  supabaseUrl: "https://hien-xa.supabase.co",
  allowLiveDbWrites: "true",
};

describe("server-controlled command pattern", () => {
  it("returns the first result on a safe retry and audits only once", async () => {
    const { store, audits } = createMemoryStore();
    const execute = vi.fn(async () => ({ updated: true }));
    const command = {
      commandName: "platform.secure_update",
      permission: "user.manage" as const,
      principal: SYNTHETIC_OFFICE_PRINCIPAL,
      idempotencyKey: "safe-retry-0001",
      payload: { userId: "target", status: "SUSPENDED" },
      entityType: "user_profile",
      entityId: "10000000-0000-4000-8000-000000000010",
      runtime: productionRuntime,
      store,
      execute,
    };

    const first = await runServerCommand(command);
    const retry = await runServerCommand(command);

    expect(first).toEqual({ updated: true });
    expect(retry).toEqual(first);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(audits).toHaveLength(1);
  });

  it("rejects reuse of one idempotency key for a different payload", async () => {
    const { store } = createMemoryStore();
    const base = {
      commandName: "platform.secure_update",
      permission: "user.manage" as const,
      principal: SYNTHETIC_OFFICE_PRINCIPAL,
      idempotencyKey: "safe-retry-0002",
      entityType: "user_profile",
      runtime: productionRuntime,
      store,
      execute: async () => ({ updated: true }),
    };

    await runServerCommand({ ...base, payload: { status: "SUSPENDED" } });

    await expect(
      runServerCommand({ ...base, payload: { status: "DISABLED" } }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
  });

  it("checks runtime safety before executing a critical mutation", async () => {
    const { store } = createMemoryStore();
    const execute = vi.fn(async () => ({ updated: true }));

    await expect(
      runServerCommand({
        commandName: "platform.secure_update",
        permission: "user.manage",
        principal: SYNTHETIC_OFFICE_PRINCIPAL,
        idempotencyKey: "safe-retry-0003",
        payload: {},
        entityType: "user_profile",
        runtime: {
          appEnv: "production",
          vercelEnv: "preview",
          supabaseUrl: "https://hien-xa.supabase.co",
        },
        store,
        execute,
      }),
    ).rejects.toMatchObject({ code: "UNSAFE_RUNTIME" });
    expect(execute).not.toHaveBeenCalled();
  });
});
