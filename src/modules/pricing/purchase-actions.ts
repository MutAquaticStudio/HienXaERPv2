"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { portalRpc, PortalRpcError } from "@/modules/portal/server";
import type { PricingState } from "./actions";
function validDay(v:string){const d=new Date(v+"T12:00:00Z");return /^\d{4}-\d{2}-\d{2}$/.test(v)&&!v.startsWith("0000")&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
export async function savePurchasePricingRuleAction(_:PricingState|undefined,form:FormData):Promise<PricingState>{
 const access=await requireInternalPermission("purchasing.price.manage");
 const mode=String(form.get("mode")??""),reason=String(form.get("reason")??"").trim(),operation=String(form.get("operationId")??""),oldId=String(form.get("supersedesId")??"");
 const version=Number(form.get("expectedVersion"));
 if(!z.uuid().safeParse(operation).success||reason.length<3||reason.length>500)return{message:"Cần mã thao tác và lý do thay đổi hợp lệ."};
 try{
  const db=await createServerSupabase();
  if(mode==="deactivate"){
   if(!z.uuid().safeParse(oldId).success||!Number.isInteger(version)||version<1)return{message:"Phiên bản giá không hợp lệ."};
   await portalRpc(db,"deactivate_purchase_price_rule",{target_id:oldId,target_branch_id:access.branchId,expected_version:version,change_reason:reason,operation_id:operation});
  }else{
   const target=String(form.get("targetId")??""),amount=String(form.get("unitPriceVnd")??"").trim(),source=String(form.get("sourceType")??""),from=String(form.get("effectiveFrom")??""),to=String(form.get("effectiveTo")??"");
   if(!["create","replace"].includes(mode)||!z.uuid().safeParse(target).success||!/^[1-9]\d*$/.test(amount)||amount.length>19||BigInt(amount)>9223372036854775807n||!["LIST","CONTRACT"].includes(source)||!validDay(from)||(to&&(!validDay(to)||to<=from)))return{message:"Giá VND, nguồn và ngày hiệu lực chưa hợp lệ."};
   const values:Record<string,string|null>={unit_cost_vnd:amount,source_type:source,effective_from:from+"T00:00:00+07:00",effective_to:to?to+"T00:00:00+07:00":null};
   if(mode==="create"){
    const supplier=String(form.get("supplierId")??""),material=String(form.get("materialId")??""),uom=String(form.get("priceUomId")??"");
    if(![supplier,material,uom].every(v=>z.uuid().safeParse(v).success))return{message:"Chọn NCC, vật tư và ĐVT hợp lệ."};
    Object.assign(values,{supplier_id:supplier,material_id:material,purchase_uom_id:uom});
   }else if(!z.uuid().safeParse(oldId).success||!Number.isInteger(version)||version<1)return{message:"Phiên bản cần thay không hợp lệ."};
   await portalRpc(db,"save_purchase_price_rule",{target_id:target,target_branch_id:access.branchId,supersedes_id:mode==="replace"?oldId:null,expected_version:mode==="replace"?version:null,values_json:values,change_reason:reason,operation_id:operation});
  }
  revalidatePath("/admin/suppliers/pricing");revalidatePath("/admin/products");revalidatePath("/admin/purchase-orders");
  return{success:true,message:mode==="deactivate"?"Đã ngừng giá mua; lịch sử chứng từ giữ nguyên.":"Đã lưu phiên bản giá mua; thông tin trên chứng từ cũ được giữ nguyên."};
 }catch(error){const code=error instanceof PortalRpcError?error.code:"";return{message:code==="PT409"||code==="23505"?"Phiên bản hoặc thao tác đã thay đổi. Tải lại trước khi lưu.":code==="42501"?"Không có quyền quản lý giá mua trong chi nhánh này.":"Chưa xác nhận được kết quả. Giữ nguyên mã thao tác và dữ liệu khi thử lại."};}
}
