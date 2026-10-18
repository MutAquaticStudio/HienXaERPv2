import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/modules/catalog/material-units-actions", () => ({ loadMaterialUnitsAction: m.load, saveMaterialUnitsAction: m.save }));
import { MaterialUnitsEditor } from "./material-units-editor";

const data = {
  material: { id: "m1", code: "BS40", name: "Xi măng Bút Sơn PCB40", baseUomId: "kg", baseSymbol: "kg" },
  units: [
    { conversionId: null, uomId: "kg", symbol: "kg", numerator: "1", denominator: "1", type: "BASE", sourceNote: null },
    { conversionId: "c-bao", uomId: "bao", symbol: "bao", numerator: "50.000000", denominator: "1.000000", type: "PACKAGING", sourceNote: null },
  ],
  prices: { kg: { currentVnd: "5800", target: { ruleId: "r-kg", version: 3 } }, bao: { currentVnd: null, target: null } },
  uomOptions: [{ id: "kg", symbol: "kg", name: "Kilôgam" }, { id: "bao", symbol: "bao", name: "Bao" }, { id: "tan", symbol: "tấn", name: "Tấn" }],
  costPerBaseVnd: "5000", can: { units: true, prices: true, readPrices: true }, today: "2026-10-16",
};
beforeEach(() => { vi.clearAllMocks(); m.load.mockResolvedValue(data); m.save.mockResolvedValue({ success: true, message: "Đã lưu đơn vị tính và giá." }); });
afterEach(cleanup);

it("adds a selling unit, splits a per-tonne price by the ratios and saves everything in one command", async () => {
  render(<MaterialUnitsEditor materialId="m1" />);
  const bao = (await screen.findByText("bao", { selector: "strong" })).closest("tr")!;
  expect(within(bao).getByText("1 bao = 50 kg")).toBeInTheDocument();
  expect(within(bao).getByText("1 kg = 0,02 bao")).toBeInTheDocument();
  expect(within(bao).getByText("250.000 ₫")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "+ Thêm đơn vị bán" }));
  fireEvent.change(screen.getByLabelText("Đơn vị mới 1"), { target: { value: "tan" } });
  fireEvent.change(screen.getByLabelText("Cách nhập quy đổi đơn vị mới 1"), { target: { value: "UNIT_TO_BASE" } });
  fireEvent.change(screen.getByLabelText("Số quy đổi đơn vị mới 1"), { target: { value: "1.000" } });
  expect(screen.getByText("Tức là 1 kg = 0,001 tấn")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Loại quy đổi đơn vị mới 1"), { target: { value: "EXACT" } });
  fireEvent.change(screen.getByLabelText("Giá bán 1 tấn"), { target: { value: "6.000.000" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Từ giá 1" }), { target: { value: "tan" } });
  fireEvent.click(screen.getByRole("button", { name: "Tính giá các đơn vị khác" }));
  expect(screen.getByLabelText("Giá bán 1 kg")).toHaveValue("6.000");
  expect(screen.getByLabelText("Giá bán 1 bao")).toHaveValue("300.000");

  fireEvent.change(screen.getByLabelText("Lý do thay đổi *"), { target: { value: "Bán theo tấn" } });
  fireEvent.click(screen.getByRole("button", { name: /Lưu đơn vị & giá \(4 thay đổi\)/ }));
  await waitFor(() => expect(m.save).toHaveBeenCalledOnce());
  expect(m.save.mock.calls[0][0]).toMatchObject({
    materialId: "m1", reason: "Bán theo tấn", effectiveDate: "2026-10-16", stopConversionIds: [],
    addUnits: [{ uomId: "tan", ratio: "1000", direction: "UNIT_TO_BASE", type: "EXACT", sourceNote: "" }],
    prices: [{ uomId: "kg", priceVnd: "6000", supersedesId: "r-kg", expectedVersion: 3 }, { uomId: "bao", priceVnd: "300000" }, { uomId: "tan", priceVnd: "6000000" }],
  });
  expect(await screen.findByRole("status")).toHaveTextContent("Đã lưu đơn vị tính và giá.");
  expect(m.load).toHaveBeenCalledTimes(2);
});

it("stops a unit instead of editing its ratio, and leaves its price out", async () => {
  render(<MaterialUnitsEditor materialId="m1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Ngừng đơn vị bao" }));
  expect(screen.queryByLabelText("Giá bán 1 bao")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Lý do thay đổi *"), { target: { value: "Ngừng bán bao" } });
  fireEvent.click(screen.getByRole("button", { name: /Lưu đơn vị & giá \(1 thay đổi\)/ }));
  await waitFor(() => expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ stopConversionIds: ["c-bao"], prices: [], addUnits: [] })));
});

it("is read-only without catalog or price rights", async () => {
  m.load.mockResolvedValue({ ...data, costPerBaseVnd: null, can: { units: false, prices: false, readPrices: true } });
  render(<MaterialUnitsEditor materialId="m1" />);
  expect(await screen.findByText("5.800 ₫")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByText("Giá vốn ≈")).not.toBeInTheDocument();
});

it("takes a new unit as 1 base unit = N new units (Owner 18/10: 1 tấn = 20 bao) and refuses one that does not divide", async () => {
  m.load.mockResolvedValue({ ...data, material: { ...data.material, baseUomId: "tan", baseSymbol: "tấn" },
    units: [{ conversionId: null, uomId: "tan", symbol: "tấn", numerator: "1", denominator: "1", type: "BASE", sourceNote: null }],
    prices: { tan: { currentVnd: "1600000", target: null } }, costPerBaseVnd: null });
  render(<MaterialUnitsEditor materialId="m1" />);
  fireEvent.click(await screen.findByRole("button", { name: "+ Thêm đơn vị bán" }));
  fireEvent.change(screen.getByLabelText("Đơn vị mới 1"), { target: { value: "bao" } });
  expect(screen.getByLabelText("Cách nhập quy đổi đơn vị mới 1")).toHaveValue("BASE_TO_UNIT");
  fireEvent.change(screen.getByLabelText("Số quy đổi đơn vị mới 1"), { target: { value: "3" } });
  expect(screen.getByRole("alert")).toHaveTextContent("1 tấn = 3 bao không chia hết");
  fireEvent.change(screen.getByLabelText("Số quy đổi đơn vị mới 1"), { target: { value: "20" } });
  expect(screen.getByText("Tức là 1 bao = 0,05 tấn")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Từ giá 1" }), { target: { value: "tan" } });
  fireEvent.click(screen.getByRole("button", { name: "Tính giá các đơn vị khác" }));
  expect(screen.getByLabelText("Giá bán 1 bao")).toHaveValue("80.000");
  fireEvent.change(screen.getByLabelText("Lý do thay đổi *"), { target: { value: "Bán theo bao" } });
  fireEvent.click(screen.getByRole("button", { name: /Lưu đơn vị & giá/ }));
  await waitFor(() => expect(m.save).toHaveBeenCalledOnce());
  expect(m.save.mock.calls[0][0]).toMatchObject({ addUnits: [{ uomId: "bao", ratio: "20", direction: "BASE_TO_UNIT", type: "PACKAGING" }],
    prices: [{ uomId: "bao", priceVnd: "80000" }] });
});
