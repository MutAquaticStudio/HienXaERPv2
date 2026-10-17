import { DetailTabs } from "@/components/ui/detail-tabs";

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

function SectionTabs({ tabs, active, permissions, label }: { tabs: readonly { id: string; label: string; permission: string }[]; active: string; permissions: Permissions; label: string }) {
  const visible = tabs.filter((tab) => permissions.has(tab.permission));
  return visible.length > 1 ? <DetailTabs tabs={visible} active={active} href={(id) => id} label={label} /> : null;
}

/** Tabs of "Công nợ" (FB2 Đợt 6): receivables and payables, each shown only with its read right. */
export function DebtTabs({ active, permissions }: { active: (typeof DEBT_TABS)[number]["id"]; permissions: Permissions }) {
  return <SectionTabs tabs={DEBT_TABS} active={active} permissions={permissions} label="Công nợ" />;
}

/** Tabs of "Hóa đơn" (FB2 Đợt 6): sales invoice records, supplier documents and their matching. */
export function InvoiceTabs({ active, permissions }: { active: (typeof INVOICE_TABS)[number]["id"]; permissions: Permissions }) {
  return <SectionTabs tabs={INVOICE_TABS} active={active} permissions={permissions} label="Hóa đơn" />;
}
