import Decimal from "decimal.js";
import type { EditorLine, EditorMaterial } from "./types";

export const MAX_DOCUMENT_LINES = 50;

/**
 * Adds a picked material: the same material in its default unit gets one more,
 * otherwise a new line with quantity 1. Returns the lines and the key to focus.
 */
export function addMaterialLine(lines: EditorLine[], material: EditorMaterial, nextKey: number): { lines: EditorLine[]; focusKey: number } | null {
  const uomId = material.uoms[0]?.id ?? "";
  const existing = lines.find((line) => line.materialId === material.id && line.uomId === uomId && !line.manualPriceVnd);
  if (existing) {
    let quantity: string;
    try { quantity = new Decimal(existing.quantity || "0").plus(1).toString(); }
    catch { quantity = existing.quantity; }
    return { lines: lines.map((line) => line.key === existing.key ? { ...line, quantity } : line), focusKey: existing.key };
  }
  if (lines.length >= MAX_DOCUMENT_LINES) return null;
  const line: EditorLine = { key: nextKey, sourceLineId: "", materialId: material.id, uomId, quantity: "1", manualPriceVnd: "", manualReason: "" };
  return { lines: [...lines, line], focusKey: nextKey };
}
