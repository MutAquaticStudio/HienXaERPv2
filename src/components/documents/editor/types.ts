export type EditorUom = { id: string; symbol: string };
export type EditorMaterial = { id: string; code?: string; name: string; uoms: EditorUom[]; variant?: { groupId: string; name: string; label: string } };

/** One document line as the editor holds it; field names match the server FormData contract. */
export type EditorLine = {
  key: number;
  sourceLineId: string;
  materialId: string;
  uomId: string;
  quantity: string;
  manualPriceVnd: string;
  manualReason: string;
};

export type PricedLine = { unitPriceVnd: string; lineTotalVnd: string; sourceLabel: string };

export type EntityOption = { id: string; label: string; detail?: string };
