import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/modules/catalog/variant-actions", () => ({ loadVariantGroupAction: m.load, saveVariantGroupAction: m.save }));
import { VariantGroupEditor } from "./variant-group-editor";

const options = {
  materialGroups: [{ id: "mg-xm", name: "Xi măng" }],
  uoms: [{ id: "kg", symbol: "kg", name: "Kilôgam" }, { id: "bao", symbol: "bao", name: "Bao" }, { id: "tan", symbol: "tấn", name: "Tấn" }],
  attachable: [{ id: "m-old", code: "XM_CU", name: "Xi măng cũ" }],
};
const fresh = { group: null, members: [], template: null, options, can: { prices: true }, today: "2026-10-16" };
const existing = {
  group: { id: "g-bs", name: "Xi măng Bút Sơn", attributeNames: ["Mác"], active: true },
  members: [{ id: "m30", code: "BS30", name: "Xi măng Bút Sơn PCB30", attributes: { Mác: "PCB30" }, active: true }],
  template: { groupId: "mg-xm", baseUomId: "kg", specification: "", saleEnabled: true, purchaseEnabled: true,
    units: [{ uomId: "bao", numerator: "50.000000", denominator: "1.000000", type: "PACKAGING" as const, sourceNote: "" }] },
  options, can: { prices: true }, today: "2026-10-16",
};
beforeEach(() => { vi.clearAllMocks(); m.save.mockResolvedValue({ success: true, groupId: "g", message: "Đã lưu." }); });
afterEach(cleanup);

