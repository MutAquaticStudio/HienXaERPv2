import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push, refresh: m.refresh }) }));
import { ClaimDeliveryCard } from "./claim-delivery-card";
import type { WorkerPoolDelivery } from "@/modules/portal/types";

const delivery: WorkerPoolDelivery = {
  id: "d1", number: "DL-2026-000400", version: 2, site_name: "Công trình Cầu Giấy", address: "12 Trần Duy Hưng",
  lines: [{ material_name: "Cát đen", quantity: "2.5", unit: "khối" }],
  vehicles: [
    { vehicle_id: "v1", code: "Xe cn nhỏ", start_at: "2026-11-16T02:00:00Z", end_at: "2026-11-16T03:00:00Z" },
    { vehicle_id: "v2", code: "Xe cn to", plate_number: "29C-123.45", start_at: "2026-11-16T03:00:00Z", end_at: "2026-11-16T04:00:00Z" },
  ],
  suggested_vehicle_id: "v2",
};
const fetchMock = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows what to carry and pre-selects the suggested truck", () => {
  render(<ClaimDeliveryCard delivery={delivery} />);
  expect(screen.getByText("Cát đen")).toBeTruthy();
  expect(screen.getByText("2,5 khối")).toBeTruthy();
  expect((screen.getByRole("radio", { name: /Xe cn to · Gợi ý/ }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByRole("button", { name: "Nhận phiếu giao, đi lúc 10:00 16/11" })).toBeTruthy();
});

it("takes the delivery with the truck the worker picked and opens the job", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ workItemId: "w9" }) });
  render(<ClaimDeliveryCard delivery={delivery} />);
  fireEvent.click(screen.getByRole("radio", { name: /Xe cn nhỏ/ }));
  fireEvent.click(screen.getByRole("button", { name: "Nhận phiếu giao, đi lúc 09:00 16/11" }));
  await waitFor(() => expect(m.push).toHaveBeenCalledWith("/work/jobs/w9"));
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ deliveryId: "d1", vehicleId: "v1", version: 2 });
});

it("explains when someone else took it, and retries the same choice with the same operation", async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Chưa nhận được.", unknown: true }) })
    .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Phiếu này đã có người nhận hoặc văn phòng đã điều phối. Tải lại danh sách." }) });
  render(<ClaimDeliveryCard delivery={delivery} />);
  fireEvent.click(screen.getByRole("button", { name: /Nhận phiếu giao/ }));
  await screen.findByText("Chưa nhận được.");
  fireEvent.click(screen.getByRole("button", { name: /Nhận phiếu giao/ }));
  await screen.findByText(/đã có người nhận/);
  const [first, second] = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).operationId);
  expect(first).toBe(second);
  expect(m.push).not.toHaveBeenCalled();
});
