import Link from "next/link";

import { AiSettings, type AiKeyStatus } from "@/components/settings/ai-settings";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { environmentHasAiKey } from "@/modules/ai/api-key";
import { AiUsageCard } from "@/modules/ai/usage-card";
import type { Metadata } from "next";
import { Breadcrumb } from "@/components/ui/breadcrumb";

export const metadata: Metadata = { title: "Trợ lý AI · Cài đặt" };

/** Cài đặt → Trợ lý AI (D50): the Claude API key, entered here instead of the server environment. */
export default async function AiSettingsPage() {
  const access = await requireInternalPermission("ai.manage");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("ai_api_key_status");
  return <div className="page-stack">
    <Breadcrumb parent={{ href: "/admin/settings", label: "Cài đặt" }} current="Trợ lý AI" />
    <header className="page-heading"><div><h1>Trợ lý AI</h1>
      <p className="lede">Khóa API Claude của doanh nghiệp. Nhập hoặc thay khóa tại đây, không cần sửa cấu hình máy chủ.</p></div>
      <Link className="button button-secondary" href="/admin/messages?ai=1">Mở trợ lý AI</Link></header>
    {error || !data ? <p className="form-message" role="alert">Chưa tải được cài đặt trợ lý AI. Tải lại trang.</p>
      : <AiSettings status={data as AiKeyStatus} environmentKey={environmentHasAiKey()} />}
    <AiUsageCard supabase={supabase} branchId={access.branchId} />
  </div>;
}
