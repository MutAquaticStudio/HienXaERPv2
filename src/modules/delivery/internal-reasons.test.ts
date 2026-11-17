// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), permission: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error("REDIRECT:" + url); } }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: mocks.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: mocks.rpc }) }));
import { submitDeliveryResultAction } from "./actions";
import { INTERNAL_ARRIVAL_NOTES, OFFICE_REPORTED_ARRIVAL_NOTE } from "./internal-reasons";

const deliveryId = "2bdfbe30-d09c-4f0e-b66a-3e820ddf4c55";
function form(state?: string, reason?: string) {
  const data = new FormData();
  data.set("deliveryId", deliveryId); data.set("resultKind", "FAILED"); data.set("version", "3");
  data.set("operationId", "7a1b2c3d-1111-4222-8333-444455556666");
  data.append("deliveryLineId", "9a1b2c3d-1111-4222-8333-444455556666"); data.append("actualQuantity", "0");
  if (state) data.set("deliveryState", state);
  if (reason) data.set("missingArrivalReason", reason);
  return data;
}
async function sentReason(data: FormData) {
  await expect(submitDeliveryResultAction(data)).rejects.toThrow("REDIRECT:");
  return mocks.rpc.mock.calls.find(([name]) => name === "submit_delivery_result")?.[1]?.missing_arrival_reason;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.permission.mockResolvedValue({ branchId: "b", permissions: new Set() });
  mocks.rpc.mockResolvedValue({ data: "result-1", error: null });
});

describe("D96 (D4): internal arrival notes never reach the customer", () => {
  it("writes the office note only where the database needs a reason (no 'Đã tới nơi' step)", async () => {
    expect(await sentReason(form("DISPATCHED"))).toBe(OFFICE_REPORTED_ARRIVAL_NOTE);
    mocks.rpc.mockClear();
    expect(await sentReason(form("ARRIVED"))).toBe("");
  });

  it("keeps a reason someone typed", async () => {
    expect(await sentReason(form("DISPATCHED", "Công trình đóng cửa"))).toBe("Công trình đóng cửa");
  });

  it("lists the same internal notes as the database function that builds the customer push", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261117110500_d96_customer_delivery_reason.sql"), "utf8");
    const listed = /btrim\(coalesce\(reason, ''\)\) in \(''((?:, '[^']+')+)\)/.exec(sql)?.[1];
    expect(listed?.split(", ").filter(Boolean).map((item) => item.replace(/'/g, ""))).toEqual([...INTERNAL_ARRIVAL_NOTES]);
  });
});
