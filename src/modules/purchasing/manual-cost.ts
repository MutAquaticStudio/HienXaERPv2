import { AppError } from "@/lib/core/errors";
type Reference = { id: string; version: number; unitCostVnd: string };
export function finalPurchaseCostReason(price: string, reason: string, reference: Reference | null): string {
 if (!/^[1-9]\d*$/.test(price) || price.length>19 || BigInt(price)>9223372036854775807n) throw new AppError({code:"VALIDATION_FAILED",message:"Giá mua phải là số VND nguyên dương hợp lệ.",status:422});
 const note=reason.trim();
 if(note){if(note.length<3||note.length>500)throw new AppError({code:"VALIDATION_FAILED",message:"Lý do ngoại lệ cần từ 3 đến 500 ký tự.",status:422});return note;}
 if(!reference||BigInt(price)>BigInt(reference.unitCostVnd))throw new AppError({code:"VALIDATION_FAILED",message:"Không có giá tham chiếu hoặc chi phí cao hơn bảng giá: mở Ghi chú ngoại lệ giá mua và ghi lý do được duyệt.",status:422});
 return JSON.stringify({adjustment:"PURCHASE_FINAL_UNIT_COST",reasonSource:"SYSTEM",beforeVnd:reference.unitCostVnd,afterVnd:price,ruleId:reference.id,ruleVersion:reference.version});
}
