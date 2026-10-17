import { expect, it, vi } from "vitest";

vi.mock("@/lib/access/context", () => ({ requireInternalPermission: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));

import { mergeOpenDeliveries } from "./server";

const row = (id: string, scheduled_at: string | null) => ({ id, delivery_number: id, site_name_snapshot: "", delivery_address_snapshot: "", scheduled_at, scheduled_end_at: null, execution_state: "PLANNED", version: 1 });

it("merges the per-state pages by schedule with unscheduled deliveries last", () => {
  const merged = mergeOpenDeliveries([
    { data: [row("b", "2200-01-01T02:00:00Z"), row("d", null)], error: null },
    { data: [row("a", "2200-01-01T01:00:00Z"), row("c", null)], error: null },
  ]);
  expect(merged.data?.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
  expect(mergeOpenDeliveries([{ data: Array.from({ length: 100 }, (_, i) => row(`p${i}`, null)), error: null }, { data: [row("x", "2200-01-01T00:00:00Z")], error: null }]).data).toHaveLength(100);
  expect(mergeOpenDeliveries([{ data: [], error: null }, { data: null, error: { message: "timeout" } }])).toEqual({ data: null, error: { message: "timeout" } });
});
