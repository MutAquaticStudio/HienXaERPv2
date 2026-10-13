import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: mocks.rpc }) }));
import { OperationalCompletion } from "./operational-completion";
const snapshot = (exceptions: Record<string, boolean>) => ({ commercial_state: "DRAFT", delivery_state: "PENDING", payment_state: "NOT_BILLED", operational_complete: false, exceptions, delivery_model: "SINGLE_SOURCE", trip_grouping_supported: false });
beforeEach(() => mocks.rpc.mockReset());
afterEach(cleanup);
it("avoids a duplicate routine summary when the source has no open exception", async () => {
 mocks.rpc.mockResolvedValue({ data: snapshot({ cargo_remaining: false }), error: null });
 expect(await OperationalCompletion({ orderId: "qa-order" })).toBeNull();
 expect(mocks.rpc).toHaveBeenCalledWith("sales_order_operational_snapshot", { target_order_id: "qa-order" });
});
it("keeps cargo and unresolved refunds visible instead of hiding them with the summary", async () => {
 mocks.rpc.mockResolvedValue({ data: snapshot({ cargo_remaining: true, customer_refund_offset_pending: true }), error: null });
 render(await OperationalCompletion({ orderId: "qa-order" }));
 expect(screen.getByText("Còn hàng thực trên xe")).toBeInTheDocument();
 expect(screen.getByText("Tiền khách cần hoàn / cấn trừ chưa xong")).toBeInTheDocument();
 expect(screen.getByLabelText("Ngoại lệ còn mở")).toHaveAttribute("data-operational-complete", "false");
});
it("shows an unrecognized open source exception rather than silently dropping it", async () => {
 mocks.rpc.mockResolvedValue({ data: snapshot({ new_source_exception: true }), error: null });
 render(await OperationalCompletion({ orderId: "qa-order" }));
 expect(screen.getByText("Còn ngoại lệ nguồn")).toBeInTheDocument();
});
it("does not claim completion if the source snapshot could not be read", async () => {
 mocks.rpc.mockResolvedValue({ data: null, error: { message: "QA disconnected" } });
 await expect(OperationalCompletion({ orderId: "qa-order" })).rejects.toThrow("Không thể xác định điều kiện hoàn tất vận hành.");
});
