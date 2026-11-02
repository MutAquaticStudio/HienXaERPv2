import Link from "next/link";
import { ZaloSettings } from "@/components/settings/zalo-settings";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ZaloStatus } from "@/modules/zalo/presentation";

/** Cài đặt → Zalo OA (D47): tin Zalo tự động cho khách qua số điện thoại (ZBS Template Message). */
export default async function ZaloSettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  await requireInternalPermission("roles.manage");
  const [query, supabase] = await Promise.all([searchParams, createServerSupabase()]);
  const { data, error } = await supabase.rpc("zalo_status");
  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Cài đặt</p><h1>Zalo OA</h1>
      <p className="lede">Tự gửi tin Zalo cho khách khi đơn được xác nhận, đã giao hàng, đã nhận tiền và nhắc công nợ.</p></div>
      <Link className="button button-secondary" href="/admin/settings">Về cài đặt</Link></header>
    {query.notice === "connected" ? <p className="form-message success" role="status">Đã kết nối Zalo OA. Nhập mã mẫu tin đã duyệt rồi bật từng loại tin.</p>
      : query.error ? <p className="form-message" role="alert">{query.error.slice(0, 300)}</p> : null}
    {error || !data ? <p className="form-message" role="alert">Chưa tải được cài đặt Zalo OA. Tải lại trang.</p> : <ZaloSettings status={data as ZaloStatus} />}
  </div>;
}
