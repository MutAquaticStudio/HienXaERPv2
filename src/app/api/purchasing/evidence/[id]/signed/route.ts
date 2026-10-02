import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveInternalAccess } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";

function failure(status: number) {
  return NextResponse.json({ error: "Không thể mở minh chứng." }, { status, headers: { "cache-control": "private, no-store" } });
}

export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  const { id } = await route.params;
  if (!z.uuid().safeParse(id).success) return failure(404);
  let access: Awaited<ReturnType<typeof resolveInternalAccess>>;
  try {
    access = await resolveInternalAccess();
  } catch (error) {
    return failure(error instanceof AppError ? error.status : 503);
  }
  if (!access.permissions.has("purchasing.read") || !access.permissions.has("evidence.manage")) return failure(404);
  const supabase = await createServerSupabase();
  const [evidenceResult, receiptResult, fulfillmentResult] = await Promise.all([
    supabase.from("evidence_objects").select("bucket_name,object_path").eq("id", id).eq("branch_id", access.branchId).eq("bucket_name", "inventory-evidence").eq("upload_state", "VERIFIED").maybeSingle(),
    supabase.from("purchase_receipts").select("id").eq("branch_id", access.branchId).eq("evidence_object_id", id).limit(1),
    supabase.from("supplier_fulfillments").select("id").eq("branch_id", access.branchId).eq("evidence_object_id", id).limit(1),
  ]);
  if (evidenceResult.error || receiptResult.error || fulfillmentResult.error) return failure(503);
  if (!evidenceResult.data || (!receiptResult.data?.length && !fulfillmentResult.data?.length)) return failure(404);
  const { data, error } = await supabase.storage.from(evidenceResult.data.bucket_name).createSignedUrl(evidenceResult.data.object_path, 60);
  if (error || !data?.signedUrl) return failure(503);
  const response = NextResponse.redirect(data.signedUrl);
  response.headers.set("cache-control", "private, no-store");
  return response;
}
