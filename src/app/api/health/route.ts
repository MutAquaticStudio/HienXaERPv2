import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "ok", service: "hien-xa-erp-v2",
    buildSha: process.env.HX_RELEASE_BUILD_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    // This is the application's required contract, not a live database health claim.
    requiredMigration: "20261011211846", gpsDevice: "DEFERRED", legalInvoice: "DEFERRED" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
