import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { groupMoney, MoneyInput, moneyDigits, RESTORED_EVENT } from "./money-input";

afterEach(cleanup);
const posted = (name: string) => new FormData(screen.getByRole("form", { name: "phiếu" }) as HTMLFormElement).getAll(name);

describe("money text", () => {
  it("reads typed or pasted amounts as whole đồng", () => {
    expect(moneyDigits("60000")).toBe("60000");
    expect(moneyDigits("60.000")).toBe("60000");
    expect(moneyDigits("60,000 đ")).toBe("60000");
    expect(moneyDigits("00012")).toBe("12");
    expect(moneyDigits("-5.000")).toBe("5000");
    expect(moneyDigits("-5.000", true)).toBe("-5000");
    expect(moneyDigits("12345678901234567890")).toHaveLength(19);
  });
  it("groups thousands with dots like every amount shown in the app", () => {
    expect(groupMoney("")).toBe("");
    expect(groupMoney("600")).toBe("600");
    expect(groupMoney("60000")).toBe("60.000");
    expect(groupMoney("1250000")).toBe("1.250.000");
    expect(groupMoney("-100000")).toBe("-100.000");
  });
});

describe("MoneyInput", () => {
  it("shows 60.000 while typing 60000 and posts plain digits", () => {
    render(<form aria-label="phiếu"><MoneyInput aria-label="Số tiền" name="amount" /></form>);
    const box = screen.getByLabelText("Số tiền");
    for (const typed of ["6", "60", "600", "6000", "6.0000"]) fireEvent.change(box, { target: { value: typed } });
    expect(box).toHaveValue("60.000");
    expect(box).not.toHaveAttribute("name");
    expect(posted("amount")).toEqual(["60000"]);
  });

  it("keeps the cursor after the digit just typed in the middle of the number", () => {
    render(<form aria-label="phiếu"><MoneyInput aria-label="Số tiền" name="amount" defaultValue="60000" /></form>);
    const box = screen.getByLabelText("Số tiền") as HTMLInputElement;
    expect(box).toHaveValue("60.000");
    box.focus();
    // Type "5" right after the "6": "65.0000" with the caret after the 5.
    box.setSelectionRange(1, 1);
    fireEvent.change(box, { target: { value: "650.000", selectionStart: 2, selectionEnd: 2 } });
    expect(box).toHaveValue("650.000");
    expect(box.selectionStart).toBe(2);
  });

  it("accepts a signed adjustment only when allowed", () => {
    render(<form aria-label="phiếu"><MoneyInput aria-label="Điều chỉnh" name="amount" allowNegative /></form>);
    fireEvent.change(screen.getByLabelText("Điều chỉnh"), { target: { value: "-100000" } });
    expect(screen.getByLabelText("Điều chỉnh")).toHaveValue("-100.000");
    expect(posted("amount")).toEqual(["-100000"]);
  });

  it("works controlled and returns to its starting amount when the form resets", () => {
    function Harness() {
      const [amount, setAmount] = useState("");
      return <form aria-label="phiếu"><MoneyInput aria-label="Có kiểm soát" value={amount} onValue={setAmount} /><output>{amount}</output>
        <MoneyInput aria-label="Tự do" name="free" defaultValue={5000} /><button type="reset">Làm lại</button></form>;
    }
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Có kiểm soát"), { target: { value: "1200000" } });
    expect(screen.getByLabelText("Có kiểm soát")).toHaveValue("1.200.000");
    expect(screen.getByRole("status")).toHaveTextContent("1200000");
    fireEvent.change(screen.getByLabelText("Tự do"), { target: { value: "7.0000" } });
    expect(posted("free")).toEqual(["70000"]);
    fireEvent.click(screen.getByRole("button", { name: "Làm lại" }));
    expect(screen.getByLabelText("Tự do")).toHaveValue("5.000");
  });
});

it("shows a restored draft amount written into its hidden field", () => {
  render(<form aria-label="phiếu"><MoneyInput aria-label="Số tiền" name="amount" /></form>);
  const hidden = screen.getByRole("form", { name: "phiếu" }).querySelector<HTMLInputElement>('input[name="amount"]')!;
  hidden.value = "2500000";
  fireEvent(hidden, new Event(RESTORED_EVENT));
  expect(screen.getByLabelText("Số tiền")).toHaveValue("2.500.000");
});
