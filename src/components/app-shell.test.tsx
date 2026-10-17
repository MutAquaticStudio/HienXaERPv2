import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

const location = vi.hoisted(() => ({ pathname: "/admin/orders/new" }));
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname }));

const ownerPermissions = ["dashboard.read", "quotation.read", "orders.read", "purchasing.read", "inventory.read", "delivery.read", "service.read", "workforce.read", "compensation.read", "finance.ar.read", "finance.payment_notice.review", "finance.ap.read", "finance.expense.read", "customers.read", "suppliers.read", "catalog.read", "roles.manage", "customers.manage", "suppliers.manage", "catalog.manage", "pricing.read"];
const shell = (permissions: readonly string[] = ownerPermissions) => <AppShell surface="admin" permissions={permissions} actorName="Chủ QA" branchName="Chi nhánh QA"><p>Nội dung</p></AppShell>;

beforeEach(() => { location.pathname = "/admin/orders/new"; });
afterEach(cleanup);

describe("grouped operational navigation", () => {
  it("opens the current business group and collapses unrelated groups", () => {
    render(shell());
    expect(screen.getByRole("button", { name: "Bán hàng" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Tài chính" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "Đơn bán" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Công nợ" })).not.toBeInTheDocument();
  });

  it("keeps all existing destinations and exposes existing stock-count and purchase-document routes", () => {
    const { container } = render(shell());
    const hrefs = [...container.querySelectorAll("aside a")].map((link) => link.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(24);
    expect(hrefs).not.toContain("/admin/quotations");
    expect(hrefs).not.toContain("/admin/payment-notices");
    expect(hrefs).toContain("/admin/stock-counts");
    expect(hrefs).toContain("/admin/debts");
    expect(hrefs).toContain("/admin/invoices");
    expect(hrefs).toContain("/admin/access");
    expect(hrefs).toContain("/admin/settings");
  });

  it("hides quotations even for actors who still hold quotation permissions (owner decision D1)", () => {
    render(shell());
    expect(screen.queryByRole("link", { name: "Báo giá" })).not.toBeInTheDocument();
  });

  it("does not render unauthorized links or empty groups", () => {
    const { container } = render(shell(["orders.read", "quotation.read", "customers.read"]));
    expect(screen.getByRole("button", { name: "Bán hàng" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tài chính" })).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/admin/access"]')).toBeNull();
    expect(container.querySelector('a[href="/admin/payables"]')).toBeNull();
    expect(container.querySelector('a[href="/admin/settings"]')).toBeNull();
  });

  it.each([
    ["catalog.manage", "Vật tư", "/admin/products/manage"],
    ["customers.manage", "Khách hàng", "/admin/customers/manage"],
    ["suppliers.manage", "Nhà cung cấp", "/admin/suppliers/manage"],
    ["pricing.read", "Giá bán", "/admin/products/pricing"],
  ])("preserves the independently authorized %s module", (permission, label, href) => {
    render(shell([permission]));
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
    expect(screen.queryByRole("link", { name: "Cài đặt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Quản lý danh mục" })).not.toBeInTheDocument();
  });

  it("renders a single permitted destination without an extra expansion step", () => {
    location.pathname = "/admin/payables";
    render(shell(["finance.ap.read"]));
    expect(screen.getByRole("button", { name: "Tài chính" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Công nợ" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Hóa đơn" })).toHaveAttribute("href", "/admin/invoices");
    expect(screen.queryByRole("link", { name: "Sổ quỹ" })).not.toBeInTheDocument();
  });

  it("allows collapse and reopens the current group on a subsequent route", () => {
    const { rerender } = render(shell());
    fireEvent.click(screen.getByRole("button", { name: "Bán hàng" }));
    expect(screen.getByRole("button", { name: "Bán hàng" })).toHaveAttribute("aria-expanded", "false");
    location.pathname = "/admin/customers/manage";
    rerender(shell());
    expect(screen.getByRole("button", { name: "Bán hàng" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Khách hàng" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps one finance entry active across its tabs (FB2 Đợt 6)", () => {
    location.pathname = "/admin/invoices/purchases/matching";
    const { container } = render(shell());
    expect(screen.getByRole("link", { name: "Hóa đơn" })).toHaveAttribute("aria-current", "page");
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    cleanup();
    location.pathname = "/admin/receivables/abc";
    render(shell());
    expect(screen.getByRole("link", { name: "Công nợ" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Báo chuyển khoản" })).not.toBeInTheDocument();
  });

  it("does not match a route with a similar but different path segment", () => {
    location.pathname = "/admin/orders-other";
    const { container } = render(shell());
    expect(container.querySelector('[aria-current="page"]')).toBeNull();
  });

  it("supports keyboard closing of the mobile drawer", () => {
    render(shell());
    const opener = screen.getByRole("button", { name: "Mở menu" });
    fireEvent.click(opener);
    expect(opener).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(screen.getByRole("complementary"), { key: "Escape" });
    expect(opener).toHaveAttribute("aria-expanded", "false");
    expect(opener).toHaveFocus();
  });

  it.each(["Đóng menu", "Đóng điều hướng"])("restores focus after %s removes the inert workspace", (label) => {
    const { container } = render(shell());
    const opener = screen.getByRole("button", { name: "Mở menu" });
    fireEvent.click(opener);
    expect(container.querySelector(".workspace")).toHaveAttribute("inert");
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(container.querySelector(".workspace")).not.toHaveAttribute("inert");
    expect(opener).toHaveFocus();
  });

  it("keeps Vietnamese labels and actor intact without the removed topbar branch label", () => {
    render(shell());
    const sidebar = screen.getByRole("complementary");
    expect(within(sidebar).getByRole("button", { name: "Kho hàng" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: "Nhân công" })).toBeInTheDocument();
    expect(sidebar.textContent).not.toMatch(/\uFFFD|Ã[\u0080-\u00bf]|Â[\u0080-\u00bf]/u);
    expect(screen.getByText("Chủ QA")).toBeInTheDocument();
    expect(screen.queryByText("Chi nhánh QA")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đăng xuất" }).closest("form")).toHaveAttribute("method", "post");
  });
});
