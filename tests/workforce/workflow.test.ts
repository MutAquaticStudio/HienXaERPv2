import { describe, expect, it } from "vitest";

import {
  canClaimAnotherWorkItem,
  canTransitionWorkItem,
  isClaimLeaseExpired,
  nextHeartbeatState,
} from "@/modules/workforce/workflow";

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
});
