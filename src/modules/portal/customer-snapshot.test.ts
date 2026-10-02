// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn(), revision: vi.fn(), from: vi.fn() }));
vi.mock("@/modules/portal/server", () => ({ authenticatedPortalClient: mocks.client, portalRpc: mocks.rpc }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
import { getCustomerPortalSnapshot } from "./actions";

describe("Customer current quotation status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: mocks.revision };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
    mocks.from.mockReturnValue(chain);
    mocks.client.mockResolvedValue({ supabase: { from: mocks.from } });
    mocks.rpc.mockResolvedValue({ quotation: { id: "quote", current_revision_id: "revision" } });
  });

  it("uses the canonical current revision state, not a missing legacy status", async () => {
    mocks.revision.mockResolvedValue({ data: { state: "ACCEPTED", expires_at: "2026-10-31T17:00:00Z" }, error: null });
    expect((await getCustomerPortalSnapshot()).quotation?.state).toBe("ACCEPTED");
    expect(mocks.from().eq).toHaveBeenCalledWith("id", "revision");
  });

  it("does not expose a revision denied by the existing RLS boundary", async () => {
    mocks.revision.mockResolvedValue({ data: null, error: null });
    expect((await getCustomerPortalSnapshot()).quotation).toBeNull();
  });

  it("does not invite a response to an expired SENT revision", async () => {
    mocks.revision.mockResolvedValue({ data: { state: "SENT", expires_at: "2000-01-01T00:00:00Z" }, error: null });
    expect((await getCustomerPortalSnapshot()).quotation?.can_respond).toBe(false);
  });

  it("does not fetch quotations for a receiver snapshot with no quote", async () => {
    mocks.rpc.mockResolvedValue({ quotation: null });
    expect((await getCustomerPortalSnapshot()).quotation).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
