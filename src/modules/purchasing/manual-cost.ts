import { AppError } from "@/lib/core/errors";
import { reasonOrDefault } from "@/lib/core/reason";
type Reference = { id: string; version: number; unitCostVnd: string };
/** Note kept for a manual purchase cost saved without one (FB7: the note is optional). */
export const MANUAL_COST_NOTE = "Giá mua nhập tay";
export function finalPurchaseCostReason(price: string, reason: string, reference: Reference | null): string {
 if (!/^[1-9]\d*$/.test(price) || price.length>19 || BigInt(price)>9223372036854775807n) throw new AppError({code:"VALIDATION_FAILED",message:"Giá mua phải là số VND nguyên dương hợp lệ.",status:422});
 const note=reason.trim();
 if(note)return reasonOrDefault(note,MANUAL_COST_NOTE);
 if(!reference||BigInt(price)>BigInt(reference.unitCostVnd))return MANUAL_COST_NOTE;
 return JSON.stringify({adjustment:"PURCHASE_FINAL_UNIT_COST",reasonSource:"SYSTEM",beforeVnd:reference.unitCostVnd,afterVnd:price,ruleId:reference.id,ruleVersion:reference.version});
}
