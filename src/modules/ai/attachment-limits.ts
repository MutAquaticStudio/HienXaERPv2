// D50: what may be attached to a question for the assistant. Shared by the chat (file picker, early checks) and the
// server (the real checks). D63: once answered, the files are kept in the person's own folder (ai-attachments) and shown again.
// The total stays under the Server Action body limit (next.config.ts) and Vercel's 4,5 MB request limit.

export const AI_ATTACHMENT_MAX_FILES = 5;
export const AI_ATTACHMENT_MAX_TOTAL_BYTES = 3_500_000;
/** Text of one spreadsheet / text file given to the assistant, at most (the rest is cut, and the assistant is told). */
export const AI_ATTACHMENT_MAX_TEXT_CHARS = 150_000;

export type AiAttachmentKind = "image" | "pdf" | "text" | "spreadsheet";
/** D63: a file of a chat turn as the chat shows it; `url` (signed, one hour, or a local preview) only for pictures and PDFs. */
export type AiTurnAttachment = { name: string; mime: string; size: number; url?: string };

const KINDS: Record<string, AiAttachmentKind> = {
  jpg: "image", jpeg: "image", png: "image", webp: "image", gif: "image",
  pdf: "pdf",
  txt: "text", csv: "text", md: "text",
  xlsx: "spreadsheet",
};

/** The `accept` attribute of the file picker. */
export const AI_ATTACHMENT_ACCEPT = Object.keys(KINDS).map((extension) => `.${extension}`).join(",");

export function attachmentKind(fileName: string): AiAttachmentKind | null {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  return KINDS[extension] ?? null;
}

/** The person-facing problem with a set of files, or null when they may be sent. */
export function attachmentProblem(files: readonly { name: string; size: number }[]): string | null {
  if (files.length > AI_ATTACHMENT_MAX_FILES) return `Đính kèm tối đa ${AI_ATTACHMENT_MAX_FILES} tệp mỗi câu hỏi.`;
  const unsupported = files.find((file) => !attachmentKind(file.name));
  if (unsupported) return `Chưa đọc được tệp "${unsupported.name}". Dùng ảnh (JPG, PNG, WEBP, GIF), PDF, Excel (.xlsx), CSV hoặc TXT.`;
  const empty = files.find((file) => file.size === 0);
  if (empty) return `Tệp "${empty.name}" trống.`;
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > AI_ATTACHMENT_MAX_TOTAL_BYTES) return "Các tệp đính kèm vượt quá 3,5 MB. Bớt tệp hoặc giảm dung lượng ảnh rồi gửi lại.";
  return null;
}
