import { describe, expect, it } from "vitest";

import { parseWorkForm } from "@/modules/workforce/commands";

function form(input: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(input)) data.set(key, value);
  return data;
}

describe("P10 work commands", () => {
  it("parses a worker heartbeat without requiring a note", () => {
    expect(parseWorkForm(form({
      kind: "work.heartbeat",
      workItemId: "work-item-001",
    }))).toEqual({ kind: "work.heartbeat", workItemId: "work-item-001", progressNote: null });
  });

  it("requires an auditable reason when work is blocked", () => {
    expect(() => parseWorkForm(form({
      kind: "work.block",
      workItemId: "work-item-001",
      reason: "kẹt xe",
    }))).toThrow("Lý do bị vướng cần ít nhất 10 ký tự.");
  });

  it("requires a worker for a controlled reassignment", () => {
    expect(() => parseWorkForm(form({
      kind: "work.supervise",
      workItemId: "work-item-001",
      supervisorAction: "REASSIGN",
      reason: "Giao lại vì ca làm đã kết thúc",
    }))).toThrow("Cần chọn người nhận việc mới.");
  });
});
