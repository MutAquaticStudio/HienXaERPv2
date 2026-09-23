import { NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export function GET() {
  if (!process.env.HX_QA_PROJECT_REF || process.env.HX_QA_RUNTIME_APPROVED !== "true") {
    return new NextResponse(null, { status: 404 });
  }
  getSupabaseConfig();
  return NextResponse.json({ projectRef: process.env.HX_QA_PROJECT_REF, einvoiceEnabled: false,
    buildSha: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.HX_QA_BUILD_SHA ?? "local-unpinned" }, {
    headers: { "cache-control": "private, no-store" },
  });
}
