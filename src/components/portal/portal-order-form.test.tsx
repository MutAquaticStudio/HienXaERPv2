import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ submit: vi.fn(), push: vi.fn() }));
vi.mock("@/modules/portal/order-actions", () => ({ submitPortalOrderAction: m.submit }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));
import { lineTotalVnd, PortalOrderForm, portalMaterials, switchVariant } from "./portal-order-form";
import type { PortalCatalog, PortalCatalogItem } from "@/modules/portal/types";

const base = { specification: null, decimal_scale: 0, in_stock: true, variant_group_id: null, variant_name: null, variant_label: null };
const item = (fields: Partial<PortalCatalogItem> & Pick<PortalCatalogItem, "material_id" | "code" | "name" | "uom_id" | "uom_symbol" | "unit_price_vnd">): PortalCatalogItem =>
  ({ ...base, group_name: "Xi măng", uom_name: fields.uom_symbol, base_symbol: "bao", conversion_numerator: "1", conversion_denominator: "1", ...fields });
const bs = { variant_group_id: "bs", variant_name: "Xi măng Bút Sơn" };
const catalog: PortalCatalog = {
  customer: { id: "11111111-1111-4111-8111-111111111111", code: "KH01", display_name: "Khách sỉ" },
  sites: [{ id: "22222222-2222-4222-8222-222222222222", name: "Công trình A", address_text: "1 Lê Lợi", receiver_name: "Anh Ba", receiver_phone: "0901" }],
  items: [
    // The catalog lists the biggest unit first; the editor starts lines in the base unit, like the internal form.
    item({ material_id: "x30", code: "BS30", name: "Xi măng Bút Sơn PCB30", uom_id: "tan", uom_symbol: "tấn", conversion_numerator: "20", unit_price_vnd: "1600000", ...bs, variant_label: "Mác: PCB30" }),
    item({ material_id: "x30", code: "BS30", name: "Xi măng Bút Sơn PCB30", uom_id: "bao", uom_symbol: "bao", unit_price_vnd: "80000", ...bs, variant_label: "Mác: PCB30" }),
    item({ material_id: "x40", code: "BS40", name: "Xi măng Bút Sơn PCB40", uom_id: "bao", uom_symbol: "bao", unit_price_vnd: "90000", ...bs, variant_label: "Mác: PCB40", in_stock: false }),
    item({ material_id: "g1", code: "GA", name: "Gạch đỏ", group_name: "Gạch", uom_id: "vien", uom_symbol: "viên", base_symbol: "viên", unit_price_vnd: "1300" }),
  ],
};
const operation = "33333333-3333-4333-8333-333333333333";
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const review = () => screen.getByRole("button", { name: /Xem & gửi đơn/ });
const footer = () => screen.getByRole("group", { name: "Tổng tiền và gửi đơn" });

it("rounds line totals like the stored order", () => {
  expect(lineTotalVnd("2.5", "85000")).toBe(212500n);
  expect(lineTotalVnd("0.333333", "1000")).toBe(333n);
  expect(lineTotalVnd("abc", "1000")).toBe(0n);
});

it("turns the catalog into the shared editor's materials: priced units, base unit first, variants named", () => {
  const materials = portalMaterials(catalog.items);
  expect(materials.map((material) => material.id)).toEqual(["x30", "x40", "g1"]);
  expect(materials[0].uoms.map((uom) => uom.symbol)).toEqual(["bao", "tấn"]);
  expect(materials[0].variant).toEqual({ groupId: "bs", name: "Xi măng Bút Sơn", label: "Mác: PCB30" });
  expect(materials[2].variant).toBeUndefined();
  // Switching variant keeps the unit when the other variant is sold in it, else takes its first unit.
  const line = { key: 1, sourceLineId: "", materialId: "x30", uomId: "bao", quantity: "3", manualPriceVnd: "", manualReason: "" };
  expect(switchVariant(line, materials, "x40")).toMatchObject({ materialId: "x40", uomId: "bao", quantity: "3" });
  expect(switchVariant({ ...line, uomId: "tan" }, materials, "x40")).toMatchObject({ materialId: "x40", uomId: "bao" });
});

