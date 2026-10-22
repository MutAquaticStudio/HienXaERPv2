import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
import { DeliveryLoadForm } from "./delivery-load-form";

const workItemId = "11111111-1111-4111-8111-111111111111";
const cement = { id: "33333333-3333-4333-8333-333333333333", material_name: "Xi măng", unit: "kg", planned_base_quantity: "3000", loaded_base_quantity: null,
  reportable_base_quantity: "0", sold_unit: "bao", sold_numerator: "50", sold_denominator: "1" };
const delivery = { id: "22222222-2222-4222-8222-222222222222", version: 3, assignment_version: 1, state: "ASSIGNED", can_submit_result: false, can_load: true, lines: [cement] };
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  navigation.refresh.mockReset(); fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "xe.jpg", { type: "image/jpeg" });

it("photographs the loaded truck and confirms everything planned was loaded", async () => {
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ evidenceId: "55555555-5555-4555-8555-555555555555" }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ handoffId: "h1" }) });
  render(<DeliveryLoadForm workItemId={workItemId} version={2} delivery={delivery} />);
  const camera = screen.getByLabelText("Chụp ảnh hàng trên xe") as HTMLInputElement;
  expect(camera).toHaveAttribute("capture", "environment");
  const click = vi.spyOn(camera, "click");
  fireEvent.click(screen.getByRole("button", { name: "Đã lấy hàng lên xe · chụp ảnh" }));
  expect(click).toHaveBeenCalled();
  fireEvent.change(camera, { target: { files: [photo()] } });
  fireEvent.click(await screen.findByRole("button", { name: "Xác nhận đã lấy hàng lên xe (1 ảnh)" }));
  await waitFor(() => expect(navigation.refresh).toHaveBeenCalled());
  expect(fetcher.mock.calls[1][0]).toBe("/api/portal/delivery-loaded");
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ workItemId, lines: null, evidenceIds: ["55555555-5555-4555-8555-555555555555"],
    expectedVersion: 2, expectedDeliveryVersion: 3, expectedAssignmentVersion: 1 });
  expect(screen.getByRole("status")).toHaveTextContent("Đã lấy hàng lên xe");
});

it("records a short loading in the sold unit and refuses more than planned", async () => {
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ evidenceId: "55555555-5555-4555-8555-555555555555" }) })
    .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Kho không còn đủ hàng cho phiếu này. Báo kho hoặc điều phối." }) });
  render(<DeliveryLoadForm workItemId={workItemId} version={2} delivery={delivery} />);
  fireEvent.click(screen.getByRole("button", { name: "Lấy thiếu hàng" }));
  const quantity = screen.getByLabelText(/Xi măng · cần giao 60 bao \(3\.000 kg\)/);
  expect(quantity).toHaveValue("60");
  fireEvent.change(quantity, { target: { value: "61" } });
  fireEvent.click(screen.getByRole("button", { name: "Đã lấy hàng lên xe · chụp ảnh" }));
  expect(screen.getByRole("alert")).toHaveTextContent("không vượt số cần giao");
  fireEvent.change(quantity, { target: { value: "40" } });
  fireEvent.change(screen.getByLabelText("Chụp ảnh hàng trên xe"), { target: { files: [photo()] } });
  fireEvent.click(await screen.findByRole("button", { name: "Xác nhận đã lấy hàng lên xe (1 ảnh)" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Kho không còn đủ hàng");
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ lines: [{ deliveryLineId: cement.id, loadedBaseQuantity: "2000" }] });
  expect(navigation.refresh).not.toHaveBeenCalled();
});
