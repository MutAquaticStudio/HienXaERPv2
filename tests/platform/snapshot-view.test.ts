import { describe, expect, it } from "vitest";
import { parseSnapshotView, snapshotPage } from "@/modules/platform/snapshot-view";

describe("snapshot pagination", () => {
  it("rejects untrusted tabs and malformed cursors", () => {
    expect(parseSnapshotView({ tab: "admin", after: "' OR true --" }, ["profile", "pricing"])).toEqual({ tab: "profile", after: undefined });
    expect(parseSnapshotView({ tab: ["pricing"], after: ["anything"] }, ["profile"])).toEqual({ tab: "profile", after: undefined });
  });
  it("does not lose or duplicate a row at the page boundary", () => {
    const rows = Array.from({ length: 101 }, (_, n) => ({ id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}` }));
    const first = snapshotPage(rows.slice(0, 51), { tab: "profile" });
    const second = snapshotPage(rows.filter(row => row.id > first.page!.next!).slice(0, 51), { tab: "profile", after: first.page!.next });
    const last = snapshotPage(rows.filter(row => row.id > second.page!.next!), { tab: "profile", after: second.page!.next });
    expect([...first.rows, ...second.rows, ...last.rows]).toEqual(rows);
    expect(last.page?.next).toBeUndefined();
    expect(snapshotPage([], { tab: "profile" }).page?.next).toBeUndefined();
  });
});
