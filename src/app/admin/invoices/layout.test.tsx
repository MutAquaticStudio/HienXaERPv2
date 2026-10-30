import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/access/context", () => ({ requireInternalAccess: async () => ({ permissions: new Set(["finance.ar.read"]) }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => { throw new Error("no database while paused"); } }));
import InvoicesLayout from "./layout";
import { createInvoiceDraftAction } from "@/modules/invoicing/actions";
import { registerSupplierDocumentAction } from "@/modules/invoicing/document-actions";

it("shows the paused notice instead of the invoice screens (D41)", async () => {
  render(await InvoicesLayout({ children: <p>Hồ sơ lập hóa đơn</p> }));
  expect(screen.getByRole("heading", { name: "Hóa đơn điện tử (tạm ngừng)" })).toBeInTheDocument();
  expect(screen.queryByText("Hồ sơ lập hóa đơn")).not.toBeInTheDocument();
});

it("refuses invoice commands while the module is paused (D41)", async () => {
  expect(await createInvoiceDraftAction({ status: "idle", message: "" }, new FormData())).toMatchObject({ status: "error", message: expect.stringContaining("tạm ngừng") });
  expect(await registerSupplierDocumentAction(new FormData())).toMatchObject({ status: "FAILED", message: expect.stringContaining("tạm ngừng") });
});
