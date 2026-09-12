import { createServerSupabase } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  } finally {
    const response = NextResponse.redirect(new URL("/login", request.url), 303);
    response.headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
    return response;
  }
}
