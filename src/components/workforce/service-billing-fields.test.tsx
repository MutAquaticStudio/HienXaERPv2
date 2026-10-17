import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ServiceBillingFields, suggestedBillableAmount } from "./service-billing-fields";

const hidden = (container: HTMLElement) => container.querySelector<HTMLInputElement>('input[type="hidden"][name="billableAmount"]')!;

afterEach(cleanup);

describe("suggestedBillableAmount", () => {
  it("multiplies quantity by unit price in whole đồng, half up", () => {
    expect(suggestedBillableAmount("2", "450000")).toBe("900000");
    expect(suggestedBillableAmount("2.5", "800000")).toBe("2000000");
    expect(suggestedBillableAmount("0.333333", "1000")).toBe("333");
    expect(suggestedBillableAmount("0.0005", "1000")).toBe("1");
  });
  it("gives nothing without a price or a valid quantity", () => {
    expect(suggestedBillableAmount("2", null)).toBeNull();
    expect(suggestedBillableAmount("2,5", "1000")).toBeNull();
    expect(suggestedBillableAmount("", "1000")).toBeNull();
  });
});

describe("ServiceBillingFields", () => {
  it("fills the billed amount from quantity × unit price and follows the quantity", () => {
    const { container } = render(<form><ServiceBillingFields defaultQuantity="2" unitLabel="chuyến" unitPriceVnd="450000" /></form>);
    expect(hidden(container).value).toBe("900000");
    expect(screen.getByLabelText("Giá trị tính khách (VND)")).toHaveValue("900.000");
    fireEvent.change(screen.getByLabelText("Sản lượng tính khách (chuyến)"), { target: { value: "3" } });
    expect(hidden(container).value).toBe("1350000");
    expect(screen.getByText(/Đơn giá 450\.000/)).toBeInTheDocument();
  });

  it("keeps an amount the verifier typed and offers the suggestion back", () => {
    const { container } = render(<form><ServiceBillingFields defaultQuantity="2" unitLabel="chuyến" unitPriceVnd="450000" /></form>);
    fireEvent.change(screen.getByLabelText("Giá trị tính khách (VND)"), { target: { value: "850000" } });
    fireEvent.change(screen.getByLabelText("Sản lượng tính khách (chuyến)"), { target: { value: "3" } });
    expect(hidden(container).value).toBe("850000");
    fireEvent.click(screen.getByRole("button", { name: "Dùng giá gợi ý" }));
    expect(hidden(container).value).toBe("1350000");
  });

  it("leaves the amount empty for a job without a unit price", () => {
    const { container } = render(<form><ServiceBillingFields defaultQuantity="2" unitLabel="giờ" unitPriceVnd={null} /></form>);
    expect(hidden(container).value).toBe("");
    expect(screen.queryByText(/Đơn giá/)).not.toBeInTheDocument();
  });
});
