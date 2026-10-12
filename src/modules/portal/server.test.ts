import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));
import { portalRpc, PortalRpcError } from "./server";

it("still rejects a blocked posting RPC while presenting its reason in Vietnamese", async () => {
  const message = "branch_not_operational: ordinary posting requires ACTIVE";
  const rpc = vi.fn(async () => ({ data: null, error: { code: "PT423", message } }));
  const client = { rpc } as unknown as Parameters<typeof portalRpc>[0];
  await expect(portalRpc(client, "verify_delivery", { delivery_id: "delivery" })).rejects.toMatchObject({
    code: "PT423", rawMessage: message,
    message: expect.stringContaining("Chưa thể ghi sổ"),
  });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("verify_delivery", { delivery_id: "delivery" });
});

it("keeps all other RPC error details and success results unchanged", async () => {
  const failure = new PortalRpcError({ code: "42501", message: "forbidden" });
  expect(failure.message).toBe("forbidden");
  expect(failure.code).toBe("42501");
  const client = { rpc: vi.fn(async () => ({ data: { id: "document" }, error: null })) } as unknown as Parameters<typeof portalRpc>[0];
  await expect(portalRpc(client, "read_document")).resolves.toEqual({ id: "document" });
});
