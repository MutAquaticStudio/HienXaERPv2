"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { reasonOrDefault } from "@/lib/core/reason";
import { createServerSupabase } from "@/lib/supabase/server";
import { portalRpc, PortalRpcError } from "@/modules/portal/server";
import { formatVnd, vnd } from "@/lib/core/money";
import { derivedOperationId } from "@/modules/sales/auto-sourcing";
import type { PricingState } from "./actions";
import { splitPriceByUnits, type UnitRatio } from "./unit-split";
type Db=Awaited<ReturnType<typeof createServerSupabase>>;
type Implied={uomId:string;symbol:string;priceVnd:string};
/**
 * FB5 (Owner 18/10): the prices one supplier price implies for the material's other units by its conversions ("1 bao 80.000 ₫"
 * with 1 tấn = 20 bao → 1 tấn 1.600.000 ₫), rounded to whole đồng. Units the supplier already has a price for in the same period
 * are left alone. Null when the conversions cannot be read (the typed price is still saved on its own).
 */
async function impliedUnitPrices(db:Db,branch:string,rule:{supplier:string;material:string;uom:string;amount:bigint;from:string;to:string|null}):Promise<Implied[]|null>{
 const [material,conversions,existing]=await Promise.all([
  db.from("materials").select("id,base_uom_id").eq("id",rule.material).maybeSingle(),
  db.from("material_uom_conversions").select("from_uom_id,to_uom_id,numerator::text,denominator::text,effective_from,effective_to").eq("material_id",rule.material).eq("active",true).eq("settlement_allowed",true).limit(100),
  db.from("purchase_price_rules").select("purchase_uom_id,effective_from,effective_to").eq("branch_id",branch).eq("supplier_id",rule.supplier).eq("material_id",rule.material).eq("active",true).limit(200),
 ]);
 if(material.error||conversions.error||existing.error||!material.data)return null;
 const base=(material.data as {base_uom_id:string}).base_uom_id,now=Date.now();
 const units:UnitRatio[]=[{uomId:base,numerator:"1",denominator:"1"},...((conversions.data??[]) as unknown as {from_uom_id:string;to_uom_id:string;numerator:string;denominator:string;effective_from:string;effective_to:string|null}[])
  .filter(c=>c.to_uom_id===base&&Date.parse(c.effective_from)<=now&&(!c.effective_to||Date.parse(c.effective_to)>now)).map(c=>({uomId:c.from_uom_id,numerator:c.numerator,denominator:c.denominator}))];
 const typed=units.find(u=>u.uomId===rule.uom);
 if(!typed)return [];
 const start=Date.parse(rule.from),end=rule.to?Date.parse(rule.to):Infinity;
 const taken=new Set(((existing.data??[]) as unknown as {purchase_uom_id:string;effective_from:string;effective_to:string|null}[])
  .filter(r=>Date.parse(r.effective_from)<end&&(!r.effective_to||Date.parse(r.effective_to)>start)).map(r=>r.purchase_uom_id));
 const prices=[...splitPriceByUnits(typed,rule.amount,[...new Map(units.map(u=>[u.uomId,u])).values()],1)].filter(([uomId])=>uomId!==rule.uom&&!taken.has(uomId));
 if(!prices.length)return [];
 const symbols=await db.from("units_of_measure").select("id,symbol").in("id",prices.map(([uomId])=>uomId));
 const symbol=(id:string)=>((symbols.data??[]) as {id:string;symbol:string}[]).find(u=>u.id===id)?.symbol??"đơn vị";
 return prices.map(([uomId,price])=>({uomId,symbol:symbol(uomId),priceVnd:price.toString()}));
}
function revalidate(){revalidatePath("/admin/suppliers/pricing");revalidatePath("/admin/products");revalidatePath("/admin/purchase-orders");}
function validDay(v:string){const d=new Date(v+"T12:00:00Z");return /^\d{4}-\d{2}-\d{2}$/.test(v)&&!v.startsWith("0000")&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
export async function savePurchasePricingRuleAction(_:PricingState|undefined,form:FormData):Promise<PricingState>{
 const access=await requireInternalPermission("purchasing.price.manage");
 const mode=String(form.get("mode")??""),reason=reasonOrDefault(form.get("reason"),mode==="deactivate"?"Ngừng sử dụng giá mua":"Cập nhật giá mua"),operation=String(form.get("operationId")??""),oldId=String(form.get("supersedesId")??"");
 const version=Number(form.get("expectedVersion"));
 if(!z.guid().safeParse(operation).success)return{message:"Mã thao tác không hợp lệ. Hãy tải lại màn hình."};
 try{
  const db=await createServerSupabase();
  if(mode==="deactivate"){
   if(!z.guid().safeParse(oldId).success||!Number.isInteger(version)||version<1)return{message:"Phiên bản giá không hợp lệ."};
   await portalRpc(db,"deactivate_purchase_price_rule",{target_id:oldId,target_branch_id:access.branchId,expected_version:version,change_reason:reason,operation_id:operation});
  }else{
   const target=String(form.get("targetId")??""),amount=String(form.get("unitPriceVnd")??"").trim(),source=String(form.get("sourceType")??""),from=String(form.get("effectiveFrom")??""),to=String(form.get("effectiveTo")??"");
   if(!["create","replace"].includes(mode)||!z.guid().safeParse(target).success||!/^[1-9]\d*$/.test(amount)||amount.length>19||BigInt(amount)>9223372036854775807n||!["LIST","CONTRACT"].includes(source)||!validDay(from)||(to&&(!validDay(to)||to<=from)))return{message:"Giá VND, nguồn và ngày hiệu lực chưa hợp lệ."};
   const values:Record<string,string|null>={unit_cost_vnd:amount,source_type:source,effective_from:from+"T00:00:00+07:00",effective_to:to?to+"T00:00:00+07:00":null};
   if(mode==="create"){
    const supplier=String(form.get("supplierId")??""),material=String(form.get("materialId")??""),uom=String(form.get("priceUomId")??"");
    if(![supplier,material,uom].every(v=>z.guid().safeParse(v).success))return{message:"Chọn NCC, vật tư và ĐVT hợp lệ."};
    Object.assign(values,{supplier_id:supplier,material_id:material,purchase_uom_id:uom});
    const implied=form.get("splitUnits")==="1"?await impliedUnitPrices(db,access.branchId,{supplier,material,uom,amount:BigInt(amount),from:values.effective_from!,to:values.effective_to}):[];
    if(implied?.length){
     // One transaction: the typed price and the implied ones are saved together or not at all.
     await portalRpc(db,"save_purchase_price_rules",{target_branch_id:access.branchId,change_reason:reason,operation_id:operation,
      rules:[{target_id:target,values},...implied.map(p=>({target_id:derivedOperationId(target,"unit:"+p.uomId),values:{...values,purchase_uom_id:p.uomId,unit_cost_vnd:p.priceVnd}}))]});
     revalidate();
     return{success:true,message:"Đã lưu giá mua và tự tính giá theo quy đổi: "+implied.map(p=>"1 "+p.symbol+" "+formatVnd(vnd(p.priceVnd))).join(" · ")+"."};
    }
    await portalRpc(db,"save_purchase_price_rule",{target_id:target,target_branch_id:access.branchId,supersedes_id:null,expected_version:null,values_json:values,change_reason:reason,operation_id:operation});
    revalidate();
    return{success:true,message:"Đã lưu phiên bản giá mua; thông tin trên chứng từ cũ được giữ nguyên."+(implied===null?" Chưa tự tính được giá các đơn vị khác; nhập riêng nếu cần.":"")};
   }else if(!z.guid().safeParse(oldId).success||!Number.isInteger(version)||version<1)return{message:"Phiên bản cần thay không hợp lệ."};
   await portalRpc(db,"save_purchase_price_rule",{target_id:target,target_branch_id:access.branchId,supersedes_id:oldId,expected_version:version,values_json:values,change_reason:reason,operation_id:operation});
  }
  revalidate();
  return{success:true,message:mode==="deactivate"?"Đã ngừng giá mua; lịch sử chứng từ giữ nguyên.":"Đã lưu phiên bản giá mua; thông tin trên chứng từ cũ được giữ nguyên."};
 }catch(error){const code=error instanceof PortalRpcError?error.code:"";
  // An overlapping price of the same supplier, material and unit is not a stale page: say what to do instead.
  if(error instanceof PortalRpcError&&error.rawMessage?.includes("active_rule_exists"))return{message:"NCC này đã có giá mua đang hiệu lực cho vật tư và đơn vị đó trong khoảng thời gian này. Sửa hoặc ngừng giá cũ, hoặc chọn ngày hiệu lực khác."};
  return{message:code==="PT409"||code==="23505"?"Phiên bản hoặc thao tác đã thay đổi. Tải lại trước khi lưu.":code==="42501"?"Không có quyền quản lý giá mua trong chi nhánh này.":"Chưa xác nhận được kết quả. Giữ nguyên mã thao tác và dữ liệu khi thử lại."};}
}
