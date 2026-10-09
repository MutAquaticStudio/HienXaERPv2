import { AppError } from "@/lib/core/errors";
import type { PriceRule } from "@/modules/pricing/resolve-price";
/** A final unit selling price, not a discount applied to purchase cost. */
export function finalSellingPriceReason(price: string, reason: string, reference: PriceRule | null): string {
 if (!/^[1-9]\d*$/.test(price) || price.length>19 || BigInt(price)>9223372036854775807n) throw new AppError({code:"VALIDATION_FAILED",message:"Giá bán cuối phải là số VND nguyên dương trong giới hạn.",status:422});
 const note=reason.trim();
 if (note) {
  if (note.length<3 || note.length>500) throw new AppError({code:"VALIDATION_FAILED",message:"Lý do ngoại lệ cần từ 3 đến 500 ký tự.",status:422});
  return note;
 }
 if (!reference || BigInt(price)>BigInt(reference.unitPriceVnd)) throw new AppError({code:"VALIDATION_FAILED",message:"Không có giá tham chiếu hoặc giá cuối cao hơn giá hệ thống: mở Ghi chú ngoại lệ giá và ghi lý do được duyệt.",status:422});
 return JSON.stringify({adjustment:"SALE_FINAL_UNIT_PRICE",reasonSource:"SYSTEM",beforeVnd:reference.unitPriceVnd,afterVnd:price,ruleId:reference.id,ruleVersion:reference.version});
}
