import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

const location = vi.hoisted(() => ({ pathname: "/admin/orders/new" }));
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname }));
// The bell loads its feed through a server action; it has its own tests.
vi.mock("@/components/notifications/notification-bell", () => ({ NotificationBell: ({ branchId }: { branchId: string }) => <button type="button" data-branch={branchId}>Thông báo</button> }));
vi.mock("@/modules/ai/ai-bubble", () => ({ AiBubble: () => <div data-testid="ai-bubble" /> }));
vi.mock("@/components/messaging/chat-dock", () => ({ ChatDock: () => null }));

const ownerPermissions = ["dashboard.read", "quotation.read", "orders.read", "purchasing.read", "inventory.read", "delivery.read", "service.read", "workforce.read", "compensation.read", "finance.ar.read", "finance.payment_notice.review", "finance.ap.read", "finance.expense.read", "customers.read", "suppliers.read", "catalog.read", "roles.manage", "customers.manage", "suppliers.manage", "catalog.manage", "pricing.read"];
const shell = (permissions: readonly string[] = ownerPermissions) => <AppShell surface="admin" permissions={permissions} actorName="Chủ QA" branchName="Chi nhánh QA"><p>Nội dung</p></AppShell>;

beforeEach(() => { location.pathname = "/admin/orders/new"; });
afterEach(cleanup);

const openDrawer = () => fireEvent.click(screen.getByRole("button", { name: "Mở menu" }));

describe("blue menu bar (D29)", () => {
  it("marks the current group as a tab and opens one drop-down at a time", () => {
    render(shell());
    const menu = screen.getByRole("navigation", { name: "Menu chính" });
    const sales = within(menu).getByRole("button", { name: "Bán hàng" });
    expect(sales).toHaveClass("current");
    expect(sales).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(sales);
    expect(sales).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Đơn bán" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(within(menu).getByRole("button", { name: "Tài chính" }));
    expect(sales).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "Công nợ" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Đơn bán" })).not.toBeInTheDocument();
  });

  it("closes a drop-down with Escape and returns focus to its button, and on a click elsewhere", () => {
    render(shell());
    const sales = screen.getByRole("button", { name: "Bán hàng" });
    fireEvent.click(sales);
    fireEvent.keyDown(screen.getByRole("link", { name: "Khách hàng" }), { key: "Escape" });
    expect(sales).toHaveAttribute("aria-expanded", "false");
    expect(sales).toHaveFocus();
    fireEvent.click(sales);
    fireEvent.pointerDown(screen.getByText("Nội dung"));
    expect(sales).toHaveAttribute("aria-expanded", "false");
  });

  it("offers \u201cTạo đơn bán\u201d only to staff who may create orders", () => {
    const { unmount } = render(shell());
    expect(screen.queryByRole("link", { name: "Tạo đơn bán" })).not.toBeInTheDocument();
    unmount();
    render(shell([...ownerPermissions, "orders.create"]));
    expect(screen.getByRole("link", { name: "Tạo đơn bán" })).toHaveAttribute("href", "/admin/orders/new");
  });

  it("keeps appearance and sign-out in the user menu, with the branch", () => {
    render(shell());
    expect(screen.queryByRole("button", { name: "Đăng xuất" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Chủ QA/ }));
    expect(screen.getByRole("button", { name: "Giao diện" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đăng xuất" }).closest("form")).toHaveAttribute("method", "post");
    expect(screen.getAllByText("Chi nhánh QA").length).toBeGreaterThan(0);
  });

  it("opens the current business group in the drawer and collapses unrelated groups", () => {
    render(shell());
    openDrawer();
    expect(screen.getByRole("button", { name: "Bán hàng" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Tài chính" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "Đơn bán" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Công nợ" })).not.toBeInTheDocument();
  });

  it("keeps all existing destinations and exposes existing stock-count and purchase-document routes", () => {
    const { container } = render(shell());
    const hrefs = [...container.querySelectorAll("nav a")].map((link) => link.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(24);
    // FB12: Bảng lương under Nhân công.
    expect(hrefs).toContain("/admin/payroll");
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
    openDrawer();
    expect(screen.getByRole("button", { name: "Tài chính" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Công nợ" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Hóa đơn điện tử (tạm ngừng)" })).toHaveAttribute("href", "/admin/invoices");
    expect(screen.queryByRole("link", { name: "Sổ quỹ" })).not.toBeInTheDocument();
  });

  it("allows collapse and reopens the current group on a subsequent route", () => {
    const { rerender } = render(shell());
    openDrawer();
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
    openDrawer();
    expect(screen.getByRole("link", { name: "Hóa đơn điện tử (tạm ngừng)" })).toHaveAttribute("aria-current", "page");
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    cleanup();
    location.pathname = "/admin/receivables/abc";
    render(shell());
    openDrawer();
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
    fireEvent.keyDown(screen.getByRole("navigation", { name: "Menu chính" }), { key: "Escape" });
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

  it("keeps Vietnamese labels and the actor intact", () => {
    render(shell());
    const menu = screen.getByRole("navigation", { name: "Menu chính" });
    expect(within(menu).getByRole("button", { name: "Kho hàng" })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "Nhân công" })).toBeInTheDocument();
    expect(menu.textContent).not.toMatch(/\uFFFD|Ã[\u0080-\u00bf]|Â[\u0080-\u00bf]/u);
    expect(screen.getAllByText("Chủ QA").length).toBeGreaterThan(0);
  });
});

it("shows the notification bell in the office top bar of the active branch only", () => {
  const { unmount } = render(<AppShell surface="admin" permissions={ownerPermissions} actorName="Chủ QA" branchId="b1"><p>Nội dung</p></AppShell>);
  expect(screen.getByRole("button", { name: "Thông báo" })).toHaveAttribute("data-branch", "b1");
  unmount();
  render(<AppShell surface="work" permissions={[]} actorName="Thợ" branchId="b1"><p>Nội dung</p></AppShell>);
  expect(screen.queryByRole("button", { name: "Thông báo" })).not.toBeInTheDocument();
});
