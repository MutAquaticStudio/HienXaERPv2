import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveInternalAccess } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";
import { evidenceContentType } from "@/modules/delivery/evidence-type";

export const runtime = "nodejs";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function failure(status: number) {
  return NextResponse.json({ error: "Không thể mở minh chứng." }, { status, headers: privateHeaders });
}

/**
 * FB11: delivery photos and documents uploaded inside the app ("Tải bằng chứng lên", "NCC đã giao", nhận hàng đơn mua),
 * streamed for people who manage evidence in the current branch. Storage RLS applies the same rule to the user's session;
 * the bytes are checked against the verified size and checksum before they are sent.
 */
export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  const { id } = await route.params;
  if (!z.guid().safeParse(id).success) return failure(404);
  let access: Awaited<ReturnType<typeof resolveInternalAccess>>;
  try {
    access = await resolveInternalAccess();
  } catch (error) {
    return failure(error instanceof AppError ? error.status : 503);
  }
  if (!access.permissions.has("evidence.manage")) return failure(404);
  try {
    const supabase = await createServerSupabase();
    const { data: evidence, error } = await supabase.from("evidence_objects")
      .select("bucket_name,object_path,checksum_sha256,byte_size")
      .eq("id", id).eq("branch_id", access.branchId).eq("upload_state", "VERIFIED").maybeSingle();
    if (error) return failure(503);
    if (!evidence || !["delivery-proofs", "inventory-evidence"].includes(evidence.bucket_name)) return failure(404);
    const { data, error: downloadError } = await supabase.storage.from(evidence.bucket_name).download(evidence.object_path);
    if (downloadError || !data) return failure(503);
    const bytes = await data.arrayBuffer();
    if (bytes.byteLength !== Number(evidence.byte_size)
      || createHash("sha256").update(new Uint8Array(bytes)).digest("hex") !== evidence.checksum_sha256) return failure(503);
    const type = evidenceContentType(evidence.object_path);
    return new NextResponse(bytes, {
      headers: {
        ...privateHeaders,
        "Content-Type": type,
        "Content-Disposition": type === "application/octet-stream" ? "attachment" : "inline",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch {
    return failure(503);
  }
}
