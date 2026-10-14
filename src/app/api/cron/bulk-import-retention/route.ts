import { timingSafeEqual } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getSupabaseConfig } from "@/lib/supabase/config";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const bucket = "bulk-import-private";
const batchSize = 100;
const maxBatches = 5;

type ExpiredFile = { file_id: string; bucket_id: string; object_path: string };

function authorized(request: Request, secret: string) {
  const header = request.headers.get("authorization") ?? "";
  const provided = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!cronSecret || !serviceKey) return NextResponse.json({ error: "Retention service is not configured." }, { status: 503, headers: { "cache-control": "no-store" } });
  if (!authorized(request, cronSecret)) return NextResponse.json({ error: "Forbidden." }, { status: 403, headers: { "cache-control": "no-store" } });

  try {
    const { url } = getSupabaseConfig();
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    let scanned = 0;
    let deleted = 0;
    const failures: { fileId: string; stage: string }[] = [];
    for (let batch = 0; batch < maxBatches; batch += 1) {
      const { data, error } = await supabase.rpc("list_expired_bulk_import_files", { target_limit: batchSize });
      if (error) return NextResponse.json({ error: "Không thể đọc hàng đợi tệp hết hạn.", scanned, deleted }, { status: 503, headers: { "cache-control": "no-store" } });
      const files = (data ?? []) as ExpiredFile[];
      if (!files.length) break;
      scanned += files.length;
      for (const file of files) {
        if (file.bucket_id !== bucket || !file.object_path) { failures.push({ fileId: file.file_id, stage: "invalid_record" }); continue; }
        const { error: storageError } = await supabase.storage.from(bucket).remove([file.object_path]);
        if (storageError) { failures.push({ fileId: file.file_id, stage: "storage_delete" }); continue; }
        const { error: markError } = await supabase.rpc("mark_bulk_import_file_deleted", { target_file_id: file.file_id });
        if (markError) { failures.push({ fileId: file.file_id, stage: "database_mark" }); continue; }
        deleted += 1;
      }
      if (files.length < batchSize) break;
    }
    return NextResponse.json({ scanned, deleted, failed: failures.length, failures }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Không thể chạy dọn tệp hết hạn." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
