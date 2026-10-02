import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PricingRuleEditor } from "./editor";
import { savePricingRuleAction } from "./actions";
vi.mock("./actions", () => ({ savePricingRuleAction: vi.fn(async () => ({ success: true, message: "Đã tạo chính sách giá." })) }));
afterEach(cleanup);

it("allows creating another price rule after a successful save", async () => {
  render(<PricingRuleEditor options={{ customers: [], groups: [], materials: [{ id: "material", name: "Vật tư" }], units: [{ id: "uom", name: "Bao" }] }} />);
  const button = screen.getByRole("button", { name: "Tạo chính sách giá" });
  fireEvent.submit(button.closest("form")!);
  await screen.findByText("Đã tạo chính sách giá.");
  expect(button).toBeEnabled();
  fireEvent.submit(button.closest("form")!);
  await waitFor(() => expect(savePricingRuleAction).toHaveBeenCalledTimes(2));
});
