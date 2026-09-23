import Link from "next/link";
import { requireInternalAccess } from "@/lib/access/context";

const sections = [
  { title: "Khách hàng & đối tác", items: [
    { label: "Khách hàng", kind: "customers", permission: "customers.manage" },
    { label: "Công trình", kind: "sites", permission: "customers.manage" },
    { label: "Nhà cung cấp", kind: "suppliers", permission: "suppliers.manage" },
  ] },
  { title: "Vật tư & đơn vị", items: [
    { label: "Vật tư", kind: "materials", permission: "catalog.manage" },
    { label: "Nhóm vật tư", kind: "groups", permission: "catalog.manage" },
    { label: "Đơn vị tính", kind: "units", permission: "catalog.manage" },
    { label: "Quy đổi đơn vị", kind: "conversions", permission: "catalog.manage" },
  ] },
  { title: "Vận hành chi nhánh", items: [
    { label: "Kho", kind: "warehouses", permission: "roles.manage" },
    { label: "Xe", kind: "vehicles", permission: "roles.manage" },
    { label: "Máy", kind: "machines", permission: "roles.manage" },
    { label: "Chi nhánh", kind: "branches", permission: "roles.manage" },
  ] },
] as const;

export default async function SettingsPage() {
  const access = await requireInternalAccess();
  const visible = sections.map((section) => ({
    title: section.title,
    items: section.items.filter((item) => access.permissions.has(item.permission)),
  })).filter((section) => section.items.length > 0);
  const canReadPricing = access.permissions.has("pricing.read");
  return <>
    <header className="page-heading"><div><p className="eyebrow">Cấu hình · {access.branchName}</p><h1>Cài đặt vận hành</h1><p className="lede">Quản lý danh mục và chính sách dùng khi lập chứng từ. Thay đổi không viết lại lịch sử đã chốt.</p></div></header>
    {visible.length === 0 && !canReadPricing && <p>Không có quyền quản lý cấu hình.</p>}
    {visible.map((section) => <section key={section.title} aria-label={section.title}><h2>{section.title}</h2><div className="three-column">{section.items.map((item) => <article className="card card-pad" key={item.kind}><h3>{item.label}</h3><Link className="button button-secondary" href={`/admin/catalog?kind=${item.kind}`}>Mở danh mục</Link></article>)}</div></section>)}
    {canReadPricing && <section aria-label="Chính sách giá"><h2>Giá bán</h2><div className="three-column"><article className="card card-pad"><h3>Chính sách giá</h3><p className="muted">Xem quy tắc đang dùng và phiên bản đã lưu.</p><Link className="button button-secondary" href="/admin/settings/pricing">Mở chính sách giá</Link></article></div></section>}
  </>;
}
