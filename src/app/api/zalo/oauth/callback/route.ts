import { NextResponse } from "next/server";
import { isAuthoritativeRejection } from "@/lib/core/command-outcome";
import { createServerSupabase } from "@/lib/supabase/server";
import { zaloMessage } from "@/modules/zalo/presentation";

/**
 * D47: Zalo sends the owner back here after "Cho phép" with a one-time code (10 minutes). The signed-in owner's session
 * calls complete_zalo_oauth, which checks the state, exchanges the code with the PKCE verifier kept in the database and
 * stores the tokens in Vault. The browser never sees a token; it lands back on Cài đặt → Zalo OA with the outcome.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = new URL("/admin/settings/zalo", url.origin);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const oaId = url.searchParams.get("oa_id") ?? "";
  if (!code || !state || code.length > 2000 || state.length > 200 || oaId.length > 40) {
    back.searchParams.set("error", zaloMessage("zalo_oauth_code_missing"));
    return NextResponse.redirect(back, { headers: { "cache-control": "no-store" } });
  }
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc("complete_zalo_oauth", { code, state_token: state, target_oa_id: oaId });
    if (error) back.searchParams.set("error", isAuthoritativeRejection(error.code) ? zaloMessage(error.message) : "Chưa xác định được kết quả kết nối. Tải lại trang để kiểm tra.");
    else back.searchParams.set("notice", "connected");
  } catch {
    back.searchParams.set("error", "Chưa xác định được kết quả kết nối. Tải lại trang để kiểm tra.");
  }
  return NextResponse.redirect(back, { headers: { "cache-control": "no-store" } });
}
