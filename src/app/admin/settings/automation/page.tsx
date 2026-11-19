import { AutomationRules } from "@/components/settings/automation-rules";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import type { AutomationOverview } from "@/modules/settings/automation-presentation";
import type { Metadata } from "next";
import { Breadcrumb } from "@/components/ui/breadcrumb";

export const metadata: Metadata = { title: "Quy tắc tự động · Cài đặt" };

/** Cài đặt → Quy tắc tự động (F5): what is sent automatically, where to, and what was sent. */
export default async function AutomationSettingsPage() {
  const access = await requireInternalPermission("roles.manage");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("automation_overview", { target_branch_id: access.branchId });
  return <div className="page-stack">
    <Breadcrumb parent={{ href: "/admin/settings", label: "Cài đặt" }} current="Quy tắc tự động" />
    <header className="page-heading"><div><h1>Quy tắc tự động</h1>
      <p className="lede">Mọi thông báo hệ thống gửi, ở một chỗ: khi nào gửi, ai nhận, gửi qua đâu. “Có sẵn” do hệ thống tự gửi; “Quy tắc” do anh/chị đặt.</p></div></header>
    {error || !data ? <p className="form-message" role="alert">Chưa tải được danh sách thông báo. Thông báo vẫn được gửi bình thường — chỉ trang này chưa hiện được. Tải lại trang; nếu vẫn lỗi, báo kỹ thuật.</p> : <AutomationRules overview={data as AutomationOverview} />}
  </div>;
}
