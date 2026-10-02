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
