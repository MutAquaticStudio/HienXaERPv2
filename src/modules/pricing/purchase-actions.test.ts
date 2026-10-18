import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({access:vi.fn(),db:vi.fn(),rpc:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/access/context",()=>({requireInternalPermission:mocks.access}));
vi.mock("@/lib/supabase/server",()=>({createServerSupabase:mocks.db}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
vi.mock("@/modules/portal/server",()=>({portalRpc:mocks.rpc,PortalRpcError:class extends Error{code:string;constructor(code:string){super(code);this.code=code;}}}));
import { PortalRpcError } from "@/modules/portal/server";
import { savePurchasePricingRuleAction } from "./purchase-actions";
const ids={branch:"00000000-0000-4000-8000-000000000001",target:"00000000-0000-4000-8000-000000000002",operation:"00000000-0000-4000-8000-000000000003",supplier:"00000000-0000-4000-8000-000000000004",material:"00000000-0000-4000-8000-000000000005",uom:"00000000-0000-4000-8000-000000000006",old:"00000000-0000-4000-8000-000000000007"};
function form(changes:Record<string,string>={}){const f=new FormData();for(const[k,v]of Object.entries({mode:"create",reason:"Synthetic price change",operationId:ids.operation,targetId:ids.target,supplierId:ids.supplier,materialId:ids.material,priceUomId:ids.uom,unitPriceVnd:"80000",sourceType:"CONTRACT",effectiveFrom:"2026-10-10",effectiveTo:"",...changes}))f.set(k,v);return f;}
beforeEach(()=>{vi.clearAllMocks();mocks.access.mockResolvedValue({branchId:ids.branch});mocks.db.mockResolvedValue({});mocks.rpc.mockResolvedValue(ids.target);});
describe("purchase pricing canonical action",()=>{
it("uses exact VND strings, scoped actor branch and stable operation",async()=>{const r=await savePurchasePricingRuleAction(undefined,form({unitPriceVnd:"9007199254740993"}));expect(r.success).toBe(true);expect(mocks.access).toHaveBeenCalledWith("purchasing.price.manage");expect(mocks.rpc).toHaveBeenCalledWith({},"save_purchase_price_rule",expect.objectContaining({target_id:ids.target,target_branch_id:ids.branch,operation_id:ids.operation,values_json:expect.objectContaining({unit_cost_vnd:"9007199254740993",supplier_id:ids.supplier,material_id:ids.material,purchase_uom_id:ids.uom,effective_from:"2026-10-10T00:00:00+07:00"})}));});
it.each(["0","-1","1.1","NaN","Infinity","9223372036854775808"])("rejects invalid VND %s",async unitPriceVnd=>{expect((await savePurchasePricingRuleAction(undefined,form({unitPriceVnd}))).success).not.toBe(true);expect(mocks.rpc).not.toHaveBeenCalled();});
it.each(["2026-02-30","0000-01-01","not-a-day"])("rejects invalid calendar day %s",async effectiveFrom=>{await savePurchasePricingRuleAction(undefined,form({effectiveFrom}));expect(mocks.rpc).not.toHaveBeenCalled();});
it("rejects inverted or zero-length interval",async()=>{for(const effectiveTo of ["2026-10-09","2026-10-10"]){await savePurchasePricingRuleAction(undefined,form({effectiveTo}));expect(mocks.rpc).not.toHaveBeenCalled();}});
it("rejects missing reference scope",async()=>{await savePurchasePricingRuleAction(undefined,form({supplierId:""}));expect(mocks.rpc).not.toHaveBeenCalled();});
it("rejects missing operation ID",async()=>{await savePurchasePricingRuleAction(undefined,form({operationId:""}));expect(mocks.rpc).not.toHaveBeenCalled();});
it("requires change justification",async()=>{await savePurchasePricingRuleAction(undefined,form({reason:" "}));expect(mocks.rpc).not.toHaveBeenCalled();});
it("replaces a version without sending mutable scope",async()=>{await savePurchasePricingRuleAction(undefined,form({mode:"replace",supersedesId:ids.old,expectedVersion:"1"}));const params=mocks.rpc.mock.calls[0][2];expect(params.supersedes_id).toBe(ids.old);expect(params.expected_version).toBe(1);expect(params.values_json).not.toHaveProperty("supplier_id");expect(params.values_json).not.toHaveProperty("material_id");});
it("deactivates with optimistic version",async()=>{await savePurchasePricingRuleAction(undefined,form({mode:"deactivate",supersedesId:ids.old,expectedVersion:"2"}));expect(mocks.rpc).toHaveBeenCalledWith({},"deactivate_purchase_price_rule",{target_id:ids.old,target_branch_id:ids.branch,expected_version:2,change_reason:"Synthetic price change",operation_id:ids.operation});});
it("does not bypass denied manage permission",async()=>{mocks.access.mockRejectedValueOnce(new Error("permission denied"));await expect(savePurchasePricingRuleAction(undefined,form())).rejects.toThrow("permission denied");expect(mocks.rpc).not.toHaveBeenCalled();});
it.each(["PT409","23505","42501"])("returns controlled response for %s",async code=>{mocks.rpc.mockRejectedValueOnce(Object.assign(Object.create(PortalRpcError.prototype),{code,message:"PRIVATE_CONSTRAINT_DETAILS"}));const r=await savePurchasePricingRuleAction(undefined,form());expect(r.success).not.toBe(true);expect(r.message).not.toContain("PRIVATE_CONSTRAINT_DETAILS");});
it("does not expose raw unknown error and preserves retry operation",async()=>{mocks.rpc.mockRejectedValueOnce(new Error("PRIVATE_SQL_ERROR"));const r=await savePurchasePricingRuleAction(undefined,form());expect(r.message).not.toContain("PRIVATE_SQL_ERROR");expect(mocks.rpc.mock.calls[0][2].operation_id).toBe(ids.operation);expect(mocks.revalidate).not.toHaveBeenCalled();});
it("splits one supplier price over the material's units by its conversions, in one transaction (Owner 18/10)",async()=>{
 const tan="00000000-0000-4000-8000-0000000000aa",kg="00000000-0000-4000-8000-0000000000bb",bao=ids.uom;
 const tables:Record<string,unknown>={materials:{id:ids.material,base_uom_id:tan},
  material_uom_conversions:[{from_uom_id:bao,to_uom_id:tan,numerator:"1",denominator:"20",effective_from:"2026-01-01T00:00:00Z",effective_to:null},
   {from_uom_id:kg,to_uom_id:tan,numerator:"1",denominator:"1000",effective_from:"2026-01-01T00:00:00Z",effective_to:null}],
  purchase_price_rules:[{purchase_uom_id:kg,effective_from:"2026-09-01T00:00:00+07:00",effective_to:null}],
  units_of_measure:[{id:tan,symbol:"tấn"},{id:kg,symbol:"kg"}]};
 const query=(table:string)=>{const result={data:tables[table],error:null};const chain:Record<string,unknown>={then:(ok:(v:unknown)=>unknown)=>Promise.resolve(result).then(ok),maybeSingle:()=>Promise.resolve(result)};for(const m of["select","eq","limit","in"])chain[m]=()=>chain;return chain;};
 mocks.db.mockResolvedValue({from:query});
 mocks.rpc.mockResolvedValue([ids.target]);
 const r=await savePurchasePricingRuleAction(undefined,form({splitUnits:"1"}));
 expect(r).toMatchObject({success:true});expect(r.message).toContain("1 tấn 1.600.000");expect(r.message).not.toContain("kg");
 expect(mocks.rpc).toHaveBeenCalledOnce();
 const [,name,params]=mocks.rpc.mock.calls[0];expect(name).toBe("save_purchase_price_rules");
 expect(params).toMatchObject({target_branch_id:ids.branch,operation_id:ids.operation,change_reason:"Synthetic price change"});
 expect(params.rules).toHaveLength(2);
 expect(params.rules[0]).toEqual({target_id:ids.target,values:expect.objectContaining({purchase_uom_id:bao,unit_cost_vnd:"80000"})});
 // The kg price already exists for this supplier, so only tấn is added; its id is derived from the typed rule's id (stable on retry).
 expect(params.rules[1].values).toMatchObject({purchase_uom_id:tan,unit_cost_vnd:"1600000",supplier_id:ids.supplier,source_type:"CONTRACT"});
 expect(params.rules[1].target_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 expect(params.rules[1].target_id).not.toBe(ids.target);
});
});

it("says an overlapping price already exists instead of asking to reload",async()=>{
 mocks.rpc.mockRejectedValueOnce(Object.assign(Object.create(PortalRpcError.prototype),{code:"PT409",message:"active_rule_exists",rawMessage:"active_rule_exists"}));
 const r=await savePurchasePricingRuleAction(undefined,form());
 expect(r).toEqual({message:"NCC này đã có giá mua đang hiệu lực cho vật tư và đơn vị đó trong khoảng thời gian này. Sửa hoặc ngừng giá cũ, hoặc chọn ngày hiệu lực khác."});
});
