import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));

import { cancelPaymentRequestAction, createPaymentRequestAction } from "./payment-request-actions";

const customerId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const request = {
  id: "33333333-3333-4333-8333-333333333333", code: "YC7K2MQ", state: "OPEN", amount_vnd: "10000000", received_amount_vnd: "0", remaining_amount_vnd: "10000000",
  note: "SEVQR TT KH003 YC7K2MQ", created_via: "STAFF", created_at: "2026-11-01T05:00:00Z", expires_at: "2026-11-08T05:00:00Z",
  bank_name: "Vietcombank", account_number: "0071000318", account_holder: "Hiền Xa", lines: [],
};
beforeEach(() => { vi.clearAllMocks(); });

describe("D44 payment request actions", () => {
  it("asks the database with each chosen debt once and the same operation id, and returns the request", async () => {
    m.rpc.mockResolvedValue({ data: request, error: null });
    const result = await createPaymentRequestAction({ customerId, keys: ["a", "b", "a"], operationId });
    expect(m.rpc).toHaveBeenCalledWith("create_payment_request", { target_customer_id: customerId, group_keys: ["a", "b"], operation_id: operationId });
    expect(result).toEqual({ status: "SUCCESS", request });
  });

  it("explains refusals in Vietnamese, never with the database code, and treats a lost answer as unknown", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "payment_request_nothing_owed" } });
    const refused = await createPaymentRequestAction({ customerId, keys: ["a"], operationId });
    expect(refused).toEqual({ status: "FAILED", message: expect.stringContaining("không còn nợ") });
    m.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "forbidden" } });
    expect(await createPaymentRequestAction({ customerId, keys: ["a"], operationId })).toEqual({ status: "FAILED", message: expect.stringContaining("không có quyền") });
    m.rpc.mockResolvedValue({ data: null, error: { code: "08006", message: "connection lost" } });
    expect((await createPaymentRequestAction({ customerId, keys: ["a"], operationId })).status).toBe("UNKNOWN");
    expect(await createPaymentRequestAction({ customerId, keys: [], operationId })).toEqual({ status: "FAILED", message: expect.any(String) });
    expect(m.rpc).toHaveBeenCalledTimes(3);
  });

  it("cancels a request, and refuses to cancel one already paid", async () => {
    m.rpc.mockResolvedValue({ data: request.id, error: null });
    expect((await cancelPaymentRequestAction({ requestId: request.id, operationId })).status).toBe("SUCCESS");
    m.rpc.mockResolvedValue({ data: null, error: { code: "55000", message: "payment_request_already_paid" } });
    expect(await cancelPaymentRequestAction({ requestId: request.id, operationId })).toEqual({ status: "FAILED", message: expect.stringContaining("đã được thanh toán") });
  });
});