it("creates one variant per typed value with suggested codes, the shared unit and split prices", async () => {
  m.load.mockResolvedValue(fresh);
  const saved = vi.fn();
  render(<VariantGroupEditor groupId={null} onSaved={saved} />);
  fireEvent.change(await screen.findByLabelText("Tên hàng chung *"), { target: { value: "Xi măng Bút Sơn" } });
  fireEvent.change(screen.getByLabelText("Nhóm vật tư *"), { target: { value: "mg-xm" } });
  fireEvent.change(screen.getByLabelText("Đơn vị cơ sở (tồn kho) *"), { target: { value: "kg" } });
  fireEvent.change(screen.getByLabelText("Tên thuộc tính 1"), { target: { value: "Mác" } });
  fireEvent.change(screen.getByLabelText("Giá trị"), { target: { value: "PCB30, PCB40" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Thêm đơn vị bán" }));
  fireEvent.change(screen.getByLabelText("Đơn vị bán 1"), { target: { value: "bao" } });
  fireEvent.change(screen.getByLabelText("Cách nhập quy đổi đơn vị bán 1"), { target: { value: "UNIT_TO_BASE" } });
  fireEvent.change(screen.getByLabelText("Số quy đổi đơn vị bán 1"), { target: { value: "50" } });
  expect(screen.getByText("Tức là 1 kg = 0,02 bao")).toBeInTheDocument();

  expect(screen.getByLabelText("Mã loại PCB30")).toHaveValue("XMBS-PCB30");
  expect(screen.getByLabelText("Tên loại PCB40")).toHaveValue("Xi măng Bút Sơn PCB40");
  fireEvent.change(screen.getByLabelText("Mã loại PCB30"), { target: { value: "bs30" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Nhập giá theo" }), { target: { value: "bao" } });
  fireEvent.change(screen.getByLabelText("Giá bán loại PCB30"), { target: { value: "90.000" } });
  expect(screen.getByText("kg 1.800 ₫")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Lý do thay đổi *"), { target: { value: "Thêm xi măng Bút Sơn" } });
  fireEvent.click(screen.getByRole("button", { name: "Tạo 2 loại" }));

  await waitFor(() => expect(m.save).toHaveBeenCalledOnce());
  expect(m.save.mock.calls[0][0]).toMatchObject({
    expected: null, group: { name: "Xi măng Bút Sơn", attributeNames: ["Mác"], active: true },
    template: { groupId: "mg-xm", baseUomId: "kg", units: [{ uomId: "bao", numerator: "50", denominator: "1", type: "PACKAGING" }] },
    variants: [
      { attributes: { Mác: "PCB30" }, code: "BS30", name: "Xi măng Bút Sơn PCB30", prices: [{ uomId: "kg", priceVnd: "1800" }, { uomId: "bao", priceVnd: "90000" }] },
      { attributes: { Mác: "PCB40" }, code: "XMBS-PCB40", name: "Xi măng Bút Sơn PCB40", prices: [] },
    ],
  });
  expect(saved).toHaveBeenCalled();
});

it("adds only new values to an existing product, re-labels, detaches and attaches members", async () => {
  m.load.mockResolvedValue(existing);
  render(<VariantGroupEditor groupId="g-bs" onSaved={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText("Thêm giá trị"), { target: { value: "PCB30, PCB50" } });
  expect(screen.queryByLabelText("Mã loại PCB30")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Mã loại PCB50")).toHaveValue("XMBS-PCB50");
  expect(screen.getByLabelText("Cách nhập quy đổi đơn vị bán 1")).toHaveValue("UNIT_TO_BASE");
  expect(screen.getByLabelText("Số quy đổi đơn vị bán 1")).toHaveValue("50");

  fireEvent.change(screen.getByLabelText("Thêm giá trị"), { target: { value: "PCB50" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Thêm vật tư có sẵn vào hàng này" }), { target: { value: "m-old" } });
  const attached = screen.getByText("XM_CU").closest("tr")!;
  fireEvent.change(within(attached).getByLabelText("Mác của XM_CU"), { target: { value: "Cũ" } });
  fireEvent.click(screen.getByRole("button", { name: "Bỏ khỏi hàng BS30" }));
  fireEvent.change(screen.getByLabelText("Lý do thay đổi *"), { target: { value: "Sắp xếp lại" } });
  fireEvent.click(screen.getByRole("button", { name: /Lưu hàng cùng loại \(3 thay đổi\)/ }));

  await waitFor(() => expect(m.save).toHaveBeenCalledOnce());
  expect(m.save.mock.calls[0][0]).toMatchObject({
    expected: { name: "Xi măng Bút Sơn", attribute_names: ["Mác"], active: true },
    template: { units: [{ uomId: "bao", numerator: "50", denominator: "1" }] },
    variants: [{ materialId: "m30", detach: true }, { materialId: "m-old", attributes: { Mác: "Cũ" } }, { attributes: { Mác: "PCB50" }, code: "XMBS-PCB50" }],
  });
});

it("explains what is missing instead of saving", async () => {
  m.load.mockResolvedValue(fresh);
  render(<VariantGroupEditor groupId={null} onSaved={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText("Tên thuộc tính 1"), { target: { value: "Mác" } });
  fireEvent.change(screen.getByLabelText("Giá trị"), { target: { value: "PCB30" } });
  fireEvent.change(screen.getByLabelText("Lý do thay đổi *"), { target: { value: "Thử" } });
  expect(screen.getByRole("status")).toHaveTextContent("Nhập tên hàng chung");
  expect(screen.getByRole("status")).toHaveTextContent("Chọn nhóm vật tư và đơn vị cơ sở");
  expect(screen.getByRole("button", { name: "Tạo 1 loại" })).toBeDisabled();
});

it("takes the selling units as 1 base unit = N units (Owner 18/10: base tấn, 1 tấn = 20 bao, 1 tấn = 1.000 kg)", async () => {
  m.load.mockResolvedValue(fresh);
  render(<VariantGroupEditor groupId={null} onSaved={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText("Tên hàng chung *"), { target: { value: "Xi măng Bút Sơn" } });
  fireEvent.change(screen.getByLabelText("Nhóm vật tư *"), { target: { value: "mg-xm" } });
  fireEvent.change(screen.getByLabelText("Đơn vị cơ sở (tồn kho) *"), { target: { value: "tan" } });
  fireEvent.change(screen.getByLabelText("Tên thuộc tính 1"), { target: { value: "Mác" } });
  fireEvent.change(screen.getByLabelText("Giá trị"), { target: { value: "PCB30" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Thêm đơn vị bán" }));
  fireEvent.change(screen.getByLabelText("Đơn vị bán 1"), { target: { value: "bao" } });
  expect(screen.getByLabelText("Cách nhập quy đổi đơn vị bán 1")).toHaveValue("BASE_TO_UNIT");
  fireEvent.change(screen.getByLabelText("Số quy đổi đơn vị bán 1"), { target: { value: "3" } });
  expect(screen.getByRole("alert")).toHaveTextContent("1 tấn = 3 bao không chia hết");
  fireEvent.change(screen.getByLabelText("Số quy đổi đơn vị bán 1"), { target: { value: "20" } });
  expect(screen.getByText("Tức là 1 bao = 0,05 tấn")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "+ Thêm đơn vị bán" }));
  fireEvent.change(screen.getByLabelText("Đơn vị bán 2"), { target: { value: "kg" } });
  fireEvent.change(screen.getByLabelText("Số quy đổi đơn vị bán 2"), { target: { value: "1.000" } });
  fireEvent.change(screen.getByLabelText("Giá bán loại PCB30"), { target: { value: "1.600.000" } });
  expect(screen.getByText("bao 80.000 ₫ · kg 1.600 ₫")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Lý do thay đổi *"), { target: { value: "Thêm xi măng theo tấn" } });
  fireEvent.click(screen.getByRole("button", { name: "Tạo 1 loại" }));
  await waitFor(() => expect(m.save).toHaveBeenCalledOnce());
  expect(m.save.mock.calls[0][0].template.units).toEqual([
    { uomId: "bao", numerator: "1", denominator: "20", type: "PACKAGING", sourceNote: "" },
    { uomId: "kg", numerator: "1", denominator: "1000", type: "PACKAGING", sourceNote: "" },
  ]);
});
