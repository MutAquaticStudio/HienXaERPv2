const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", heic: "image/heic", pdf: "application/pdf" };

/** The content type follows the stored file name; anything else is offered as a download, never rendered. */
export function evidenceContentType(objectPath: string) {
  const extension = objectPath.split(".").pop()?.toLowerCase() ?? "";
  return TYPES[extension] ?? "application/octet-stream";
}

/**
 * D97 (T-3): what the delivery-proofs bucket accepts (the same list and limit as the bucket in the database), checked before
 * anything is stored so a refused file never leaves an evidence record behind.
 */
export const DELIVERY_PROOF_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"] as const;
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export const DELIVERY_PROOF_REFUSED = "Chỉ nhận ảnh (JPG, PNG, WEBP, HEIC) hoặc PDF, tối đa 10 MB.";

export function deliveryProofAccepted(file: { type: string; size: number }) {
  return file.size > 0 && file.size <= EVIDENCE_MAX_BYTES && (DELIVERY_PROOF_TYPES as readonly string[]).includes(file.type);
}
