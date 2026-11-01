import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/actions", () => ({ selectBranchAction: vi.fn() }));

import { BranchSwitcher, branchReturnPath } from "./branch-switcher";

afterEach(cleanup);
const branches = [{ id: "b1", name: "Hiền Xa" }, { id: "b2", name: "Hiền Xa 2" }];

describe("quick branch switch", () => {
  it("comes back to the same section, never to a record of the old branch", () => {
    expect(branchReturnPath("/admin/orders/123")).toBe("/admin/orders");
    expect(branchReturnPath("/admin")).toBe("/admin");
    expect(branchReturnPath("/work/jobs")).toBe("/work/jobs");
    expect(branchReturnPath("/customer/orders")).toBe("/");
  });

  it("opens the list, sends the chosen branch with the section, and closes with Escape", () => {
    render(<BranchSwitcher branches={branches} currentId="b1" currentName="Hiền Xa" surface="admin" pathname="/admin/deliveries/9" />);
    const chip = screen.getByRole("button", { name: "Chi nhánh: Hiền Xa. Đổi chi nhánh" });
    expect(document.getElementById("branch-switch-panel")).not.toBeVisible();
    fireEvent.click(chip);
    const panel = document.getElementById("branch-switch-panel")!;
    const other = within(panel).getByRole("button", { name: "Hiền Xa 2" });
    const form = other.closest("form")!;
    expect(Object.fromEntries(new FormData(form))).toEqual({ branchId: "b2", surface: "admin", returnTo: "/admin/deliveries" });
    expect(within(panel).getByRole("button", { name: "Hiền Xa" })).toHaveAttribute("aria-current", "true");
    fireEvent.keyDown(other, { key: "Escape" });
    expect(chip).toHaveAttribute("aria-expanded", "false");
  });

  it("is a plain label with only one branch", () => {
    render(<BranchSwitcher branches={[branches[0]]} currentId="b1" currentName="Hiền Xa" surface="admin" pathname="/admin" />);
    expect(screen.getByText("Hiền Xa")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
