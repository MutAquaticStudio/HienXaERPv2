import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkResultDraftForm } from "./work-result-draft-form";
const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
const workItemId = "11111111-1111-4111-8111-111111111111";
const delivery = { id: "22222222-2222-4222-8222-222222222222", version: 4, assignment_version: 1, state: "ARRIVED", lines: [
  { id: "33333333-3333-4333-8333-333333333333", material_name: "Material A", unit: "unit", planned_base_quantity: "2" },
  { id: "44444444-4444-4444-8444-444444444444", material_name: "Material B", unit: "kg", planned_base_quantity: "3" },
] };
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => { localStorage.clear(); navigation.push.mockReset(); fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("preserves all line quantities after rejection and reload, retries the same intent and clears only on success", async () => {
  fetcher.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "stale_work_or_delivery_version" }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ resultId: "saved" }) });
  const first = render(<WorkResultDraftForm workItemId={workItemId} version={2} delivery={delivery} initialReceiverName="QA Receiver" />);
  await screen.findByLabelText("Lượng thực tế · Material A (unit)");
  fireEvent.change(screen.getByLabelText("Lượng thực tế · Material A (unit)"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Lượng thực tế · Material B (kg)"), { target: { value: "0" } });
  fireEvent.submit(screen.getByRole("button", { name: "Gửi kết quả công việc" }).closest("form")!);
  await screen.findByText("Công việc hoặc phiếu giao đã thay đổi. Vui lòng tải lại để kiểm tra; bản nháp vẫn được giữ.");
  expect(screen.queryByText("stale_work_or_delivery_version")).not.toBeInTheDocument();
  const original = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(original.deliveryLines.map((line: { actualQuantity: string }) => line.actualQuantity)).toEqual(["1", "0"]);
  expect(navigation.push).not.toHaveBeenCalled(); first.unmount();
  render(<WorkResultDraftForm workItemId={workItemId} version={2} delivery={delivery} />);
  await waitFor(() => expect(screen.getByLabelText("Lượng thực tế · Material A (unit)")).toHaveValue(1));
  expect(screen.getByLabelText("Lượng thực tế · Material B (kg)")).toHaveValue(0);
  fireEvent.submit(screen.getByRole("button", { name: "Gửi kết quả công việc" }).closest("form")!);
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/work"));
  expect(JSON.parse(fetcher.mock.calls[1][1].body).operationId).toBe(original.operationId);
  expect(localStorage.getItem("hx:work-draft:" + workItemId)).toBeNull();
});
it("asks for a missing-arrival reason and disables sending without a current source assignment", async () => {
  render(<WorkResultDraftForm workItemId={workItemId} version={2} delivery={{ ...delivery, state: "DISPATCHED", assignment_version: null }} />);
  await screen.findByLabelText("Lý do chưa ghi nhận bước tới nơi");
  expect(screen.getByRole("button", { name: "Gửi kết quả công việc" })).toBeDisabled();
});
