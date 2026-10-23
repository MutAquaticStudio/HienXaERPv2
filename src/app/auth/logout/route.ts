import { createServerSupabase } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { logoutDestination } from "@/lib/auth/logout";

export async function POST(request: NextRequest) {
  let surface: FormDataEntryValue | null = null;
  try {
    surface = (await request.formData()).get("surface");
  } catch { /* no form body: back to the default tab */ }
  try {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  } finally {
    const response = NextResponse.redirect(new URL(logoutDestination(surface), request.url), 303);
    response.headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
    return response;
  }
}
