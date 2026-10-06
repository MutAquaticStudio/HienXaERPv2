import { NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export function GET() {
  if (!process.env.HX_QA_PROJECT_REF || process.env.HX_QA_RUNTIME_APPROVED !== "true") {
    return new NextResponse(null, { status: 404 });
  }
  getSupabaseConfig();
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.HX_QA_BUILD_SHA ?? "";
  const fingerprint = process.env.HX_QA_CANDIDATE_FINGERPRINT ?? "";
  if (!/^[a-f0-9]{40}$/.test(commit) || !/^[a-f0-9]{64}$/.test(fingerprint)) {
    return new NextResponse("QA candidate metadata is not pinned.", { status: 503 });
  }
  return new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="robots" content="noindex,nofollow"><title>Hien Xa QA candidate</title></head>
<body><main><h1>QA candidate identity</h1><dl>
<dt>Commit</dt><dd>${commit}</dd>
<dt>Candidate fingerprint</dt><dd>${fingerprint}</dd>
<dt>QA project</dt><dd>${process.env.HX_QA_PROJECT_REF}</dd>
<dt>E-invoice</dt><dd>disabled</dd>
</dl></main></body></html>`, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
