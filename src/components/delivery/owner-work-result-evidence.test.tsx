import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OwnerWorkResultEvidence } from "./owner-work-result-evidence";
const mocks = vi.hoisted(() => ({ report: { data: { source_work_item_result_id: "work-result" } as { source_work_item_result_id: string } | null, error: null as object | null }, evidence: { data: [{ evidence_id: "proof-a" }, { evidence_id: "proof-b" }], error: null as object | null }, requested: [] as [string, unknown][] }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ from: (table: string) => {
  const query = { select: () => query, eq: (name: string, value: unknown) => { mocks.requested.push([name, value]); return table === "work_result_portal_evidence" ? Promise.resolve(mocks.evidence) : query; }, order: () => query, limit: () => query, maybeSingle: async () => mocks.report };
  return query;
} }) }));
beforeEach(() => { mocks.report.data = { source_work_item_result_id: "work-result" }; mocks.report.error = null; mocks.evidence.error = null; mocks.requested = []; });
afterEach(cleanup);
it("shows private authorization-gated photos linked to the exact worker result and exposes an optional adjustment note", async () => {
  render(await OwnerWorkResultEvidence({ deliveryId: "delivery" }));
  expect(mocks.requested).toContainEqual(["delivery_id", "delivery"]);
  expect(mocks.requested).toContainEqual(["work_result_id", "work-result"]);
  // Photos show as thumbnails read through the permission-checked route (A3b).
  expect(screen.getAllByRole("button", { name: /Xem ảnh/ })).toHaveLength(2);
  expect([...document.querySelectorAll("img")].map(image => image.getAttribute("src"))).toEqual(["/api/evidence/proof-a/download", "/api/evidence/proof-b/download"]);
  expect(screen.getByLabelText("Ghi chú điều chỉnh số lượng thợ (không bắt buộc)")).toHaveAttribute("maxlength", "500");
  expect(screen.getByLabelText("Ghi chú điều chỉnh số lượng thợ (không bắt buộc)")).not.toBeRequired();
});
it("does not expose evidence links after an RLS/read failure", async () => {
  mocks.evidence.error = { message: "permission denied" };
  render(await OwnerWorkResultEvidence({ deliveryId: "delivery" }));
  expect(screen.queryByRole("link")).not.toBeInTheDocument(); expect(screen.getByRole("alert")).toHaveTextContent("Không coi là đã kiểm tra");
});
it("does not pretend that a failed report load has been verified", async () => {
  mocks.report.error = { message: "database unavailable" };
  render(await OwnerWorkResultEvidence({ deliveryId: "delivery" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Chưa tải được kết quả thợ");
});
it("does not add worker controls to an unrelated direct report", async () => {
  mocks.report.data = null;
  render(await OwnerWorkResultEvidence({ deliveryId: "delivery" }));
  expect(screen.queryByRole("link")).not.toBeInTheDocument(); expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
