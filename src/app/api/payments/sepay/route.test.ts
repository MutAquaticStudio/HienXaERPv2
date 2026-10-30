// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: m.createClient }));
vi.mock("@/lib/supabase/config", () => ({ getSupabaseConfig: () => ({ url: "http://127.0.0.1:54321", publishableKey: "pk" }) }));
import { POST } from "./route";

const body = JSON.stringify({ id: 92704, transferType: "in", transferAmount: 5000000, accountNumber: "0071000315", content: "SO2026031501 KH315" });
const post = (headers: Record<string, string> = { "x-sepay-signature": "sha256=abc", "x-sepay-timestamp": "1700000000" }, payload = body) =>
  POST(new Request("http://localhost/api/payments/sepay", { method: "POST", body: payload, headers }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SECRET_KEY", "sk-test");
  m.createClient.mockReturnValue({ rpc: m.rpc });
  m.rpc.mockResolvedValue({ data: { success: true, state: "POSTED" }, error: null });
});

it("hands the raw body and SePay signature headers to the database and answers exactly {success: true}", async () => {
  const response = await post();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true });
  expect(m.rpc).toHaveBeenCalledWith("ingest_sepay_webhook", { raw_body: body, signature: "sha256=abc", sent_at: "1700000000" });
  expect(m.createClient).toHaveBeenCalledWith("http://127.0.0.1:54321", "sk-test", expect.objectContaining({ auth: expect.objectContaining({ persistSession: false }) }));
});

it("a replayed transaction is still a success, so SePay stops retrying", async () => {
  m.rpc.mockResolvedValueOnce({ data: { success: true, duplicate: true, state: "POSTED" }, error: null });
  expect((await post()).status).toBe(200);
});

it("refuses unsigned requests before the database", async () => {
  expect((await post({})).status).toBe(400);
  expect((await post({ "x-sepay-signature": "sha256=abc", "x-sepay-timestamp": "1" }, "")).status).toBe(400);
  expect(m.rpc).not.toHaveBeenCalled();
});

it("a wrong signature is 401; not configured or a database error is 503 so SePay sends it again", async () => {
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: "sepay_signature_invalid" } });
  expect((await post()).status).toBe(401);
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: "sepay_payload_invalid" } });
  expect((await post()).status).toBe(400);
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: "sepay_not_configured" } });
  const response = await post();
  expect(response.status).toBe(503);
  expect((await response.json()).success).toBe(false);
});

it("without the service key nothing is called and SePay retries later", async () => {
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
  expect((await post()).status).toBe(503);
  expect(m.rpc).not.toHaveBeenCalled();
});
