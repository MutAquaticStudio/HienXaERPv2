import { randomUUID } from "node:crypto";
import Link from "next/link";
import { AppError } from "@/lib/core/errors";
import { requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { portalRpc } from "@/modules/portal/server";
import { PricingRuleEditor,type PriceOptions,type PurchasePriceRule } from "@/modules/pricing/editor";
import { formatVnd,vnd } from "@/lib/core/money";
export default async function PurchasePricingPage({searchParams}:{searchParams:Promise<{q?:string;supplier?:string;material?:string;state?:string}>}){
 const access=await requireInternalAccess(),query=await searchParams;
 const manage=access.permissions.has("purchasing.price.manage"),read=access.permissions.has("purchasing.price.read")&&access.permissions.has("purchasing.read");
 if(!manage&&!read)throw new AppError({code:"FORBIDDEN",message:"Không có quyền bảng giá mua.",status:403});
 const db=await createServerSupabase(),empty:PriceOptions={customers:[],groups:[],materials:[],units:[],suppliers:[]};
 const options=manage?await portalRpc<PriceOptions>(db,"purchase_pricing_config_options",{target_branch_id:access.branchId}):empty;
 let request=db.from("purchase_price_rules").select("id,supplier_id,material_id,purchase_uom_id,unit_cost_vnd::text,version,source_type,effective_from,effective_to,active").eq("branch_id",access.branchId).order("effective_from",{ascending:false}).order("id").limit(100);
 if(query.supplier)request=request.eq("supplier_id",query.supplier);
 if(query.material)request=request.eq("material_id",query.material);
 if(query.state==="ACTIVE")request=request.eq("active",true);if(query.state==="INACTIVE")request=request.eq("active",false);
 const result=read?await request:{data:[],error:null};if(result.error)throw new Error("Không tải được bảng giá mua trong phạm vi.");
 const rows=(result.data??[]) as unknown as PurchasePriceRule[],q=query.q?.trim().toLocaleLowerCase()??"";
 const label=(items:{id:string;name:string}[]|undefined,id:string)=>items?.find(x=>x.id===id)?.name??id;
 const shown=rows.filter(r=>!q||[label(options.suppliers,r.supplier_id),label(options.materials,r.material_id)].some(v=>v.toLocaleLowerCase().includes(q)));
 return <><header className="page-heading"><div><p className="eyebrow">Nhà cung cấp · {access.branchName}</p><h1>Bảng giá mua</h1><p className="lede">Dùng purchase_price_rules hiện có. Đổi giá bằng phiên bản mới, không sửa snapshot PO đã chốt.</p></div><Link href="/admin/suppliers" className="button button-secondary">Nhà cung cấp</Link></header>
 <form className="filter-bar"><label>Tìm NCC / vật tư<input name="q" defaultValue={query.q}/></label><label>Trạng thái<select name="state" defaultValue={query.state??""}><option value="">Tất cả / lịch sử</option><option value="ACTIVE">Đang dùng</option><option value="INACTIVE">Đã ngừng</option></select></label>{query.supplier&&<input type="hidden" name="supplier" value={query.supplier}/>}<button className="button button-secondary">Áp dụng</button></form>
 {manage&&<details className="card card-pad"><summary>Tạo giá mua</summary><PricingRuleEditor purchase options={options} command={{targetId:randomUUID(),operationId:randomUUID()}}/></details>}
 {!read&&<p className="muted">Quyền quản lý không tự cấp quyền đọc chi phí. Chỉ tạo giá từ dữ liệu được cung cấp.</p>}<p className="muted">Tối đa 100 phiên bản mới nhất trong chi nhánh.</p>
 {shown.map(rule=><details className="card card-pad" key={rule.id}><summary>{label(options.suppliers,rule.supplier_id)} · {label(options.materials,rule.material_id)} · {formatVnd(vnd(rule.unit_cost_vnd))} · v{rule.version} · {rule.active?"Đang dùng":"Đã ngừng"}</summary><p>ĐVT {label(options.units,rule.purchase_uom_id)} · {rule.source_type} · {rule.effective_from}{rule.effective_to?" đến trước "+rule.effective_to:""}</p>{manage&&rule.active&&<PricingRuleEditor purchase purchaseRule={rule} options={options} command={{targetId:randomUUID(),operationId:randomUUID()}}/>}</details>)}</>;
}
