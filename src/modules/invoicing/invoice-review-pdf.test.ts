// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { GET } from "@/app/api/invoices/[id]/review/pdf/route";
import { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  invoice: null as Record<string, unknown> | null,
  lines: [] as Record<string, unknown>[],
  queriedTables: [] as string[],
  accessError: null as Error | null,
}));

vi.mock("@/lib/access/context", () => ({
  requireInternalPermission: async () => {
    if (state.accessError) throw state.accessError;
    return { branchId: "a29d9f95-516a-4752-a67e-af3f5611d7bf" };
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    from: (table: string) => {
      state.queriedTables.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: async () => ({ data: state.lines, error: null }),
        maybeSingle: async () => ({ data: state.invoice, error: null }),
      };
      return query;
    },
  }),
}));

const invoiceId = "0c38168e-8893-4ba5-b695-1138b302a301";
const request = (id: string) => GET(new Request(`http://localhost/api/invoices/${id}/review/pdf`), { params: Promise.resolve({ id }) });

describe("invoice review PDF", () => {
  beforeEach(() => {
    state.invoice = null;
    state.lines = [];
    state.queriedTables = [];
    state.accessError = null;
  });

  it("returns 403 without querying an invoice for a user lacking finance access", async () => {
    state.accessError = new AppError({ code: "FORBIDDEN", message: "Không có quyền xem hồ sơ.", status: 403 });
    const response = await request(invoiceId);
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.queriedTables).toEqual([]);
  });

  it("rejects malformed IDs before querying Supabase", async () => {
    const response = await request("not-a-uuid");
    expect(response.status).toBe(400);
    expect(state.queriedTables).toEqual([]);
  });

  it("returns 404 for a valid ID without an accessible invoice", async () => {
    const response = await request(invoiceId);
    expect(response.status).toBe(404);
  });

  it("renders a non-legal review PDF from a populated source snapshot", async () => {
    state.invoice = {
      id: invoiceId,
      branch_id: "a29d9f95-516a-4752-a67e-af3f5611d7bf",
      customer_name_snapshot: "Khach hang QA",
      source_obligation_id: "9536e917-f401-4b8b-9a94-63a4775e2ba0",
      source_type: "SERVICE_VERIFICATION",
      source_id: "80ee8222-f511-4e70-a266-ee5c6f1dfdd5",
      source_amount_vnd: "100000",
      billing_verified_at: "2026-09-21T00:00:00.000Z",
      invoice_due_at: null,
      status: "DRAFT",
      policy_state: "AWAITING_POLICY",
      provider_state: "NOT_CONFIGURED",
      create_operation_id: "536a868d-0faa-4033-833a-95af80c94bb9",
    };
    state.lines = [{ line_number: 1, source_line_id: state.invoice.source_id, description_snapshot: "Nguon dich vu QA", quantity_snapshot: "1.000000", source_amount_vnd: "100000" }];

    const response = await request(invoiceId);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(`invoice-review-${invoiceId}.pdf`);
    expect(state.queriedTables).toEqual(["invoice_intent_read", "invoice_draft_line_read", "company_profile"]);
    const document = await PDFDocument.load(await response.arrayBuffer());
    expect(document.getPageCount()).toBe(1);
  });
});
