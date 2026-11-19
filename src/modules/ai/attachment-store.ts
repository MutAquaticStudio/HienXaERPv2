import "server-only";

// D63: files sent to the assistant are kept in the private "ai-attachments" bucket, under <auth user>/<operation>/, with the
// person's own session (Storage policies let each person write and read only their own folder). Kept so the chat can show
// the picture again; a file that cannot be uploaded is simply listed by name, as before.
import type { createServerSupabase } from "@/lib/supabase/server";
import type { AiTurnAttachment } from "@/modules/ai/attachment-limits";
import type { ReadAttachment } from "@/modules/ai/attachments";

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;
export const AI_ATTACHMENT_BUCKET = "ai-attachments";
export type StoredAttachment = { path: string; name: string; mime: string; size: number };

/** A storage-safe file name: no folders, accents or odd characters, short. */
export function safeObjectName(name: string): string {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return (cleaned || "tep").slice(-80);
}

export async function storeAttachments(supabase: Supabase, authUserId: string, operationId: string, files: readonly ReadAttachment[]): Promise<StoredAttachment[]> {
  const kept: StoredAttachment[] = [];
  for (const [index, file] of files.entries()) {
    const path = `${authUserId}/${operationId}/${index + 1}-${safeObjectName(file.name)}`;
    try {
      const { error } = await supabase.storage.from(AI_ATTACHMENT_BUCKET).upload(path, file.bytes, { contentType: file.mime, upsert: false });
      if (!error) kept.push({ path, name: file.name.slice(0, 200), mime: file.mime, size: file.bytes.byteLength });
    } catch { /* kept by name only */ }
  }
  return kept;
}

const viewable = (mime: string) => mime.startsWith("image/") || mime === "application/pdf";

/** The chat's view of kept files: pictures and PDFs get a link valid for one hour. */
export async function attachmentViews(supabase: Supabase, items: readonly StoredAttachment[]): Promise<AiTurnAttachment[]> {
  const paths = items.filter((item) => viewable(item.mime)).map((item) => item.path);
  const urls = new Map<string, string>();
  if (paths.length) {
    try {
      const { data } = await supabase.storage.from(AI_ATTACHMENT_BUCKET).createSignedUrls(paths, 3600);
      for (const row of data ?? []) if (row.path && row.signedUrl) urls.set(row.path, row.signedUrl);
    } catch { /* shown by name */ }
  }
  return items.map((item) => ({ name: item.name, mime: item.mime, size: item.size, ...(urls.has(item.path) ? { url: urls.get(item.path) } : {}) }));
}
