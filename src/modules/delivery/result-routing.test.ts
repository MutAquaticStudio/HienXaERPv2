// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error("REDIRECT:" + url); } }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));
import { submitDeliveryResultAction } from "./actions";

describe("Invalid delivery result feedback", () => {
  it("retains the detail route when the delivery identifier is valid", async () => {
    const data = new FormData(); data.set("deliveryId", "2bdfbe30-d09c-4f0e-b66a-3e820ddf4c55");
    await expect(submitDeliveryResultAction(data)).rejects.toThrow("/admin/deliveries/2bdfbe30-d09c-4f0e-b66a-3e820ddf4c55?error=");
  });
  it("does not interpolate a forged identifier into a redirect", async () => {
    const data = new FormData(); data.set("deliveryId", "../../login");
    await expect(submitDeliveryResultAction(data)).rejects.toThrow("REDIRECT:/admin/deliveries?error=");
  });
});

import { vehicleStatusLabel } from "./presentation";
it("labels a vehicle as free or out on a delivery in the pickers (FB10)", () => {
  const base = { vehicle_id: "v", capacity_quantity: "5.000000", capacity_symbol: "tấn", busy_delivery_number: null, busy_state: null, busy_until: null };
  expect(vehicleStatusLabel(base)).toBe(" · chở 5 tấn · Rảnh");
  expect(vehicleStatusLabel({ ...base, busy_delivery_number: "PG-00012", busy_state: "DISPATCHED", busy_until: "2026-10-24T03:30:00Z" })).toBe(" · chở 5 tấn · Đang giao PG-00012 đến 10:30");
});
