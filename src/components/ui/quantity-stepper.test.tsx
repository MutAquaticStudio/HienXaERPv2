import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QuantityStepper, stepBy } from "./quantity-stepper";

afterEach(cleanup);

describe("stepBy", () => {
  it("counts up and down, never below the minimum", () => {
    expect(stepBy("", 1, 0)).toBe("1");
    expect(stepBy("2,5", 1, 0)).toBe("3.5");
    expect(stepBy("1", -1, 0)).toBe("0");
    expect(stepBy("0", -1, 0)).toBeNull();
    expect(stepBy("1", -1, 1)).toBeNull();
    expect(stepBy("abc", 1, 1)).toBe("1");
  });
});

describe("QuantityStepper", () => {
  it("posts the counted value and lets an optional count go back to empty", () => {
    render(<form><QuantityStepper id="q" name="qty" label="Số chuyến" unit="chuyến" allowEmpty /></form>);
    const hidden = () => document.querySelector<HTMLInputElement>("input[name=qty]")!.value;
    expect(screen.getByText("chuyến")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bớt 1 · Số chuyến" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Thêm 1 · Số chuyến" }));
    fireEvent.click(screen.getByRole("button", { name: "Thêm 1 · Số chuyến" }));
    expect(hidden()).toBe("2");
    fireEvent.change(screen.getByLabelText("Số chuyến"), { target: { value: "4,5" } });
    expect(hidden()).toBe("4.5");
    fireEvent.change(screen.getByLabelText("Số chuyến"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Bớt 1 · Số chuyến" }));
    expect(hidden()).toBe("");
    expect(screen.getByLabelText("Số chuyến")).not.toBeRequired();
  });

  it("stops at zero when zero is allowed", () => {
    render(<QuantityStepper id="q" label="Số giờ" min={0} defaultValue="1" required />);
    fireEvent.click(screen.getByRole("button", { name: "Bớt 1 · Số giờ" }));
    expect(screen.getByLabelText("Số giờ")).toHaveValue("0");
    expect(screen.getByRole("button", { name: "Bớt 1 · Số giờ" })).toBeDisabled();
    expect(screen.getByLabelText("Số giờ")).toBeRequired();
  });
});
