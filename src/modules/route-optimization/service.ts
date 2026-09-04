import "server-only";

import { getDatabaseClient } from "@/lib/postgres/server";
import { assertPermission } from "@/modules/platform/authorization";
import { canUseSyntheticAuth } from "@/modules/platform/environment";
import { PlatformError } from "@/modules/platform/errors";
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
  SYNTHETIC_APPROVED_DRIVER_ROUTE,
  SYNTHETIC_ROUTE_OPTIMIZATION,
} from "@/modules/route-optimization/fixtures";
import { RouteOptimizationService, type DistanceProvider } from "@/modules/route-optimization/planner";
import {
  executeRoutePlanCommand,
  readApprovedDriverRoute,
  readRouteOptimizationSnapshot,
} from "@/modules/route-optimization/postgres-repository";
import type {
  ApprovedDriverRoute,
  PreparedRoutePlan,
  RouteOptimizationSnapshot,
  RoutePlanCommandInput,
} from "@/modules/route-optimization/types";

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
    this.records.set(key, { requestHash: this.records.get(key)?.requestHash ?? "synthetic", result: input.result });
  }
  async appendAudit() {}
}

class SyntheticStore implements CommandStore {
  private readonly state = new SyntheticTransaction();
  async transaction<Result>(work: (transaction: CommandTransaction) => Promise<Result>) {
    return work(this.state);
  }
}

class UnavailableDistanceProvider implements DistanceProvider {
  async order(): Promise<Array<{ deliveryId: string; estimatedTravelMinutes: number | null }>> {
    throw new Error("MAP_PROVIDER_NOT_CONFIGURED");
  }
}

function permissionFor(input: RoutePlanCommandInput) {
  return input.kind === "route.plan.create" || input.kind === "route.plan.approve" || input.kind === "route.plan.apply"
    ? "route_plan.manage" as const
    : "route_plan.manage" as const;
}

async function preparedPlan(
  principal: Principal,
  input: Extract<RoutePlanCommandInput, { kind: "route.plan.create" }>,
): Promise<PreparedRoutePlan> {
  const snapshot = canUseSyntheticAuth()
    ? structuredClone(SYNTHETIC_ROUTE_OPTIMIZATION)
    : await readRouteOptimizationSnapshot(getDatabaseClient(), principal);
  const selected = input.deliveryIds.map((id) => snapshot.candidates.find((candidate) => candidate.id === id));
  if (selected.some((candidate) => !candidate)) {
    throw new PlatformError("Một hoặc nhiều chuyến không còn đủ điều kiện để lập lộ trình.", "ROUTE_PLAN_DELIVERY_NOT_ELIGIBLE", 409);
  }
  const vehicle = snapshot.vehicles.find((item) => item.id === input.vehicleId);
  const driver = snapshot.drivers.find((item) => item.userId === input.driverUserId);
  if (!vehicle || !driver) {
    throw new PlatformError("Xe hoặc tài xế không còn hoạt động.", "ROUTE_PLAN_RESOURCE_NOT_AVAILABLE", 409);
  }
  return new RouteOptimizationService(new UnavailableDistanceProvider()).prepare({
    candidates: selected.filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)),
    vehicle,
    driverActiveAssignmentCount: driver.activeAssignmentCount,
  });
}

export async function getRouteOptimizationSnapshot(principal: Principal): Promise<RouteOptimizationSnapshot> {
  assertPermission(principal, "route_plan.read");
  if (canUseSyntheticAuth()) return structuredClone(SYNTHETIC_ROUTE_OPTIMIZATION);
  return readRouteOptimizationSnapshot(getDatabaseClient(), principal);
}

export async function getApprovedDriverRoute(principal: Principal): Promise<ApprovedDriverRoute | null> {
  assertPermission(principal, "delivery.update_assigned");
  if (canUseSyntheticAuth()) return structuredClone(SYNTHETIC_APPROVED_DRIVER_ROUTE);
  return readApprovedDriverRoute(getDatabaseClient(), principal);
}

export async function runRoutePlanCommand(
  principal: Principal,
  idempotencyKey: string,
  input: RoutePlanCommandInput,
) {
  const synthetic = canUseSyntheticAuth();
  const prepared = input.kind === "route.plan.create" ? await preparedPlan(principal, input) : undefined;
  const store = synthetic ? new SyntheticStore() : new PostgresCommandStore(getDatabaseClient());
  return runServerCommand({
    commandName: input.kind,
    permission: permissionFor(input),
    principal,
    idempotencyKey,
    payload: input,
    entityType: "route_plan",
    store,
    execute: async (transaction) => {
      if (synthetic) return { id: `synthetic-${input.kind}`, kind: input.kind };
      return executeRoutePlanCommand(getTransactionSql(transaction), principal, {
        ...input,
        ...(prepared ? { prepared } : {}),
      });
    },
  });
}
