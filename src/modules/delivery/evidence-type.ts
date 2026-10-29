const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", heic: "image/heic", pdf: "application/pdf" };

/** The content type follows the stored file name; anything else is offered as a download, never rendered. */
export function evidenceContentType(objectPath: string) {
  const extension = objectPath.split(".").pop()?.toLowerCase() ?? "";
  return TYPES[extension] ?? "application/octet-stream";
}
