import { loadCompanyLogo } from "@/lib/company/profile";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * The company logo set in Cài đặt → Thông tin doanh nghiệp, for the top bar and (D49) the sign-in screens, so it is
 * served before signing in too: the database lets anon read only the logo columns, never the other company details.
 * The page links it with ?v=<sha256>, so a new logo is a new address and the old one may be kept.
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const logo = await loadCompanyLogo(supabase);
  if (!logo) return new Response("Chưa có logo.", { status: 404 });
  const versioned = new URL(request.url).searchParams.get("v") === logo.sha256;
  return new Response(Buffer.from(logo.base64, "base64"), { headers: {
    "content-type": logo.mime,
    "cache-control": versioned ? "private, max-age=31536000, immutable" : "private, no-cache",
    "x-content-type-options": "nosniff",
  } });
}
