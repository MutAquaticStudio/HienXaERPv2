import { ZaloSettings } from "@/components/settings/zalo-settings";
import { requireInternalPermission } from "@/lib/access/context";
import { appOrigin } from "@/lib/auth/app-origin";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ZaloStatus } from "@/modules/zalo/presentation";
import type { Metadata } from "next";
import { Breadcrumb } from "@/components/ui/breadcrumb";

export const metadata: Metadata = { title: "Zalo OA · Cài đặt" };

/** The callback sends a sentence in Vietnamese; anything else in the link (a code, a crafted text) shows as a plain failure. */
function zaloCallbackError(value: string) {
  const text = value.slice(0, 300);
  return /[À-ỹ]/.test(text) && !/https?:|www\./i.test(text) ? text : "Chưa kết nối được Zalo OA. Thử kết nối lại.";
}

/** Cài đặt → Zalo OA (D47): tin Zalo tự động cho khách qua số điện thoại (ZBS Template Message). */
export default async function ZaloSettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  await requireInternalPermission("roles.manage");
  const [query, supabase, origin] = await Promise.all([searchParams, createServerSupabase(), appOrigin()]);
  const { data, error } = await supabase.rpc("zalo_status");
  return <div className="page-stack">
    <Breadcrumb parent={{ href: "/admin/settings", label: "Cài đặt" }} current="Zalo OA" />
    <header className="page-heading"><div><h1>Zalo OA</h1>
      <p className="lede">Tự gửi tin Zalo cho khách khi đơn được xác nhận, đã giao hàng, đã nhận tiền và nhắc công nợ.</p></div></header>
    {query.notice === "connected" ? <p className="form-message success" role="status">Đã kết nối Zalo OA. Nhập mã mẫu tin đã duyệt rồi bật từng loại tin.</p>
      : query.error ? <p className="form-message" role="alert">{zaloCallbackError(query.error)}</p> : null}
    {error || !data ? <p className="form-message" role="alert">Chưa tải được cài đặt Zalo OA. Tải lại trang.</p> : <ZaloSettings status={data as ZaloStatus} callbackUrl={`${origin}/api/zalo/oauth/callback`} />}
  </div>;
}
