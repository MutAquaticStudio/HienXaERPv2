import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
import { DeliveryDoneForm, enteredBase } from "./delivery-done-form";

const workItemId = "11111111-1111-4111-8111-111111111111";
const cement = { id: "33333333-3333-4333-8333-333333333333", material_name: "Xi măng", unit: "kg", planned_base_quantity: "3000", loaded_base_quantity: "3000",
  reportable_base_quantity: "3000", sold_unit: "bao", sold_numerator: "50", sold_denominator: "1" };
const delivery = { id: "22222222-2222-4222-8222-222222222222", version: 4, assignment_version: 1, state: "DISPATCHED", can_submit_result: true, lines: [cement] };
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  navigation.push.mockReset(); fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "anh.jpg", { type: "image/jpeg" });

it("converts what the worker types in the sold unit to an exact base quantity", () => {
  expect(enteredBase("58", cement)).toBe("2900");
  expect(enteredBase("1,5", cement)).toBe("75");
  expect(enteredBase("abc", cement)).toBeNull();
  expect(enteredBase("2", { ...cement, sold_unit: null })).toBe("2");
});

it("asks to load the truck first", () => {
  render(<DeliveryDoneForm workItemId={workItemId} version={2} delivery={{ ...delivery, can_submit_result: false, awaiting_handoff: true }} />);
  expect(screen.getByRole("button", { name: "Lấy hàng lên xe trước" })).toBeDisabled();
});

it("opens the camera, uploads the photo and reports every line as loaded", async () => {
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ evidenceId: "55555555-5555-4555-8555-555555555555" }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ resultId: "r1" }) });
  render(<DeliveryDoneForm workItemId={workItemId} version={2} delivery={delivery} receiverName="Anh Nhận" />);
  const camera = screen.getByLabelText("Chụp ảnh giao hàng") as HTMLInputElement;
  expect(camera).toHaveAttribute("capture", "environment");
  const click = vi.spyOn(camera, "click");
  fireEvent.click(screen.getByRole("button", { name: "Đã giao · chụp ảnh" }));
  expect(click).toHaveBeenCalled();
  fireEvent.change(camera, { target: { files: [photo()] } });
  const confirm = await screen.findByRole("button", { name: "Xác nhận đã giao (1 ảnh)" });
  const upload = fetcher.mock.calls[0];
  expect(upload[0]).toBe("/api/portal/evidence/upload");
  expect((upload[1].body as FormData).get("workItemId")).toBe(workItemId);
  fireEvent.click(confirm);
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/work?notice=delivery-reported"));
  const body = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(fetcher.mock.calls[1][0]).toBe("/api/portal/delivery-done");
  expect(body).toMatchObject({ workItemId, lines: null, receiverName: "Anh Nhận", evidenceIds: ["55555555-5555-4555-8555-555555555555"],
    expectedVersion: 2, expectedDeliveryVersion: 4, expectedAssignmentVersion: 1 });
});

it("reports a short delivery in the sold unit; nothing delivered needs no note (FB7)", async () => {
  fetcher.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Công việc vừa được cập nhật. Tải lại công việc rồi báo lại." }) });
  render(<DeliveryDoneForm workItemId={workItemId} version={2} delivery={delivery} savedPhotoIds={["66666666-6666-4666-8666-666666666666"]} />);
  fireEvent.click(screen.getByRole("radio", { name: "Giao thiếu / không giao được" }));
  const quantity = screen.getByLabelText(/Xi măng · đã lấy 60 bao \(3\.000 kg\)/);
  expect(quantity).toHaveValue("60");
  expect(screen.getByLabelText("Ghi chú (không bắt buộc)")).not.toBeRequired();
  fireEvent.change(quantity, { target: { value: "58" } });
  fireEvent.click(screen.getByRole("button", { name: "Gửi báo cáo giao" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Tải lại công việc");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ lines: [{ deliveryLineId: cement.id, actualBaseQuantity: "2900" }],
    evidenceIds: ["66666666-6666-4666-8666-666666666666"] });
  expect(navigation.push).not.toHaveBeenCalled();
});

it("sends a failed delivery without a note", async () => {
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ resultId: "r2" }) });
  render(<DeliveryDoneForm workItemId={workItemId} version={2} delivery={delivery} />);
  fireEvent.click(screen.getByRole("radio", { name: "Giao thiếu / không giao được" }));
  fireEvent.change(screen.getByLabelText(/Xi măng · đã lấy/), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Gửi báo cáo giao" }));
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/work?notice=delivery-reported"));
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ lines: [{ deliveryLineId: cement.id, actualBaseQuantity: "0" }], note: "", evidenceIds: [] });
});
