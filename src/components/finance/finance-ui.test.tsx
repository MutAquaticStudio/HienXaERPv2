import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));

import { ExpenseCreateChooser } from "./expense-create-chooser";
import { DebtTabs, InvoiceTabs } from "./finance-tabs";
import { PartyPaymentLauncher } from "./party-payment-launcher";
import { FormDialog } from "@/components/ui/form-dialog";

afterEach(cleanup);
const permissions = (...codes: string[]) => new Set(codes);

it("opens an existing form in a popup, also on arrival", () => {
  render(<FormDialog label="Ghi thu" title="Ghi thu · An Phát"><button type="submit">Ghi nhận thu tiền</button></FormDialog>);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ghi thu" }));
  expect(within(screen.getByRole("dialog", { name: "Ghi thu · An Phát" })).getByRole("button", { name: "Ghi nhận thu tiền" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  cleanup();
  render(<FormDialog label="Duyệt" title="Duyệt chi phí" defaultOpen><p>Biểu mẫu</p></FormDialog>);
  expect(screen.getByRole("dialog", { name: "Duyệt chi phí" })).toBeInTheDocument();
});

it("picks a customer and opens their receipt form in Công nợ", () => {
  render(<PartyPaymentLauncher label="Lập phiếu thu" title="Lập phiếu thu · chọn khách hàng" partyLabel="khách hàng" hrefPrefix="/admin/receivables?customer="
    parties={[{ id: "c1", code: "KH01", name: "Công ty An Phát" }, { id: "c2", code: "KH02", name: "Anh Bình" }]} />);
  fireEvent.click(screen.getByRole("button", { name: "Lập phiếu thu" }));
  expect(screen.getByRole("button", { name: "Tiếp tục" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Tìm khách hàng"), { target: { value: "bình" } });
  expect(screen.queryByText("Công ty An Phát")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: /Anh Bình/ }));
  fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
  expect(m.push).toHaveBeenCalledWith("/admin/receivables?customer=c2");
});

it("switches the expense popup between a general and a trip expense", () => {
  render(<ExpenseCreateChooser general={<p>Biểu mẫu chung</p>} trip={<p>Biểu mẫu chuyến</p>} />);
  expect(screen.getByText("Biểu mẫu chung")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: /Chi phí chuyến/ }));
  expect(screen.getByText("Biểu mẫu chuyến")).toBeInTheDocument();
  expect(screen.queryByText("Biểu mẫu chung")).not.toBeInTheDocument();
  cleanup();
  render(<ExpenseCreateChooser general={<p>Biểu mẫu chung</p>} trip={null} />);
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
});

it("shows only the finance tabs the actor may read", () => {
  render(<DebtTabs active="/admin/payables" permissions={permissions("finance.ar.read", "finance.ap.read")} />);
  expect(screen.getByRole("link", { name: "Phải trả nhà cung cấp" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Phải thu khách hàng" })).toHaveAttribute("href", "/admin/receivables");
  cleanup();
  const { container } = render(<DebtTabs active="/admin/payables" permissions={permissions("finance.ap.read")} />);
  expect(container).toBeEmptyDOMElement();
  cleanup();
  render(<InvoiceTabs active="/admin/invoices/purchases/matching" permissions={permissions("finance.ap.read", "finance.ar.read")} />);
  expect(screen.getAllByRole("link")).toHaveLength(3);
  expect(screen.getByRole("link", { name: "Đối chiếu chứng từ NCC" })).toHaveAttribute("aria-current", "page");
});
