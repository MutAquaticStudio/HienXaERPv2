import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./editor", () => ({
  PricingRuleEditor: ({ rule, purchaseRule, command }: { rule?: { id: string }; purchaseRule?: { id: string }; command: { operationId: string } }) =>
    <p>Biểu mẫu giá {rule?.id ?? purchaseRule?.id ?? "mới"} {command.operationId ? "có mã thao tác" : ""}</p>,
}));
import { PricingRuleList, type PriceRuleRow } from "./rule-list";

afterEach(cleanup);
const row: PriceRuleRow = { id: "r1", party: "Giá chung", target: "Xi măng PCB40", uom: "bao", price: "95.000 ₫", source: "Bảng giá", period: "Từ 10/10/2026",
  version: 2, state: "Đang hiệu lực", stateTone: "success", editable: true, scopeLabel: "Giá mặc định · Xi măng PCB40 · bao",
  rule: { id: "r1" } as PriceRuleRow["rule"] };
const options = { customers: [], groups: [], materials: [], units: [] };

it("lists price versions and changes one in a popup", () => {
  render(<PricingRuleList rows={[row, { ...row, id: "r0", version: 1, state: "Đã ngừng", stateTone: "danger", editable: false }]} options={options} canManage partyLabel="Áp dụng cho" createLabel="+ Tạo chính sách giá" />);
  expect(screen.getByRole("heading", { name: "2 phiên bản giá" })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /Đổi giá/ })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Đổi giá Giá mặc định · Xi măng PCB40 · bao" }));
  const dialog = screen.getByRole("dialog", { name: "Giá mặc định · Xi măng PCB40 · bao" });
  expect(within(dialog).getByText(/Biểu mẫu giá r1 có mã thao tác/)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Đóng" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Tạo chính sách giá" }));
  expect(screen.getByRole("dialog", { name: "Tạo chính sách giá" })).toHaveTextContent("Biểu mẫu giá mới");
});

it("is read-only without the manage right", () => {
  render(<PricingRuleList purchase rows={[row]} options={options} canManage={false} partyLabel="Nhà cung cấp" createLabel="+ Tạo giá mua" />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByText("Giá mua")).toBeInTheDocument();
});
