/** A unit a line can use; `ratio` is "1 unit = numerator/denominator base units" when known (base unit 1/1). */
export type EditorUom = { id: string; symbol: string; ratio?: { numerator: string; denominator: string } };
export type EditorMaterial = { id: string; code?: string; name: string; uoms: EditorUom[]; variant?: { groupId: string; name: string; label: string }; /** Material group, used to group the drop-down list. */ group?: string };

/** One document line as the editor holds it; field names match the server FormData contract. */
export type EditorLine = {
  key: number;
  sourceLineId: string;
  materialId: string;
  uomId: string;
  quantity: string;
  manualPriceVnd: string;
  manualReason: string;
  /** Sales line discount as typed: "AMOUNT" (VND per unit) or "PERCENT", with its value. */
  discountMode?: "" | "AMOUNT" | "PERCENT";
  discountValue?: string;
};

export type PricedLine = { unitPriceVnd: string; lineTotalVnd: string; sourceLabel: string };

export type EntityOption = { id: string; label: string; detail?: string };
