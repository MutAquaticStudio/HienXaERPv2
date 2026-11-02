import { createServerSupabase } from "@/lib/supabase/server";
import { loadCompanyLogoUrl } from "./profile";

/** D49: the logo for the sign-in screens, readable before signing in; any failure just keeps the "HX" mark. */
export async function loadSignInLogoUrl(): Promise<string | null> {
  try {
    return await loadCompanyLogoUrl(await createServerSupabase());
  } catch {
    return null;
  }
}
