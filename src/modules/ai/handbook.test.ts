// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AGENT_ACTIONS } from "./agent/registry";
import { AI_HANDBOOK } from "./handbook";
import { AI_SOURCES } from "./sources";

describe("business handbook for the assistant (D50)", () => {
  it("names every action the assistant can prepare, so a new action is not left out of the handbook", () => {
    for (const action of AGENT_ACTIONS) expect(AI_HANDBOOK, action.kind).toContain(action.kind);
    expect(AI_HANDBOOK).toContain("tao_de_xuat");
    expect(AI_HANDBOOK).toContain("doc_du_lieu");
  });

  it("explains the state values of the sources the assistant reads", () => {
    for (const source of ["sales_order_read", "delivery_read", "purchase_order_read", "receivable_read", "payment_read", "expense_read", "stock_count_read", "inventory_movement_read"]) {
      expect(AI_SOURCES.some((item) => item.name === source), source).toBe(true);
      expect(AI_HANDBOOK, source).toContain(source);
    }
    expect(AI_HANDBOOK).toContain("PLANNED = Chờ phân giao");
    expect(AI_HANDBOOK).toContain("CONFIRMED = Đã xác nhận");
  });

  it("stays stable text (no dates or per-person content) so it is cached with the instructions", () => {
    expect(AI_HANDBOOK).not.toMatch(/\b20\d{2}-\d{2}-\d{2}\b/);
    expect(AI_HANDBOOK.length).toBeLessThan(40_000);
  });
});
