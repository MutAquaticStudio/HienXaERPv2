import { AxTabLinks } from "./fin-kit";

type Permissions = { has: (permission: string) => boolean };

const DEBT_TABS = [
  { id: "/admin/receivables", label: "Phải thu khách hàng", permission: "finance.ar.read" },
  { id: "/admin/payables", label: "Phải trả nhà cung cấp", permission: "finance.ap.read" },
] as const;
const INVOICE_TABS = [
  { id: "/admin/invoices", label: "Hóa đơn bán ra", permission: "finance.ar.read" },
  { id: "/admin/invoices/purchases", label: "Chứng từ mua vào", permission: "finance.ap.read" },
  { id: "/admin/invoices/purchases/matching", label: "Đối chiếu chứng từ NCC", permission: "finance.ap.read" },
] as const;

function Tabs({ tabs, active, permissions, label }: { tabs: readonly { id: string; label: string; permission: string }[]; active: string; permissions: Permissions; label: string }) {
  const visible = tabs.filter((tab) => permissions.has(tab.permission));
  return visible.length > 1 ? <AxTabLinks label={label} items={visible.map((tab) => ({ href: tab.id, label: tab.label, active: tab.id === active }))} /> : null;
}

/** Tab "Công nợ" kiểu Astryx: Phải thu | Phải trả, cùng quyền hiển thị với DebtTabs của Classic. */
export function AxDebtTabs({ active, permissions }: { active: (typeof DEBT_TABS)[number]["id"]; permissions: Permissions }) {
  return <Tabs tabs={DEBT_TABS} active={active} permissions={permissions} label="Công nợ" />;
}
/** Tab "Hóa đơn" kiểu Astryx, cùng quyền hiển thị với InvoiceTabs của Classic. */
export function AxInvoiceTabs({ active, permissions }: { active: (typeof INVOICE_TABS)[number]["id"]; permissions: Permissions }) {
  return <Tabs tabs={INVOICE_TABS} active={active} permissions={permissions} label="Hóa đơn" />;
}
