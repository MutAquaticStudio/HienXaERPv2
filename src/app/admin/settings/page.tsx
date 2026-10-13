import Link from "next/link";
import { requireInternalPermission } from "@/lib/access/context";
export default async function SettingsPage() {
  const access = await requireInternalPermission("roles.manage");
  return <div className="page-stack"><header className="page-heading"><div><p className="eyebrow">Hệ thống · {access.branchName}</p><h1>Thiết lập hệ thống</h1><p className="lede">Quản lý chi nhánh, phạm vi dữ liệu và phân quyền.</p></div></header><div className="three-column"><article className="card card-pad"><h2>Phạm vi dữ liệu</h2><Link className="button button-secondary" href="/admin/operations">Giao dịch mới và phạm vi lịch sử</Link></article><article className="card card-pad"><h2>Chi nhánh</h2><Link className="button button-secondary" href="/admin/settings/branches">Quản lý chi nhánh</Link></article><article className="card card-pad"><h2>Tài khoản & quyền</h2><Link className="button button-secondary" href="/admin/access">Nhân viên & phân quyền</Link></article></div></div>;
}
