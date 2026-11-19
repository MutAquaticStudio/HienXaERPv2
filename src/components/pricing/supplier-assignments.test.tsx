import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SupplierAssignments } from "./supplier-assignments";

const m = vi.hoisted(() => ({ assign: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/modules/pricing/purchase-book-actions", () => ({ setSupplierMaterialsAction: m.assign }));

const suppliers = [{ id: "pt", name: "Phú Thành" }, { id: "an", name: "An Phát" }];
const units = [{ id: "kg", symbol: "kg" }, { id: "bao", symbol: "bao" }];
beforeEach(() => { vi.clearAllMocks(); m.assign.mockResolvedValue({ success: true, message: "Đã gán 1, bỏ gán 1." }); });
afterEach(cleanup);

it("adds a supplier in the unit the others buy in and saves assignments with unassignments (D61)", async () => {
  render(<SupplierAssignments materialId="xm" canManage suppliers={suppliers} units={units}
    rows={[{ supplierId: "pt", supplierName: "Phú Thành", uomId: "bao", currentVnd: "80000", since: "30/10/2026", cheapest: false }]} />);
  fireEvent.change(screen.getByLabelText("Gán nhà cung cấp"), { target: { value: "an" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Gán nhà cung cấp" }));
  expect(screen.getByLabelText("Đơn vị mua của An Phát")).toHaveValue("bao");
  fireEvent.click(screen.getByRole("button", { name: "Bỏ gán Phú Thành" }));
  fireEvent.click(screen.getByRole("button", { name: "Lưu nhà cung cấp" }));
  await waitFor(() => expect(m.assign).toHaveBeenCalledTimes(1));
  expect(m.assign.mock.calls[0][0].items).toEqual([
    { supplierId: "an", materialId: "xm", uomId: "bao", active: true },
    { supplierId: "pt", materialId: "xm", active: false },
  ]);
  expect(await screen.findByText("Đã gán 1, bỏ gán 1.")).toBeInTheDocument();
  expect(m.refresh).toHaveBeenCalled();
});

it("shows assignments read-only without the manage permission", () => {
  render(<SupplierAssignments materialId="xm" canManage={false} suppliers={suppliers} units={units}
    rows={[{ supplierId: "pt", supplierName: "Phú Thành", uomId: "bao", currentVnd: null, since: null, cheapest: false }]} />);
  expect(screen.getByText("bao")).toBeInTheDocument();
  expect(screen.getByText("Chưa có giá")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Lưu nhà cung cấp" })).not.toBeInTheDocument();
});
