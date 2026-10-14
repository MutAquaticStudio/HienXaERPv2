import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { hasSameRequestOrigin } from "@/lib/core/request-origin";
import { AppError } from "@/lib/core/errors";
import { resolveInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { XlsxImportError, parseXlsx } from "@/modules/bulk-import/xlsx-parser";

const bucket = "bulk-import-private";
const maxJsonBytes = 16 * 1024;
const maxFileBytes = 10 * 1024 * 1024;
const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const maxDuration = 60;
const schema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("prepare"), kind: z.enum(["SO", "PO"]), runId: z.uuid() }),
  z.object({ step: z.literal("register"), kind: z.enum(["SO", "PO"]), runId: z.uuid(), fileId: z.uuid(), fileName: z.string().min(1).max(255), byteSize: z.number().int().min(1).max(maxFileBytes) }),
  z.object({ step: z.literal("verify"), kind: z.enum(["SO", "PO"]), runId: z.uuid(), fileId: z.uuid() }),
]);

function failure(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "cache-control": "private, no-store" } });
}

class RequestBodyError extends Error {
  constructor(readonly status: 400 | 413, message: string) { super(message); }
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxJsonBytes) throw new RequestBodyError(413, "Yêu cầu quá lớn.");
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError(400, "Yêu cầu JSON trống.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxJsonBytes) {
      void reader.cancel();
      throw new RequestBodyError(413, "Yêu cầu quá lớn.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, total)));
  } catch {
    throw new RequestBodyError(400, "Yêu cầu JSON không hợp lệ.");
  }
}

function invalidRequest(request: Request) {
  if (!hasSameRequestOrigin(request)) return failure("Nguồn yêu cầu không hợp lệ.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return failure("Định dạng yêu cầu không hợp lệ.", 415);
  return null;
}

async function authorize(kind: "SO" | "PO") {
  const access = await resolveInternalAccess();
  const required = kind === "SO" ? ["orders.create", "orders.read"] : ["purchasing.create", "purchasing.read", "purchasing.price.read"];
  if (required.some((permission) => !access.permissions.has(permission))) throw new AppError({ code: "FORBIDDEN", message: "Bạn không có quyền nhập loại chứng từ này.", status: 403 });
  const supabase = await createServerSupabase();
  const { data: enabled, error } = await supabase.rpc("bulk_import_feature_status", { target_branch_id: access.branchId, target_kind: kind });
  if (error) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Không thể kiểm tra tính năng nhập tệp.", status: 503 });
  if (enabled !== true || process.env.HX_BULK_IMPORT_ENABLED !== "true") throw new AppError({ code: "FORBIDDEN", message: "Tính năng nhập tệp chưa được bật cho chi nhánh này.", status: 404 });
  return { access, supabase };
}

export async function POST(request: Request) {
  const invalid = invalidRequest(request);
  if (invalid) return invalid;
  try {
    const input = schema.safeParse(await readBoundedJson(request));
    if (!input.success || input.data.step === "verify") return failure("Thông tin thao tác nhập chưa hợp lệ.", 400);
    const { access, supabase } = await authorize(input.data.kind);
    if (input.data.step === "prepare") return NextResponse.json({ ready: true }, { headers: { "cache-control": "private, no-store" } });
    if (!input.data.fileName.toLowerCase().endsWith(".xlsx") || /[\u0000-\u001f/\\]/.test(input.data.fileName)) return failure("Chỉ chấp nhận tên tệp Excel .xlsx hợp lệ.", 400);
    const { data: file, error: fileError } = await supabase.rpc("register_bulk_import_file", {
      target_run_id: input.data.runId, target_file_id: input.data.fileId,
      target_file_name: input.data.fileName, target_byte_size: input.data.byteSize,
      target_branch_id: access.branchId, target_kind: input.data.kind,
    });
    if (fileError || !file) return failure("Không thể đăng ký tệp nhập.", 409);
    if (file.upload_state === "VERIFIED") return NextResponse.json({ runId: input.data.runId, fileId: input.data.fileId, alreadyVerified: true }, { headers: { "cache-control": "private, no-store" } });
    const { data: signed, error: signedError } = await supabase.storage.from(bucket).createSignedUploadUrl(String(file.object_path), { upsert: false });
    if (signedError || !signed?.token) return failure("Không thể chuẩn bị tải tệp.", 502);
    return NextResponse.json({ runId: input.data.runId, fileId: input.data.fileId, bucket, objectPath: file.object_path, token: signed.token, contentType: xlsxMime }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof RequestBodyError) return failure(error.message, error.status);
    if (error instanceof AppError) return failure(error.message, error.status);
    return failure("Không thể chuẩn bị lần nhập.", 503);
  }
}

export async function PATCH(request: Request) {
  const invalid = invalidRequest(request);
  if (invalid) return invalid;
  try {
    const input = schema.safeParse(await readBoundedJson(request));
    if (!input.success || input.data.step !== "verify") return failure("Thông tin xác minh tệp chưa hợp lệ.", 400);
    const { access, supabase } = await authorize(input.data.kind);
    const { data, error } = await supabase.rpc("get_bulk_import_run", { target_run_id: input.data.runId });
    if (error || !data) return failure("Không tìm thấy lần nhập.", 404);
    if (data.branch_id !== access.branchId || data.document_kind !== input.data.kind) return failure("Lần nhập không thuộc chi nhánh hoặc loại chứng từ hiện tại.", 403);
    const files = Array.isArray(data.files) ? data.files : [];
    const fileId = input.data.fileId;
    const file = files.find((candidate: { file_id?: string }) => candidate.file_id === fileId);
    if (!file || file.upload_state === "EXPIRED") return failure("Tệp không còn khả dụng.", 404);
    const { data: downloaded, error: downloadError } = await supabase.storage.from(bucket).download(String(file.object_path ?? ""));
    if (downloadError || !downloaded) return failure("Chưa tìm thấy tệp đã tải. Hãy thử lại.", 409);
    const bytes = Buffer.from(await downloaded.arrayBuffer());
    if (bytes.length < 1 || bytes.length > maxFileBytes || bytes.length !== Number(file.byte_size)) return failure("Dung lượng tệp tải lên không khớp.", 409);
    let workbook;
    try { workbook = await parseXlsx(bytes); }
    catch (error) { return failure(error instanceof XlsxImportError ? error.message : "Không thể đọc an toàn tệp Excel.", 400); }
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const { error: finishError } = await supabase.rpc("finish_bulk_import_upload", {
      target_file_id: input.data.fileId, target_byte_size: bytes.length, target_checksum_sha256: checksum,
    });
    if (finishError) return failure("Không thể xác nhận tệp đã tải. Hãy thử lại cùng lần nhập.", 409);
    return NextResponse.json({ runId: input.data.runId, fileId: input.data.fileId, checksum,
      workbook: { totalRows: workbook.totalRows, hiddenRows: workbook.hiddenRows,
        worksheets: workbook.worksheets.map((sheet, index) => ({ index, name: sheet.name, hidden: sheet.hidden,
          rows: sheet.rows.slice(0, 25).map((row) => ({ rowNumber: row.rowNumber, hidden: row.hidden, cells: row.cells.map((cell) => cell?.value ?? "") })) })) },
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof RequestBodyError) return failure(error.message, error.status);
    if (error instanceof AppError) return failure(error.message, error.status);
    return failure("Không thể xác minh tệp nhập.", 503);
  }
}
