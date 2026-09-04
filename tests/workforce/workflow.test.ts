import { describe, expect, it } from "vitest";

import {
  canClaimAnotherWorkItem,
  canTransitionWorkItem,
  isClaimLeaseExpired,
  nextHeartbeatState,
  orderWorkerWorkItems,
} from "@/modules/workforce/workflow";
import { SYNTHETIC_WORKFORCE } from "@/modules/workforce/fixtures";

describe("P10 employee OS workflow", () => {
  it("keeps the worker state machine explicit", () => {
    expect(canTransitionWorkItem("AVAILABLE", "CLAIMED")).toBe(true);
    expect(canTransitionWorkItem("CLAIMED", "IN_PROGRESS")).toBe(true);
    expect(canTransitionWorkItem("IN_PROGRESS", "DONE")).toBe(true);
    expect(canTransitionWorkItem("DONE", "VERIFIED")).toBe(true);
    expect(canTransitionWorkItem("AVAILABLE", "DONE")).toBe(false);
    expect(canTransitionWorkItem("DONE", "IN_PROGRESS")).toBe(false);
  });

  it("enforces driver and operator active-work defaults", () => {
    expect(
      canClaimAnotherWorkItem("DRIVER", { claimed: 0, inProgress: 1 }),
    ).toBe(true);
    expect(
      canClaimAnotherWorkItem("DRIVER", { claimed: 1, inProgress: 1 }),
    ).toBe(false);
    expect(
      canClaimAnotherWorkItem("OPERATOR_WORKER", {
        claimed: 0,
        inProgress: 1,
      }),
    ).toBe(false);
  });

  it("expires only an unstarted claim after its lease", () => {
    const now = new Date("2026-09-04T10:05:01.000Z");
    expect(
      isClaimLeaseExpired({
        status: "CLAIMED",
        claimExpiresAt: "2026-09-04T10:05:00.000Z",
        now,
      }),
    ).toBe(true);
    expect(
      isClaimLeaseExpired({
        status: "IN_PROGRESS",
        claimExpiresAt: "2026-09-04T10:05:00.000Z",
        now,
      }),
    ).toBe(false);
  });

  it("marks missed heartbeat before unresponsive without releasing active work", () => {
    const now = new Date("2026-09-04T10:18:01.000Z");
    expect(
      nextHeartbeatState({
        current: "IN_PROGRESS",
        heartbeatDueAt: "2026-09-04T10:15:00.000Z",
        now,
      }),
    ).toBe("UNRESPONSIVE");
    expect(
      nextHeartbeatState({
        current: "IN_PROGRESS",
        heartbeatDueAt: "2026-09-04T10:16:30.000Z",
        now,
      }),
    ).toBe("HEARTBEAT_MISSED");
  });

  it("keeps the worker home priority independent from due-date ordering", () => {
    const poolItem = structuredClone(SYNTHETIC_WORKFORCE.pool[0]!);
    const items = structuredClone([
      ...SYNTHETIC_WORKFORCE.assigned,
      ...SYNTHETIC_WORKFORCE.completed,
      { ...poolItem, status: "CLAIMED" as const },
      { ...poolItem, id: "a1000000-0000-4000-8000-000000000105", workNumber: "WRK-2026-000105", status: "BLOCKED" as const },
    ]);
    expect(orderWorkerWorkItems(items).map((item) => item.status)).toEqual([
      "IN_PROGRESS",
      "CLAIMED",
      "BLOCKED",
      "DONE",
    ]);
  });
});
