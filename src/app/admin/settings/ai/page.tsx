import Link from "next/link";

import { AiSettings, type AiKeyStatus } from "@/components/settings/ai-settings";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { environmentHasAiKey } from "@/modules/ai/api-key";

/** Cài đặt → Trợ lý AI (D50): the Claude API key, entered here instead of the server environment. */
export default async function AiSettingsPage() {
  await requireInternalPermission("ai.manage");
  const { data, error } = await (await createServerSupabase()).rpc("ai_api_key_status");
  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Cài đặt</p><h1>Trợ lý AI</h1>
      <p className="lede">Khóa API Claude của doanh nghiệp. Nhập hoặc thay khóa tại đây, không cần sửa cấu hình máy chủ.</p></div>
      <div className="form-actions"><Link className="button button-secondary" href="/admin/ai">Mở trợ lý AI</Link>
        <Link className="button button-secondary" href="/admin/settings">Về cài đặt</Link></div></header>
    {error || !data ? <p className="form-message" role="alert">Chưa tải được cài đặt trợ lý AI. Tải lại trang.</p>
      : <AiSettings status={data as AiKeyStatus} environmentKey={environmentHasAiKey()} />}
  </div>;
}
