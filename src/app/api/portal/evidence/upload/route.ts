import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import {
  authenticatedPortalClient,
  detectEvidenceMime,
  deterministicUuid,
  portalRpc,
} from "@/modules/portal/server";

type CreatedEvidence = { id: string; bucket_id: string; object_path: string };

export async function POST(request: Request) {
  const context = await authenticatedPortalClient();
  if (!context) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn" }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    const contextType = String(form.get("context") ?? "");
    const clientOperationId = String(form.get("operationId") ?? "");
    if (!(file instanceof File) || file.size < 1 || file.size > 10 * 1024 * 1024 || !clientOperationId) {
      throw new Error("Tệp minh chứng không hợp lệ");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = detectEvidenceMime(bytes);
    if (!mimeType) throw new Error("Chỉ chấp nhận JPEG, PNG hoặc PDF hợp lệ");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const createOperationId = deterministicUuid(clientOperationId + ":" + checksum + ":evidence:create");
    const finalizeOperationId = deterministicUuid(clientOperationId + ":" + checksum + ":evidence:finalize");
    const evidence = await portalRpc<CreatedEvidence>(context.supabase, "create_portal_evidence", {
      target_context_type: contextType,
      target_work_item_id: form.get("workItemId") ? String(form.get("workItemId")) : null,
      target_customer_id: form.get("customerId") ? String(form.get("customerId")) : null,
      target_mime_type: mimeType,
      target_byte_size: file.size,
      operation_id: createOperationId,
    });
    const { error: uploadError } = await context.supabase.storage
      .from(evidence.bucket_id)
      .upload(evidence.object_path, bytes, { contentType: mimeType, upsert: true });
    if (uploadError) throw new Error(uploadError.message);
    await portalRpc<string>(context.supabase, "finalize_portal_evidence", {
      target_evidence_id: evidence.id,
      target_checksum_sha256: checksum,
      target_byte_size: file.size,
      operation_id: finalizeOperationId,
    });
    return NextResponse.json({ evidenceId: evidence.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tải minh chứng thất bại" }, { status: 400 });
  }
}
