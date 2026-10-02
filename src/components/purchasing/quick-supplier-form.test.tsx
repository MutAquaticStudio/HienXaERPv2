import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QuickSupplierForm } from "./quick-supplier-form";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/modules/purchasing/actions", () => ({ createSupplierQuickAction: vi.fn(async () => ({
  success: true, supplierId: "created-supplier", message: "Đã tạo NCC",
})) }));
afterEach(cleanup);

it("returns the created supplier to the current PO context instead of just refreshing the old selection", async () => {
  window.history.replaceState(null, "", "/admin/purchase-orders/new?salesLineId=line&warehouse=warehouse");
  render(<QuickSupplierForm operationId="operation" />);
  fireEvent.click(screen.getByText("Thêm nhanh nhà cung cấp"));
  fireEvent.change(screen.getByLabelText("Mã NCC"), { target: { value: "QA_NEW" } });
  fireEvent.change(screen.getByLabelText("Tên NCC"), { target: { value: "QA new supplier" } });
  fireEvent.submit(screen.getByRole("button", { name: "Thêm NCC" }).closest("form")!);
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith(
    "/admin/purchase-orders/new?salesLineId=line&warehouse=warehouse&supplier=created-supplier", { scroll: false },
  ));
});
