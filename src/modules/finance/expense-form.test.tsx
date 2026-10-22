import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));

import type { CommandOutcome } from "@/lib/core/command-outcome";
import { OperatingExpenseForm } from "./expense-form";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const accounts = [{ id: "bank", kind: "BANK", label: "Vietcombank (ngân hàng)" }, { id: "cash", kind: "CASH", label: "Két (tiền mặt)" }];
function setup(results: CommandOutcome[], canPay = true) {
  const sent: Record<string, string>[] = [];
  const action = vi.fn(async (form: FormData) => {
    sent.push(Object.fromEntries([...form].map(([key, value]) => [key, String(value)])));
    return results[sent.length - 1] ?? results[results.length - 1];
  });
  render(<OperatingExpenseForm action={action} canPay={canPay} now="2026-10-22T09:00" accounts={accounts} types={["Điện nước"]}
    suppliers={[{ id: "s1", label: "NCC01 · Nhà xe Minh" }]} employees={[{ id: "e1", label: "Thợ 01 (NV01)" }]} orders={[]} />);
  return { action, sent };
}
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

it("records an expense paid now to anyone, from the cash account by default", async () => {
  const { sent } = setup([{ status: "SUCCESS", resultId: "x", message: "Đã ghi chi phí và phiếu chi trong Sổ quỹ." }]);
  expect(screen.queryByLabelText("Nhà cung cấp nhận tiền")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Chi từ quỹ")).toHaveValue("cash");
  type("Loại chi", "Marketing");
  type("Số tiền", "2.000.000");
  type("Tên người nhận (không bắt buộc)", "Công ty quảng cáo ABC");
  fireEvent.click(screen.getByRole("button", { name: "Ghi chi phí" }));
  await screen.findByText("Đã ghi chi phí và phiếu chi trong Sổ quỹ.");
  expect(sent[0]).toMatchObject({ categoryName: "Marketing", amount: "2000000", payeeKind: "OTHER", payeeName: "Công ty quảng cáo ABC",
    settlement: "PAID_NOW", accountId: "cash", countsInProfit: "on", effectiveAt: "2026-10-22T09:00" });
  expect(screen.getByLabelText("Loại chi")).toHaveValue("");
  expect(m.refresh).toHaveBeenCalled();
});

it("owes a supplier without choosing an account, and keeps a truck out of profit", async () => {
  const { sent } = setup([{ status: "SUCCESS", resultId: "x", message: "Đã ghi chi phí vào công nợ nhà cung cấp." }]);
  fireEvent.click(screen.getByRole("radio", { name: "Nhà cung cấp" }));
  fireEvent.click(screen.getByRole("radio", { name: "Ghi nợ nhà cung cấp" }));
  expect(screen.queryByLabelText("Chi từ quỹ")).not.toBeInTheDocument();
  type("Loại chi", "Mua tài sản/xe");
  type("Số tiền", "300000000");
  type("Nhà cung cấp nhận tiền", "s1");
  fireEvent.click(screen.getByLabelText("Tính vào lợi nhuận"));
  fireEvent.click(screen.getByRole("button", { name: "Ghi chi phí" }));
  await screen.findByText("Đã ghi chi phí vào công nợ nhà cung cấp.");
  expect(sent[0]).toMatchObject({ payeeKind: "SUPPLIER", supplierId: "s1", settlement: "PAYABLE" });
  expect(sent[0]).not.toHaveProperty("accountId");
  expect(sent[0]).not.toHaveProperty("countsInProfit");
});

it("keeps what was typed on a refusal, marks the field and sends a new operation next time", async () => {
  const { sent } = setup([{ status: "FAILED", message: "Chọn nhân viên nhận tiền.", field: "employeeId" }, { status: "SUCCESS", resultId: "x", message: "Đã ghi." }]);
  fireEvent.click(screen.getByRole("radio", { name: "Nhân viên" }));
  type("Loại chi", "Lương thưởng");
  type("Số tiền", "7000000");
  fireEvent.click(screen.getByRole("button", { name: "Ghi chi phí" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Chọn nhân viên nhận tiền.");
  await waitFor(() => expect(screen.getByLabelText("Nhân viên nhận tiền")).toHaveFocus());
  expect(screen.getByLabelText("Nhân viên nhận tiền")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("Loại chi")).toHaveValue("Lương thưởng");
  expect(screen.queryByRole("button", { name: /Bắt đầu thao tác mới/ })).not.toBeInTheDocument();
  type("Nhân viên nhận tiền", "e1");
  fireEvent.click(screen.getByRole("button", { name: "Ghi chi phí" }));
  await screen.findByText("Đã ghi.");
  expect(sent[1].operationId).not.toBe(sent[0].operationId);
  expect(sent[1]).toMatchObject({ payeeKind: "EMPLOYEE", employeeId: "e1" });
});

it("sends the same operation again after an unclear answer", async () => {
  const { sent } = setup([{ status: "UNKNOWN", message: "Chưa rõ đã ghi được chưa." }, { status: "SUCCESS", resultId: "x", message: "Đã ghi." }]);
  type("Loại chi", "Điện nước");
  type("Số tiền", "500000");
  fireEvent.click(screen.getByRole("button", { name: "Ghi chi phí" }));
  await screen.findByText("Chưa rõ đã ghi được chưa.");
  fireEvent.click(screen.getByRole("button", { name: "Ghi chi phí" }));
  await screen.findByText("Đã ghi.");
  expect(sent[1].operationId).toBe(sent[0].operationId);
});

it("without the right to pay from a fund, only a supplier debt can be recorded", () => {
  setup([], false);
  expect(screen.getByRole("button", { name: "Ghi chi phí" })).toBeDisabled();
  expect(screen.getByRole("note")).toHaveTextContent("chưa có quyền chi tiền");
  fireEvent.click(screen.getByRole("radio", { name: "Nhà cung cấp" }));
  expect(screen.getByRole("radio", { name: "Đã trả ngay" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Ghi nợ nhà cung cấp" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Ghi chi phí" })).toBeEnabled();
});