it("shows a card per product with this customer's price, group chips, search and a stock flag", () => {
  render(<PortalOrderForm catalog={catalog} operationId={operation} />);
  const list = screen.getByRole("list", { name: "Hàng của bạn" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  expect(within(list).getByText("Xi măng Bút Sơn PCB30").closest("li")).toHaveTextContent(/Mác: PCB30.*80\.000.*\/ bao/);
  expect(within(list).getByText("Xi măng Bút Sơn PCB40").closest("li")).toHaveTextContent(/Đặt trước/);
  fireEvent.click(screen.getByRole("button", { name: "Gạch" }));
  expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Tất cả" }));
  fireEvent.change(screen.getByPlaceholderText(/Tìm xi măng/), { target: { value: "pcb40" } });
  expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  expect(review()).toBeDisabled();
});

it("adds with Thêm, steps − / +, switches unit and totals at this customer's prices", () => {
  render(<PortalOrderForm catalog={catalog} operationId={operation} />);
  fireEvent.click(screen.getByRole("button", { name: "Thêm Xi măng Bút Sơn PCB30" }));
  fireEvent.click(screen.getByRole("button", { name: "Thêm 1 Xi măng Bút Sơn PCB30" }));
  expect(screen.getByLabelText("Số lượng Xi măng Bút Sơn PCB30")).toHaveValue("2");
  expect(within(footer()).getByText(/160\.000/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "tấn" }));
  expect(within(footer()).getByText(/3\.200\.000/)).toBeInTheDocument();
  expect(screen.getByText("1 tấn = 20 bao")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Số lượng Xi măng Bút Sơn PCB30"), { target: { value: "1,5" } });
  expect(within(footer()).getByText(/2\.400\.000/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Số lượng Xi măng Bút Sơn PCB30"), { target: { value: "abc" } });
  expect(review()).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Số lượng Xi măng Bút Sơn PCB30"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Bớt 1 Xi măng Bút Sơn PCB30" }));
  expect(screen.queryByLabelText("Số lượng Xi măng Bút Sơn PCB30")).toBeNull();
  expect(screen.getByRole("button", { name: "Thêm Xi măng Bút Sơn PCB30" })).toBeInTheDocument();
});

it("sends the order once reviewed and keeps the operation for an unknown result", async () => {
  m.submit.mockResolvedValueOnce({ status: "UNKNOWN", message: "Chưa rõ" }).mockResolvedValueOnce({ status: "SUCCESS", message: "ok", resultId: "o1" });
  render(<PortalOrderForm catalog={catalog} operationId={operation} />);
  fireEvent.click(screen.getByRole("button", { name: "Thêm Gạch đỏ" }));
  fireEvent.change(screen.getByLabelText("Số lượng Gạch đỏ"), { target: { value: "500" } });
  fireEvent.change(screen.getByLabelText("Ghi chú cho cửa hàng"), { target: { value: "Giao sáng" } });
  expect(screen.getByText(/1 Lê Lợi · Người nhận: Anh Ba · 0901/)).toBeInTheDocument();
  fireEvent.click(review());
  const dialog = screen.getByRole("dialog", { name: "Xem lại đơn" });
  expect(within(dialog).getByText("Công trình A — 1 Lê Lợi")).toBeInTheDocument();
  expect(within(dialog).getByText("Sớm nhất có thể")).toBeInTheDocument();
  expect(within(dialog).getAllByText(/650\.000/).length).toBeGreaterThan(0);
  fireEvent.click(within(dialog).getByRole("button", { name: "Gửi đơn" }));
  await within(dialog).findByText("Chưa rõ");
  fireEvent.click(within(dialog).getByRole("button", { name: "Gửi đơn" }));
  await waitFor(() => expect(m.push).toHaveBeenCalledWith("/customer/orders/o1?notice=submitted"));
  expect(m.submit.mock.calls.map((call) => call[0].operationId)).toEqual([operation, operation]);
  expect(m.submit.mock.calls[0][0]).toMatchObject({ siteId: "22222222-2222-4222-8222-222222222222", newSite: null, note: "Giao sáng",
    lines: [{ materialId: "g1", uomId: "vien", quantity: "500" }] });
});

it("asks for a new address when there is no site and tells the customer when nothing is offered", () => {
  render(<PortalOrderForm catalog={{ ...catalog, sites: [] }} operationId={operation} />);
  fireEvent.click(screen.getByRole("button", { name: "Thêm Gạch đỏ" }));
  expect(screen.getByLabelText("Công trình / điểm giao")).toHaveValue("new");
  expect(review()).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Tên công trình / nơi nhận"), { target: { value: "Nhà mới" } });
  fireEvent.change(screen.getByLabelText("Địa chỉ"), { target: { value: "9 Nguyễn Trãi" } });
  expect(review()).toBeEnabled();
  cleanup();
  render(<PortalOrderForm catalog={{ ...catalog, items: [] }} operationId={operation} />);
  expect(screen.getByText(/chưa mở bán mặt hàng nào/)).toBeInTheDocument();
});
