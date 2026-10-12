// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/modules/portal/server", () => ({
  authenticatedPortalClient: async () => ({ supabase: {} }), portalRpc: rpc,
  PortalRpcError: class extends Error { code = "42501"; },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error("REDIRECT:" + url); } }));
import { getCustomerPortalOrder, getWorkerPortalJob } from "./actions";
import { PortalRpcError } from "./server";
beforeEach(() => { rpc.mockReset(); });
it("sends a worker back to current work after assignment access is revoked", async () => {
  rpc.mockRejectedValue(new PortalRpcError({ code: "42501", message: "forbidden" }));
  await expect(getWorkerPortalJob("source")).rejects.toThrow("REDIRECT:/work?notice=work-unavailable");
});
it("denies another customer's order without presenting an application crash", async () => {
  rpc.mockRejectedValue(new PortalRpcError({ code: "42501", message: "forbidden" }));
  await expect(getCustomerPortalOrder("source")).rejects.toThrow("REDIRECT:/customer/orders?notice=order-unavailable");
});
it("does not disguise a database dependency failure as permission denial", async () => {
  rpc.mockRejectedValue(new Error("dependency_failed"));
  await expect(getWorkerPortalJob("source")).rejects.toThrow("dependency_failed");
});
