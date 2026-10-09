import Link from "next/link";
import { requireInternalPermission } from "@/lib/access/context";
export default async function SettingsPage() {
  const access = await requireInternalPermission("roles.manage");
  return <><header className="page-heading"><div><p className="eyebrow">Hệ thống · {access.branchName}</p><h1>Thiết lập hệ thống</h1><p className="lede">Danh mục nghiệp vụ được quản lý ngay tại phân hệ tương ứng.</p></div></header><div className="three-column"><article className="card card-pad"><h2>Chi nhánh</h2><Link className="button button-secondary" href="/admin/settings/branches">Quản lý chi nhánh</Link></article><article className="card card-pad"><h2>Tài khoản & quyền</h2><Link className="button button-secondary" href="/admin/access">Nhân viên & phân quyền</Link></article></div></>;
}
