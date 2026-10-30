// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), scope: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`REDIRECT ${path}`); }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/modules/messaging/server", () => ({ messengerScope: mocks.scope }));

import { sendDirectMessageAction, sendMessageAction } from "./actions";

const contact = "b81b801c-2610-48b9-985e-64b10d859d74";
const customer = "2bdfbe30-d09c-4f0e-b66a-3e820ddf4c55";
const conversation = "61c446b6-cb9f-49b2-994c-70c73e3e5802";
const operation = "7f309000-0000-4000-8000-000000000001";
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.append(key, value); return data; };
const idle = { status: "idle" as const, message: "" };

describe("Tin nhắn (D36)", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.scope.mockResolvedValue({ branchId: null, customerId: customer, canAi: false }); });

  it("opens the direct chat with the contact, sends the first message and shows the chat", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: conversation, error: null }).mockResolvedValueOnce({ data: "m1", error: null });
    await expect(sendDirectMessageAction(idle, form({ contact_auth_user_id: contact, contact_customer_id: customer, body: " Chào anh ", surface: "customer", operation_id: operation })))
      .rejects.toThrow(`REDIRECT /customer/messages?conversation=${conversation}`);
    expect(mocks.scope).toHaveBeenCalledWith("customer");
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "open_direct_conversation", { target_branch_id: null, target_customer_id: customer, contact_auth_user_id: contact, contact_customer_id: customer });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "send_message", { target_conversation_id: conversation, target_body: "Chào anh", operation_id: operation });
  });

  it("says plainly when the person may not write to that contact", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "conversation_participant_forbidden" } });
    expect(await sendDirectMessageAction(idle, form({ contact_auth_user_id: contact, contact_customer_id: "", body: "Xin chào", surface: "admin", operation_id: operation })))
      .toEqual({ status: "error", message: "Bạn không nhắn được cho người này." });
  });

  it("sends to an open chat and refuses an empty message", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: "m2", error: null });
    expect(await sendMessageAction(idle, form({ conversation_id: conversation, body: "Ok", surface: "work", operation_id: operation }))).toEqual({ status: "success", message: "", messageId: "m2" });
    expect((await sendMessageAction(idle, form({ conversation_id: conversation, body: "  ", surface: "work", operation_id: operation }))).status).toBe("error");
  });
});
