import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { vi } from "vitest";

const m = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown }, links: { data: [] as unknown[], error: null as unknown },
  handoff: { data: null as unknown, error: null as unknown }, loaded: { data: [] as unknown[], error: null as unknown },
  internal: { data: null as unknown, error: null as unknown }, deliveries: { data: [] as unknown[], error: null as unknown } }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ from: (table: string) => {
  const query = { select: () => query, limit: () => query, in: () => query,
    order: () => table === "deliveries" ? Promise.resolve(m.deliveries) : query,
    maybeSingle: async () => table === "delivery_handoffs" ? m.handoff : table === "evidence_objects" ? m.internal : m.result,
    eq: () => table === "work_result_portal_evidence" ? Promise.resolve(m.links)
      : table === "delivery_handoff_portal_evidence" ? Promise.resolve(m.loaded) : query };
  return query;
} }) }));
import { DeliveryPhotos, OrderDeliveryPhotos } from "./delivery-photos";

beforeEach(() => {
  m.result = { data: { source_work_item_result_id: "wr1", submitted_at: "2026-10-18T03:30:00Z", receiver_name: "Anh Nhận" }, error: null };
  m.links = { data: [{ evidence_id: "p1", portal_evidence_objects: { mime_type: "image/jpeg" } }, { evidence_id: "p2", portal_evidence_objects: [{ mime_type: "application/pdf" }] }], error: null };
  m.handoff = { data: null, error: null };
  m.loaded = { data: [], error: null };
  m.internal = { data: null, error: null };
  m.deliveries = { data: [], error: null };
});
afterEach(cleanup);

it("shows the worker's photos as a grid and one large on tap", async () => {
  render(await DeliveryPhotos({ deliveryId: "d1", canView: true, canViewInternal: true }));
  expect(screen.getByText("2 ảnh")).toBeInTheDocument();
  expect(screen.getByText(/Gửi lúc 18\/10\/2026 10:30 · người nhận Anh Nhận/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Tệp PDF 2" })).toHaveAttribute("href", "/api/evidence/p2/download");
  fireEvent.click(screen.getByRole("button", { name: "Xem ảnh 1" }));
  expect(screen.getByRole("dialog", { name: "Ảnh 1 / 2" })).toBeInTheDocument();
});

it("tells someone without the right only how many photos there are", async () => {
  render(await DeliveryPhotos({ deliveryId: "d1", canView: false, canViewInternal: false }));
  expect(screen.getByText("Cần quyền xác minh giao hàng để xem ảnh.")).toBeInTheDocument();
  expect(document.querySelector("img")).toBeNull();
});

it("shows the loaded-truck photos next to the delivered ones (FB7)", async () => {
  m.handoff = { data: { id: "h1", handed_off_at: "2026-10-18T02:00:00Z" }, error: null };
  m.loaded = { data: [{ evidence_id: "l1", portal_evidence_objects: { mime_type: "image/jpeg" } }], error: null };
  render(await DeliveryPhotos({ deliveryId: "d1", canView: true, canViewInternal: true }));
  expect(screen.getByText("3 ảnh")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Lấy hàng lên xe" })).toBeInTheDocument();
  expect(screen.getByText(/Chụp lúc 18\/10\/2026 09:00/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Đã giao" })).toBeInTheDocument();
});

it("shows nothing for a delivery without a worker report", async () => {
  m.result = { data: null, error: null };
  const { container } = render(<>{await DeliveryPhotos({ deliveryId: "d1", canView: true, canViewInternal: true })}</>);
  expect(container).toBeEmptyDOMElement();
});

it("shows the photo uploaded in the office with the result, e.g. \"NCC đã giao\" (FB11)", async () => {
  m.result = { data: { source_work_item_result_id: null, evidence_object_id: "e1", submitted_at: "2026-10-18T03:30:00Z", receiver_name: null }, error: null };
  m.internal = { data: { id: "e1", object_path: "b/d/x-ncc.jpg" }, error: null };
  render(await DeliveryPhotos({ deliveryId: "d1", canView: true, canViewInternal: true }));
  expect(screen.getByText("1 ảnh")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Xem ảnh 1" }).querySelector("img")).toHaveAttribute("src", "/api/evidence/internal/e1");
});

it("leaves the office file out for someone who cannot open internal evidence", async () => {
  m.result = { data: { source_work_item_result_id: null, evidence_object_id: "e1", submitted_at: "2026-10-18T03:30:00Z", receiver_name: null }, error: null };
  m.internal = { data: { id: "e1", object_path: "b/d/x-ncc.jpg" }, error: null };
  const { container } = render(<>{await DeliveryPhotos({ deliveryId: "d1", canView: true, canViewInternal: false })}</>);
  expect(container).toBeEmptyDOMElement();
});

it("groups the photos of an order by delivery (FB11)", async () => {
  m.deliveries = { data: [{ id: "d1", delivery_number: "DL-2026-000001", execution_state: "VERIFIED" }], error: null };
  render(await OrderDeliveryPhotos({ orderId: "o1", canView: true, canViewInternal: true }));
  expect(screen.getByRole("heading", { name: "Ảnh giao hàng" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "DL-2026-000001" })).toHaveAttribute("href", "/admin/deliveries/d1");
  expect(screen.getByText("2 ảnh")).toBeInTheDocument();
});

it("shows nothing on an order whose deliveries have no photos", async () => {
  m.deliveries = { data: [{ id: "d1", delivery_number: "DL-2026-000001", execution_state: "DISPATCHED" }], error: null };
  m.result = { data: null, error: null };
  const { container } = render(<>{await OrderDeliveryPhotos({ orderId: "o1", canView: true, canViewInternal: true })}</>);
  expect(container).toBeEmptyDOMElement();
});
