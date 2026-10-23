import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveInternalAccess } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";
import { finalizeVerifiedEvidence } from "@/modules/portal/evidence-storage";
import { detectEvidenceMime } from "@/modules/portal/server";
import { hasSameRequestOrigin } from "@/lib/core/request-origin";

const bucket = "inventory-evidence";
const maxBytes = 10 * 1024 * 1024;
const maxJsonBytes = 16 * 1024;
const prepareSchema = z.object({
  purchaseOrderId: z.guid(), createOperationId: z.guid(),
  fileName: z.string().min(1).max(255), byteSize: z.number().int().min(1).max(maxBytes),
});
const finalizeSchema = z.object({
  purchaseOrderId: z.guid(), createOperationId: z.guid(), evidenceId: z.guid(), finalizeOperationId: z.guid(),
  byteSize: z.number().int().min(1).max(maxBytes), checksumSha256: z.string().regex(/^[0-9a-f]{64}$/),
});

function failure(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "cache-control": "private, no-store" } });
}

function invalidRequest(request: Request) {
  if (!hasSameRequestOrigin(request)) return failure("Nguồn yêu cầu không hợp lệ.", 403);
  if (Number(request.headers.get("content-length") ?? 0) > maxJsonBytes) return failure("Yêu cầu quá lớn.", 413);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return failure("Định dạng yêu cầu không hợp lệ.", 415);
  return null;
}

function fileExtension(name: string) {
  const extension = name.toLowerCase().match(/\.([a-z]+)$/)?.[1];
  if (extension === "jpeg") return "jpg";
  return extension === "png" || extension === "jpg" || extension === "pdf" ? extension : null;
}

export async function POST(request: Request) {
  const invalid = invalidRequest(request);
  if (invalid) return invalid;
  let access: Awaited<ReturnType<typeof resolveInternalAccess>>;
  try { access = await resolveInternalAccess(); }
  catch (error) { return failure("Không có quyền tải minh chứng.", error instanceof AppError ? error.status : 503); }
  if (!access.permissions.has("inventory.receive") || !access.permissions.has("evidence.manage")) return failure("Không có quyền tải minh chứng.", 403);

  try {
    const parsed = prepareSchema.safeParse(await request.json());
    if (!parsed.success) return failure("Thông tin tệp minh chứng không hợp lệ.", 400);
    const extension = fileExtension(parsed.data.fileName);
    if (!extension) return failure("Chỉ chấp nhận PNG, JPEG hoặc PDF.", 400);
    const supabase = await createServerSupabase();
    const { data: order, error: orderError } = await supabase.from("purchase_order_read").select("id")
      .eq("id", parsed.data.purchaseOrderId).eq("branch_id", access.branchId).in("state", ["DRAFT", "CONFIRMED"]).maybeSingle();
    if (orderError) return failure("Không thể kiểm tra đơn mua.", 503);
    if (!order) return failure("Đơn mua không còn nhận hàng được.", 404);

    const objectPath = access.branchId + "/purchase-orders/" + parsed.data.purchaseOrderId + "/" + parsed.data.createOperationId + "." + extension;
    const { data: evidenceId, error: createError } = await supabase.rpc("create_evidence_upload", {
      target_branch_id: access.branchId, bucket_name: bucket, object_path: objectPath,
      audience: "INTERNAL", operation_id: parsed.data.createOperationId,
    });
    if (createError || typeof evidenceId !== "string") return failure("Không thể đăng ký minh chứng.", 502);
    const { data: evidence, error: evidenceError } = await supabase.from("evidence_objects")
      .select("upload_state").eq("id", evidenceId).eq("branch_id", access.branchId).maybeSingle();
    if (evidenceError || !evidence) return failure("Không thể kiểm tra minh chứng.", 502);
    if (evidence.upload_state === "VERIFIED") {
      const { data: verified, error: statusError } = await supabase.rpc("evidence_verified_storage_status", { target_evidence_id: evidenceId });
      if (statusError) return failure("Không thể kiểm tra tệp đã lưu.", 503);
      if (verified) return NextResponse.json({ evidenceId, objectPath, alreadyVerified: true }, { headers: { "cache-control": "private, no-store" } });
      // Legacy metadata needs a stored-byte check before it can be used as proof.
      // PATCH downloads the existing object without replacing it.
      return NextResponse.json({ evidenceId, objectPath, alreadyVerified: true, needsVerification: true }, { headers: { "cache-control": "private, no-store" } });
    }
    const { data: signed, error: signedError } = await supabase.storage.from(bucket).createSignedUploadUrl(objectPath);
    if (signedError || !signed?.token) return failure("Không thể chuẩn bị tải tệp.", 502);
    return NextResponse.json({ evidenceId, objectPath, token: signed.token, alreadyVerified: false }, { headers: { "cache-control": "private, no-store" } });
  } catch { return failure("Không thể chuẩn bị tải minh chứng.", 400); }
}

