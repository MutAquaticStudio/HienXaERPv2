import { readPricingClock } from "@/modules/pricing/request-clock";
import { effectivePriceState, effectivePriceLabels, effectivePriceTones, matchesEffectivePriceState } from "@/modules/pricing/effective-state";
import { formatBusinessDate } from "@/lib/core/business-time";
import { priceSourceLabel } from "@/modules/pricing/presentation";
import Link from "next/link";
import { AppError } from "@/lib/core/errors";
import { requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { portalRpc } from "@/modules/portal/server";
import type { PriceOptions, PurchasePriceRule } from "@/modules/pricing/editor";
import { PricingRuleList, type PriceRuleRow } from "@/modules/pricing/rule-list";
import { formatVnd,vnd } from "@/lib/core/money";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";
export default async function PurchasePricingPage({searchParams}:{searchParams:Promise<{q?:string;supplier?:string;material?:string;state?:string}>}){
 const access=await requireInternalAccess(),query=await searchParams;
 const now=await readPricingClock(),instant=new Date(now).toISOString();
 const manage=access.permissions.has("purchasing.price.manage"),read=access.permissions.has("purchasing.price.read")&&access.permissions.has("purchasing.read");
 if(!manage&&!read)throw new AppError({code:"FORBIDDEN",message:"Không có quyền bảng giá mua.",status:403});
 const db=await createServerSupabase(),empty:PriceOptions={customers:[],groups:[],materials:[],units:[],suppliers:[]};
 const options=manage?await portalRpc<PriceOptions>(db,"purchase_pricing_config_options",{target_branch_id:access.branchId}):empty;
 let request=db.from("purchase_price_rules").select("id,supplier_id,material_id,purchase_uom_id,unit_cost_vnd::text,version,source_type,effective_from,effective_to,active").eq("branch_id",access.branchId).order("effective_from",{ascending:false}).order("id").limit(100);
 if(query.supplier)request=request.eq("supplier_id",query.supplier);
 if(query.material)request=request.eq("material_id",query.material);
 if(query.state==="ACTIVE")request=request.eq("active",true).lte("effective_from",instant).or("effective_to.is.null,effective_to.gt."+instant);
 if(query.state==="FUTURE")request=request.eq("active",true).gt("effective_from",instant);
 if(query.state==="EXPIRED")request=request.eq("active",true).lte("effective_to",instant);
 if(query.state==="INACTIVE")request=request.eq("active",false);
 const result=read?await request:{data:[],error:null};if(result.error)throw new Error("Không tải được bảng giá mua trong phạm vi.");
 const rows=(result.data??[]) as unknown as PurchasePriceRule[],q=query.q?.trim().toLocaleLowerCase()??"";
 const supplierIds=[...new Set(rows.map(r=>r.supplier_id))],materialIds=[...new Set(rows.map(r=>r.material_id))],unitIds=[...new Set(rows.map(r=>r.purchase_uom_id))];
 const noLabels=Promise.resolve({data:[],error:null});
 const [supplierLabels,materialLabels,unitLabels]=await Promise.all([
  read&&access.permissions.has("suppliers.read")&&supplierIds.length?db.from("suppliers").select("id,name").eq("branch_id",access.branchId).in("id",supplierIds).limit(100):noLabels,
  read&&access.permissions.has("catalog.read")&&materialIds.length?db.from("materials").select("id,name").in("id",materialIds).limit(100):noLabels,
  read&&access.permissions.has("catalog.read")&&unitIds.length?db.from("units_of_measure").select("id,symbol").in("id",unitIds).limit(100):noLabels,
 ]);
 if([supplierLabels,materialLabels,unitLabels].some(r=>r.error))throw new Error("Không tải được tên NCC/vật tư trong phạm vi được phép.");
 const labels={suppliers:[...((supplierLabels.data??[]) as unknown as {id:string;name:string}[]),...(options.suppliers??[])],materials:[...((materialLabels.data??[]) as unknown as {id:string;name:string}[]),...options.materials],units:[...((unitLabels.data??[]) as unknown as {id:string;symbol:string}[]).map(u=>({id:u.id,name:u.symbol})),...options.units]};
 const label=(items:{id:string;name:string}[]|undefined,id:string)=>items?.find(x=>x.id===id)?.name??id;
 const shown=rows.filter(r=>matchesEffectivePriceState(r,query.state,now)&&(!q||[label(labels.suppliers,r.supplier_id),label(labels.materials,r.material_id)].some(v=>v.toLocaleLowerCase().includes(q))));
 const tableRows:PriceRuleRow[]=shown.map(rule=>{const state=effectivePriceState(rule,now);const party=label(labels.suppliers,rule.supplier_id),target=label(labels.materials,rule.material_id),uom=label(labels.units,rule.purchase_uom_id);
  return {id:rule.id,party,target,uom,price:formatVnd(vnd(rule.unit_cost_vnd)),source:priceSourceLabel(rule.source_type),period:"Từ "+formatBusinessDate(rule.effective_from)+(rule.effective_to?" đến trước "+formatBusinessDate(rule.effective_to):""),
   version:rule.version,state:effectivePriceLabels[state],stateTone:effectivePriceTones[state],editable:manage&&rule.active,purchaseRule:rule,scopeLabel:[party,target,uom].join(" · ")};});
 return <div className="page-stack"><header className="page-heading"><div><p className="eyebrow">Nhà cung cấp · {access.branchName}</p><h1 tabIndex={-1}>Bảng giá mua</h1><p className="lede">Đổi giá bằng phiên bản mới. Thông tin trên đơn mua đã chốt được giữ nguyên.</p></div><Link href="/admin/suppliers" className="button button-secondary">Nhà cung cấp</Link></header>
 <AutoFilterForm><label>Tìm NCC / vật tư<input name="q" defaultValue={query.q}/></label><label>Trạng thái<select name="state" defaultValue={query.state??""}><option value="">Tất cả / lịch sử</option><option value="ACTIVE">Đang hiệu lực</option><option value="FUTURE">Chưa có hiệu lực</option><option value="EXPIRED">Hết hiệu lực</option><option value="INACTIVE">Đã ngừng</option></select></label>{query.supplier&&<input type="hidden" name="supplier" value={query.supplier}/>}</AutoFilterForm>
 {!read&&<p className="muted">Quyền quản lý không tự cấp quyền đọc chi phí. Chỉ tạo giá từ dữ liệu được cung cấp.</p>}
 <PricingRuleList purchase rows={tableRows} options={options} canManage={manage} partyLabel="Nhà cung cấp" createLabel="+ Tạo giá mua"/>
 <p className="muted">Tối đa 100 phiên bản mới nhất trong chi nhánh.</p></div>;
}
