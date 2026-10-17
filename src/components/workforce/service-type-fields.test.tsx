import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/modules/catalog/catalog-dialog", () => ({
  CatalogDialog: ({ kind, onSaved }: { kind: string; onSaved: (saved: { id: string; message: string }) => void }) =>
    <div role="dialog" aria-label={`Thêm ${kind}`}><button type="button" onClick={() => onSaved({ id: "new-type", message: "Đã lưu và ghi lịch sử thay đổi." })}>Lưu thử</button></div>,
}));

import { ServiceTypeFields, type ServiceTypeOption } from "./service-type-fields";

const types: ServiceTypeOption[] = [
  { id: "trip", code: "XE-CHUYEN", name: "Xe chở hàng", unit_label: "chuyến", default_price_vnd: "450000", resource_kind: "VEHICLE" },
  { id: "digger", code: "MAY-XUC", name: "Máy xúc", unit_label: "giờ", default_price_vnd: "800000", resource_kind: "MACHINE" },
  { id: "labour", code: "BOC-XEP", name: "Bốc xếp", unit_label: "công", default_price_vnd: null, resource_kind: "NONE" },
];
const view = (list = types) => render(<form><ServiceTypeFields types={list} scope="scope" vehicleField={<label>Xe<select name="vehicleId" /></label>} machineField={<label>Máy<select name="machineId" /></label>} /></form>);

afterEach(cleanup);

describe("ServiceTypeFields", () => {
  it("lists the catalogue with unit and price, and shows only the resource the type needs", () => {
    view();
    const select = screen.getByLabelText("Loại dịch vụ");
    expect(screen.getByRole("option", { name: "Xe chở hàng · 450.000 ₫/chuyến" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bốc xếp · đơn giá nhập khi xác minh" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Xe")).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: "trip" } });
    expect(screen.getByLabelText("Sản lượng kế hoạch (chuyến)")).toBeInTheDocument();
    expect(screen.getByLabelText("Xe")).toBeInTheDocument();
    expect(screen.queryByLabelText("Máy")).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: "digger" } });
    expect(screen.getByLabelText("Máy")).toBeInTheDocument();
    expect(screen.queryByLabelText("Xe")).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: "labour" } });
    expect(screen.queryByLabelText("Máy")).not.toBeInTheDocument();
    expect(screen.getByText("Tính theo công · đơn giá nhập khi xác minh")).toBeInTheDocument();
  });

  it("adds a type in a popup, selects it and reloads the list", () => {
    view([]);
    expect(screen.getByRole("option", { name: "Chưa có loại dịch vụ" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ Thêm loại" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu thử" }));
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Đã lưu");
  });
});