export async function PATCH(request: Request) {
  const invalid = invalidRequest(request);
  if (invalid) return invalid;
  let access: Awaited<ReturnType<typeof resolveInternalAccess>>;
  try { access = await resolveInternalAccess(); }
  catch (error) { return failure("Không có quyền tải minh chứng.", error instanceof AppError ? error.status : 503); }
  if (!access.permissions.has("inventory.receive") || !access.permissions.has("evidence.manage")) return failure("Không có quyền tải minh chứng.", 403);

  try {
    const parsed = finalizeSchema.safeParse(await request.json());
    if (!parsed.success) return failure("Thông tin xác minh tệp không hợp lệ.", 400);
    const supabase = await createServerSupabase();
    const { data: evidence, error: evidenceError } = await supabase.from("evidence_objects")
      .select("object_path,upload_state,checksum_sha256,byte_size")
      .eq("id", parsed.data.evidenceId).eq("branch_id", access.branchId).eq("bucket_name", bucket).maybeSingle();
    if (evidenceError) return failure("Không thể kiểm tra minh chứng.", 503);
    if (!evidence) return failure("Không tìm thấy minh chứng.", 404);
    const prefix = access.branchId + "/purchase-orders/" + parsed.data.purchaseOrderId + "/" + parsed.data.createOperationId + ".";
    const extension = evidence.object_path.startsWith(prefix) ? evidence.object_path.slice(prefix.length) : "";
    if (!["png", "jpg", "pdf"].includes(extension)) return failure("Minh chứng không thuộc đơn mua này.", 404);

    const { data: file, error: downloadError } = await supabase.storage.from(bucket).download(evidence.object_path);
    if (downloadError || !file) return failure("Chưa tìm thấy tệp đã tải. Hãy thử lại.", 409);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = detectEvidenceMime(bytes);
    const actualExtension = mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : mime === "application/pdf" ? "pdf" : null;
    if (!actualExtension || actualExtension !== extension || bytes.length < 1 || bytes.length > maxBytes) {
      return failure("Tệp phải là PNG, JPEG hoặc PDF hợp lệ và không vượt quá 10 MB.", 400);
    }
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== parsed.data.byteSize || checksum !== parsed.data.checksumSha256 ||
      (evidence.upload_state === "VERIFIED" && (evidence.checksum_sha256 !== checksum || Number(evidence.byte_size) !== bytes.length))) {
      return failure("Tệp đã tải không khớp lựa chọn hiện tại.", 409);
    }
    const { data: actor, error: actorError } = await supabase.auth.getUser();
    if (actorError || !actor.user) return failure("Phiên đăng nhập đã hết hạn.", 401);
    await finalizeVerifiedEvidence("INTERNAL", {
      actorUuid: actor.user.id, evidenceId: parsed.data.evidenceId, checksum,
      byteSize: bytes.length, operationId: parsed.data.finalizeOperationId,
    });
    return NextResponse.json({ evidenceId: parsed.data.evidenceId }, { headers: { "cache-control": "private, no-store" } });
  } catch { return failure("Không thể xác minh minh chứng.", 400); }
}
