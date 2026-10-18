import Link from "next/link";
import { AutomationRules } from "@/components/settings/automation-rules";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import type { AutomationOverview } from "@/modules/settings/automation-presentation";

/** Cài đặt → Quy tắc tự động (F5): what is sent automatically, where to, and what was sent. */
export default async function AutomationSettingsPage() {
  const access = await requireInternalPermission("roles.manage");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("automation_overview", { target_branch_id: access.branchId });
  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Cài đặt · {access.branchName}</p><h1>Quy tắc tự động</h1>
      <p className="lede">Tự báo việc cần làm về điện thoại, Telegram, email hoặc hệ thống khác — không cần dịch vụ trả phí.</p></div>
      <Link className="button button-secondary" href="/admin/settings">Về cài đặt</Link></header>
    {error || !data ? <p className="form-message" role="alert">Chưa tải được quy tắc tự động. Tải lại trang.</p> : <AutomationRules overview={data as AutomationOverview} />}
  </div>;
}
