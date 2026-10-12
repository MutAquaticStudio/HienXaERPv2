import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { createPortalEvidenceStorage, finalizeVerifiedEvidence } from "@/modules/portal/evidence-storage";

import {
  authenticatedPortalClient,
  detectEvidenceMime,
  deterministicUuid,
  portalRpc,
} from "@/modules/portal/server";

type CreatedEvidence = { id: string; bucket_id: string; object_path: string; state: string };

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
    const bucket = createPortalEvidenceStorage().from(evidence.bucket_id);
    if (evidence.state !== "READY") {
      // A retry may have a stale PENDING receipt after the first upload committed.
      // Never replace that object: a duplicate must pass the stored-byte check below.
      const { error: uploadError } = await bucket.upload(evidence.object_path, bytes, { contentType: mimeType, upsert: false });
      if (uploadError && String(uploadError.statusCode) !== "409") throw new Error("Không thể tải minh chứng. Hãy thử lại.");
    }
    const { data: stored, error: downloadError } = await bucket.download(evidence.object_path);
    if (downloadError || !stored) throw new Error("Chưa đọc được tệp đã tải. Hãy thử lại.");
    const storedBytes = new Uint8Array(await stored.arrayBuffer());
    if (storedBytes.length !== file.size || detectEvidenceMime(storedBytes) !== mimeType ||
      createHash("sha256").update(storedBytes).digest("hex") !== checksum) {
      throw new Error("Tệp đã lưu không khớp minh chứng đã chọn.");
    }
    await finalizeVerifiedEvidence("PORTAL", {
      actorUuid: context.user.id, evidenceId: evidence.id, checksum,
      byteSize: storedBytes.length, operationId: finalizeOperationId,
    });
    return NextResponse.json({ evidenceId: evidence.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tải minh chứng thất bại" }, { status: 400 });
  }
}
