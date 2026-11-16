import { describe, expect, it } from "vitest";

import {
  fieldDispatchMessage,
  fieldDispatchNeedsReload,
  fieldTime,
  freshLabel,
  givenStateLabel,
  rankWorkers,
  summaryLine,
  type FieldDispatchGiven,
  type FieldDispatchWaitingDelivery,
} from "./field-dispatch";

const at = (hhmm: string, day = "16") => new Date(`2026-11-${day}T${hhmm}:00+07:00`).toISOString();

describe("D85 field dispatch wording and order", () => {
  it("words every refusal in Vietnamese, with the next free time on a clash", () => {
    expect(fieldDispatchMessage("field_dispatch_busy", "next_free_at=2026-11-16T04:00:00Z", at("08:00"))).toBe("Người hoặc xe đã có việc lúc đó. Rảnh từ 11:00.");
    expect(fieldDispatchMessage("field_dispatch_busy", "next_free_at=2026-11-17T00:00:00Z", at("08:00"))).toBe("Người hoặc xe đã có việc lúc đó. Rảnh từ 07:00 17/11.");
    expect(fieldDispatchMessage("field_dispatch_taken")).toContain("vừa có người nhận");
    expect(fieldDispatchMessage("field_dispatch_locked")).toContain("không đổi người được nữa");
    expect(fieldDispatchMessage("field_dispatch_worker_declined")).toContain("đã từ chối");
    expect(fieldDispatchMessage("forbidden")).toContain("không còn quyền điều phối");
    for (const raw of ["", "fetch failed", "PT409", "constructor"]) {
      const text = fieldDispatchMessage(raw);
      expect(text).toMatch(/[À-ỹĐđ]/u);
      expect(text).not.toContain("field_");
    }
    expect(fieldDispatchNeedsReload("field_dispatch_stale")).toBe(true);
    expect(fieldDispatchNeedsReload("field_dispatch_busy")).toBe(false);
  });

  it("shows the time alone on the same day, with the date otherwise", () => {
    expect(fieldTime(at("09:30"), at("08:00"))).toBe("09:30");
    expect(fieldTime(at("09:30", "18"), at("08:00"))).toBe("09:30 18/11");
    expect(fieldTime(undefined)).toBe("—");
  });

  it("orders workers: suggestion, on shift, free soonest, fewest jobs; who refused or holds it is last and blocked", () => {
    const job: FieldDispatchWaitingDelivery = {
      kind: "DELIVERY", id: "d", number: "DL-1", version: 1, lines: [],
      declined: [{ employee_id: "x", name: "Xuân", reason: "Ngõ hẹp", at: at("08:05") }],
      pairs: [["a", "08:00"], ["b", "09:00"], ["c", "08:00"], ["d", "08:00"], ["x", "08:00"]]
        .map(([id, time]) => ({ employee_id: id, vehicle_id: "v", start_at: at(time), end_at: at("10:00") })),
      suggestion: { employee_id: "c", vehicle_id: "v", start_at: at("08:00"), end_at: at("09:00") },
    };
    const workers = [
      { id: "a", name: "An", clocked_in_at: at("07:00") },
      { id: "b", name: "Bình", clocked_in_at: at("07:00") },
      { id: "c", name: "Cường" },
      { id: "d", name: "Dũng", clocked_in_at: at("07:00") },
      { id: "x", name: "Xuân", clocked_in_at: at("07:00") },
      { id: "z", name: "Zơ", clocked_in_at: at("07:00") },
    ];
    const given = [{ employee_id: "a" }, { employee_id: "a" }] as FieldDispatchGiven[];
    const order = rankWorkers(job, { workers, given }, { today: at("08:00") });
    // c is the suggestion although not clocked in; then on shift by free time (a, d at 08:00; b at 09:00), fewer jobs first (d before a).
    expect(order.map((choice) => choice.worker.id)).toEqual(["c", "d", "a", "b", "x", "z"]);
    expect(order.find((choice) => choice.worker.id === "x")?.blocked).toBe("Đã từ chối phiếu này lúc 08:05");
    expect(order.find((choice) => choice.worker.id === "z")?.blocked).toContain("Chưa có xe");
    expect(rankWorkers(job, { workers, given }, { currentEmployeeId: "a" }).find((choice) => choice.worker.id === "a")?.blocked).toBe("Đang nhận việc này");
  });

  it("names today's states and the lead's own chips", () => {
    expect(givenStateLabel({ kind: "DELIVERY", state: "ASSIGNED" })).toBe("Chờ lấy hàng lên xe");
    expect(givenStateLabel({ kind: "DELIVERY", state: "DISPATCHED" })).toBe("Đang giao");
    expect(givenStateLabel({ kind: "DELIVERY", state: "RESULT_SUBMITTED", result_kind: "PARTIAL" })).toBe("Giao thiếu");
    expect(givenStateLabel({ kind: "SERVICE_JOB", state: "IN_PROGRESS" })).toBe("Đang làm");
    const row = { field: { action: "field_reassigned", by_me: true } } as FieldDispatchGiven;
    expect(freshLabel(row)).toBe("Bạn vừa đổi người");
    expect(freshLabel({ field: { action: "field_assigned", by_me: false, by_name: "Tuấn" } } as FieldDispatchGiven)).toBe("Tuấn giao");
    expect(summaryLine({ waiting: 4, declined: 1, given: 7, given_workers: 4, short: 1 })).toBe("4 việc chờ người · 7 việc đã giao cho 4 người");
  });
});
