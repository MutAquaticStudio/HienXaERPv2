import { AppError } from "@/lib/core/errors";
import { reasonOrDefault } from "@/lib/core/reason";
import type { PriceRule } from "@/modules/pricing/resolve-price";
/** Note kept for a manual selling price saved without one (FB7: the note is optional). */
export const MANUAL_PRICE_NOTE = "Giá nhập tay";
/** A final unit selling price, not a discount applied to purchase cost. */
export function finalSellingPriceReason(price: string, reason: string, reference: PriceRule | null): string {
 if (!/^[1-9]\d*$/.test(price) || price.length>19 || BigInt(price)>9223372036854775807n) throw new AppError({code:"VALIDATION_FAILED",message:"Giá bán cuối phải là số VND nguyên dương trong giới hạn.",status:422});
 const note=reason.trim();
 if (note) return reasonOrDefault(note, MANUAL_PRICE_NOTE);
 if (!reference || BigInt(price)>BigInt(reference.unitPriceVnd)) return MANUAL_PRICE_NOTE;
 return JSON.stringify({adjustment:"SALE_FINAL_UNIT_PRICE",reasonSource:"SYSTEM",beforeVnd:reference.unitPriceVnd,afterVnd:price,ruleId:reference.id,ruleVersion:reference.version});
}
