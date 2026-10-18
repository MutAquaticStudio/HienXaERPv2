import Link from "next/link";
import { cookies } from "next/headers";
import { AppearanceForm } from "@/components/settings/appearance-form";
import { CompanyLogoForm } from "@/components/settings/company-logo-form";
import { CompanyProfileForm } from "@/components/settings/company-profile-form";
import { OperationSettingsForm, type OperationSettings } from "@/components/settings/operation-settings-form";
import { requireInternalPermission } from "@/lib/access/context";
import { APPEARANCE_COOKIE, parseAppearance } from "@/lib/appearance";
import { loadCompanyLogo, loadCompanyProfile } from "@/lib/company/profile";
import { createServerSupabase } from "@/lib/supabase/server";

/** Cài đặt (FB2 Đợt 7, D10): company details printed on documents, delivery settings of the branch (D21), this device's appearance, and the existing admin links. */
export default async function SettingsPage() {
  const access = await requireInternalPermission("roles.manage");
  const supabase = await createServerSupabase();
  const [profile, logo, cookieStore, operation, warehouses] = await Promise.all([loadCompanyProfile(supabase), loadCompanyLogo(supabase), cookies(),
    supabase.from("branch_operation_settings").select("stop_minutes, version, default_warehouse_id, auto_source_enabled, trip_cost_vnd::text, dispatch_mode, work_day_start, work_day_end").eq("branch_id", access.branchId).maybeSingle(),
    supabase.from("warehouses").select("id, name").eq("branch_id", access.branchId).eq("active", true).order("name").limit(100)]);
  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Hệ thống · {access.branchName}</p><h1>Cài đặt</h1><p className="lede">Thông tin doanh nghiệp in trên chứng từ, vận hành giao hàng, giao diện trên thiết bị này, chi nhánh, phạm vi dữ liệu và phân quyền.</p></div></header>
    <div className="settings-grid">
      <section className="card card-pad"><div className="section-head flush"><h2>Thông tin doanh nghiệp</h2></div>
        <p className="card-scope-note">In ở đầu đơn bán, đơn mua, phiếu giao, phiếu thu/chi và bảng đối chiếu công nợ. Chi nhánh vẫn in như hiện tại.</p>
        <CompanyProfileForm profile={profile} logoSrc={logo ? `data:${logo.mime};base64,${logo.base64}` : null} />
        <CompanyLogoForm logo={logo} profileSaved={!!profile} /></section>
      <section className="card card-pad"><div className="section-head flush"><h2>Vận hành giao hàng</h2></div>
        <p className="card-scope-note">Áp dụng cho chi nhánh {access.branchName}.</p>
        <OperationSettingsForm settings={(operation.data as OperationSettings | null) ?? null} warehouses={warehouses.data ?? []} /></section>
      <section className="card card-pad"><div className="section-head flush"><h2>Giao diện</h2></div>
        <AppearanceForm initial={parseAppearance(cookieStore.get(APPEARANCE_COOKIE)?.value)} /></section>
    </div>
    <div className="three-column">
      <article className="card card-pad"><h2>Phạm vi dữ liệu</h2><Link className="button button-secondary" href="/admin/operations">Giao dịch mới và phạm vi lịch sử</Link></article>
      <article className="card card-pad"><h2>Chi nhánh</h2><Link className="button button-secondary" href="/admin/settings/branches">Quản lý chi nhánh</Link></article>
      <article className="card card-pad"><h2>Tài khoản & quyền</h2><Link className="button button-secondary" href="/admin/access">Nhân viên & phân quyền</Link></article>
      <article className="card card-pad"><h2>Tự động hóa</h2><Link className="button button-secondary" href="/admin/settings/automation">Quy tắc tự động</Link></article>
    </div>
  </div>;
}
