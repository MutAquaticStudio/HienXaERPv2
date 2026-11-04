import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { AppearanceForm } from "@/components/settings/appearance-form";
import { CompanyLogoForm } from "@/components/settings/company-logo-form";
import { CompanyProfileForm } from "@/components/settings/company-profile-form";
import { OperationSettingsForm, type OperationSettings } from "@/components/settings/operation-settings-form";
import { PortalBranchForm } from "@/components/settings/portal-branch-form";
import { requireInternalPermission } from "@/lib/access/context";
import { APPEARANCE_COOKIE, parseAppearance } from "@/lib/appearance";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { loadCompanyLogo, loadCompanyProfile } from "@/lib/company/profile";
import { createServerSupabase } from "@/lib/supabase/server";
import { ZALO_STATE_LABEL, type ZaloStatus } from "@/modules/zalo/presentation";

export const metadata: Metadata = { title: "Cài đặt" };

type Tone = "ok" | "warn" | "muted";
type Entry = { href: string; title: string; detail: string; status?: { text: string; tone: Tone } };
type Group = { title: string; entries: Entry[] };
const DISPATCH_LABEL: Record<string, string> = { AUTO: "Tự điều phối", SUGGEST: "Gợi ý điều phối", OFF: "Điều phối tay" };

/** "Đổi lần cuối: 04/11/2026 14:05 · Nguyễn Văn A" of a setting, from the audit log (null when never changed or not readable). */
async function lastChange(supabase: Awaited<ReturnType<typeof createServerSupabase>>, branchId: string, action: string) {
  const { data } = await supabase.from("audit_events").select("occurred_at, actor_auth_user_id").eq("branch_id", branchId).eq("action", action)
    .order("occurred_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const row = data as { occurred_at: string; actor_auth_user_id: string };
  const { data: employee } = await supabase.from("employees").select("display_name").eq("auth_user_id", row.actor_auth_user_id).maybeSingle();
  return `${formatBusinessDateTime(row.occurred_at)}${employee?.display_name ? ` · ${employee.display_name}` : ""}`;
}

/**
 * Cài đặt (FB2 Đợt 7, D10, D58) — D59: a grouped index first (what each setting is and how it stands now, the forms on
 * this page and the pages behind it), then the forms of this page. Settings that act on their own say who changed them last.
 */
export default async function SettingsPage() {
  const access = await requireInternalPermission("roles.manage");
  const supabase = await createServerSupabase();
  const canAi = access.permissions.has("ai.manage");
  const [profile, logo, cookieStore, operation, warehouses, portal, branches, zalo, ai, operationChange, portalChange] = await Promise.all([
    loadCompanyProfile(supabase), loadCompanyLogo(supabase), cookies(),
    supabase.from("branch_operation_settings").select("stop_minutes, version, default_warehouse_id, auto_source_enabled, trip_cost_vnd::text, dispatch_mode, work_day_start, work_day_end").eq("branch_id", access.branchId).maybeSingle(),
    supabase.from("warehouses").select("id, name").eq("branch_id", access.branchId).eq("active", true).order("name").limit(100),
    supabase.from("company_profile").select("portal_branch_id").limit(1).maybeSingle(),
    supabase.from("branches").select("id, name").eq("active", true).order("name").limit(50),
    supabase.rpc("zalo_status"),
    canAi ? supabase.rpc("ai_api_key_status") : Promise.resolve({ data: null }),
    lastChange(supabase, access.branchId, "branch_operation_settings.saved"),
    lastChange(supabase, access.branchId, "company.portal_branch_set"),
  ]);
  const settings = (operation.data as OperationSettings | null) ?? null;
  const portalBranchId = (portal.data as { portal_branch_id?: string | null } | null)?.portal_branch_id ?? null;
  const branchList = branches.data ?? [];
  const portalBranch = branchList.find((branch) => branch.id === portalBranchId)?.name;
  const zaloState = (zalo.data as ZaloStatus | null)?.state;
  const aiStatus = ai.data as { in_app?: boolean } | null;

  const groups: Group[] = [
    { title: "Doanh nghiệp & in ấn", entries: [
      { href: "#doanh-nghiep", title: "Thông tin doanh nghiệp", detail: "Tên, mã số thuế, chuyển khoản và logo in trên chứng từ.",
        status: profile ? { text: logo ? "Đã có logo" : "Chưa có logo", tone: logo ? "ok" : "warn" } : { text: "Chưa nhập", tone: "warn" } },
      { href: "/admin/settings/branches", title: "Chi nhánh", detail: "Tên, địa chỉ in trên chứng từ của từng chi nhánh.", status: { text: `${branchList.length} đang hoạt động`, tone: "muted" } },
    ] },
    { title: "Bán hàng & giá", entries: [
      { href: "/admin/settings/pricing", title: "Chính sách giá", detail: "Nhóm giá khách, giá theo khách / vật tư và ngày hiệu lực." },
      { href: "#khach-tu-dang-ky", title: "Khách tự đăng ký", detail: "Chi nhánh nhận khách mới đăng ký trên cổng khách.",
        status: portalBranch ? { text: `Mở · ${portalBranch}`, tone: "ok" } : { text: "Chưa chọn — đang đóng", tone: "warn" } },
    ] },
    { title: "Giao hàng & kho", entries: [
      { href: "#giao-hang", title: "Vận hành giao hàng", detail: "Thời gian mỗi điểm giao, tự phân nguồn, tự điều phối.",
        status: { text: DISPATCH_LABEL[settings?.dispatch_mode ?? "AUTO"], tone: "muted" } },
      { href: "/admin/inventory/warehouses", title: "Kho", detail: "Danh sách kho và kho mặc định." },
      { href: "/admin/dispatch/resources", title: "Xe & tài xế", detail: "Xe, tài xế mặc định và trạng thái xe." },
    ] },
    { title: "Kết nối & tự động", entries: [
      { href: "/admin/settings/zalo", title: "Zalo OA", detail: "Tin Zalo tự động cho khách.",
        status: zaloState ? { text: ZALO_STATE_LABEL[zaloState], tone: zaloState === "CONNECTED" ? "ok" : "warn" } : undefined },
      ...(canAi ? [{ href: "/admin/settings/ai", title: "Trợ lý AI", detail: "Khóa API Claude của doanh nghiệp.",
        status: aiStatus ? { text: aiStatus.in_app ? "Đã có khóa" : "Chưa có khóa riêng", tone: (aiStatus.in_app ? "ok" : "muted") as Tone } : undefined }] : []),
      { href: "/admin/settings/automation", title: "Quy tắc tự động", detail: "Báo việc về điện thoại, Telegram, email." },
    ] },
    { title: "Nhân viên, quyền & dữ liệu", entries: [
      { href: "/admin/access", title: "Nhân viên & phân quyền", detail: "Tài khoản, vai trò, chi nhánh được vào." },
      { href: "/admin/audit", title: "Nhật ký hoạt động", detail: "Ai đã làm gì, lúc nào." },
      { href: "/admin/operations", title: "Phạm vi dữ liệu", detail: "Giao dịch mới và phạm vi lịch sử." },
    ] },
    { title: "Thiết bị này", entries: [
      { href: "#giao-dien", title: "Giao diện", detail: "Màu, cỡ chữ, phông chữ — chỉ trên máy đang dùng." },
    ] },
  ];

  return <div className="page-stack settings-page">
    <header className="page-heading"><div><h1>Cài đặt</h1><p className="lede">Chọn một mục bên dưới. Nhãn màu cạnh tên mục cho biết đang bật gì, còn thiếu gì.</p></div></header>
    <nav className="settings-index" aria-label="Mục cài đặt">{groups.map((group) => <section key={group.title} className="card settings-index-group">
      <h2>{group.title}</h2>
      <ul>{group.entries.map((entry) => <li key={entry.href}><Link href={entry.href}>
        <span className="settings-entry-head"><strong>{entry.title}</strong>{entry.status && <span className={`settings-status ${entry.status.tone}`}>{entry.status.text}</span>}</span>
        <small>{entry.detail}</small></Link></li>)}</ul>
    </section>)}</nav>

    <div className="settings-grid">
      <section className="card card-pad settings-section" id="doanh-nghiep" aria-labelledby="doanh-nghiep-title"><div className="section-head flush"><h2 id="doanh-nghiep-title">Thông tin doanh nghiệp</h2></div>
        <p className="settings-note">In ở đầu đơn bán, đơn mua, phiếu giao, phiếu thu/chi và bảng đối chiếu công nợ. Tên và địa chỉ chi nhánh in thêm theo trang Chi nhánh.</p>
        <CompanyProfileForm profile={profile} logoSrc={logo ? `data:${logo.mime};base64,${logo.base64}` : null} />
        <CompanyLogoForm logo={logo} profileSaved={!!profile} /></section>
      <section className="card card-pad settings-section" id="giao-hang" aria-labelledby="giao-hang-title"><div className="section-head flush"><h2 id="giao-hang-title">Vận hành giao hàng</h2></div>
        <p className="settings-note">Áp dụng cho chi nhánh {access.branchName}.{operationChange ? ` Đổi lần cuối: ${operationChange}.` : ""}</p>
        <OperationSettingsForm settings={settings} warehouses={warehouses.data ?? []} /></section>
      <section className="card card-pad settings-section" id="khach-tu-dang-ky" aria-labelledby="khach-title"><div className="section-head flush"><h2 id="khach-title">Khách tự đăng ký</h2></div>
        <PortalBranchForm current={portalBranchId} branches={branchList} lastChange={portalChange} /></section>
      <section className="card card-pad settings-section" id="giao-dien" aria-labelledby="giao-dien-title"><div className="section-head flush"><h2 id="giao-dien-title">Giao diện</h2></div>
        <AppearanceForm initial={parseAppearance(cookieStore.get(APPEARANCE_COOKIE)?.value)} /></section>
    </div>
  </div>;
}
