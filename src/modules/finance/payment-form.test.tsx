import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/modules/finance/actions", () => ({ submitPaymentWithOutcomeAction: vi.fn() }));
vi.mock("@/components/reliable-command-form", () => ({ ReliableCommandForm: ({ children }: { children: React.ReactNode }) => <form>{children}</form> }));
import { autoAllocate, PaymentForm, type PaymentTarget } from "./payment-form";

const debts: PaymentTarget[] = [
  { id: "new", sourceLabel: "Đơn ĐB-0002", dueDate: "2026-10-20", outstandingAmountVnd: "500000" },
  { id: "old", sourceLabel: "Đơn ĐB-0001", dueDate: "2026-10-01", outstandingAmountVnd: "300000" },
];

it("pays the oldest debt first (FB10)", () => {
  expect(autoAllocate(400000n, debts)).toEqual({ old: "300000", new: "100000" });
  expect(autoAllocate(1000000n, debts)).toEqual({ old: "300000", new: "500000" });
});

it("fills the allocation from the amount and asks before keeping money as an advance", () => {
  render(<PaymentForm direction="RECEIPT" partyId="c" partyName="Khách A" accounts={[{ id: "a", name: "Tiền mặt", code: "TM" }]} obligations={debts}
    defaultEffectiveAt="2026-10-24T09:00" redirectTo="/admin/receivables?customer=c" operationId="o" actorScope="s" />);
  fireEvent.change(screen.getByLabelText(/Số tiền nhận/), { target: { value: "400.000" } });
  expect(screen.getByLabelText("Phân bổ cho Đơn ĐB-0001")).toHaveValue("300.000");
  expect(screen.getByLabelText("Phân bổ cho Đơn ĐB-0002")).toHaveValue("100.000");
  expect(screen.getByRole("button", { name: "Ghi nhận thu tiền" })).toBeEnabled();
  fireEvent.change(screen.getByLabelText(/Số tiền nhận/), { target: { value: "900.000" } });
  expect(screen.getByRole("button", { name: "Ghi nhận thu tiền" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/tiền khách ứng trước/));
  expect(screen.getByRole("button", { name: "Ghi nhận thu tiền" })).toBeEnabled();
});
