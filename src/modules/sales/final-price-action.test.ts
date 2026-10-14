vi.mock("server-only", () => ({}));
import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),client:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/access/context",()=>({requireInternalPermission:m.permission,requireCustomerAccess:vi.fn()}));vi.mock("@/lib/supabase/server",()=>({createServerSupabase:m.client}));vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));vi.mock("next/navigation",()=>({redirect:vi.fn()}));
import {previewCommercialDocumentAction} from "./actions";
const customer="11111111-1111-4111-8111-111111111111",site="22222222-2222-4222-8222-222222222222",material="33333333-3333-4333-8333-333333333333",uom="44444444-4444-4444-8444-444444444444",rule="55555555-5555-4555-8555-555555555555";
function fixture(manage=true,price:string|null="150000") {
 m.permission.mockResolvedValue({branchId:"branch",permissions:new Set(manage?["pricing.manage"]:[])});
 m.client.mockResolvedValue({rpc:m.rpc,from:(table:string)=>{
 const result={data:table==="customers"?{id:customer,tier_code:null}:table==="customer_sites"?{id:site}:table==="materials"?[{id:material,group_id:"g",base_uom_id:uom}]:table==="pricing_rules"&&price?[{id:rule,branch_id:"branch",scope_type:"DEFAULT",material_id:material,price_uom_id:uom,unit_price_vnd:price,version:1,source_type:"LIST",effective_from:"2020-01-01T00:00:00Z",effective_to:null,active:true}]:[],error:null};
 const q={select:vi.fn(),eq:vi.fn(),in:vi.fn(),lte:vi.fn(),or:vi.fn(),order:vi.fn(),maybeSingle:vi.fn().mockResolvedValue(result),then:(resolve:(v:typeof result)=>unknown)=>Promise.resolve(result).then(resolve)};
 for(const key of ["select","eq","in","lte","or","order"] as const)q[key].mockReturnValue(q);return q;
 }});
}
const input=(manualPriceVnd="90000",manualReason="")=>({kind:"order",customerId:customer,siteId:site,lines:[{materialId:material,orderedUomId:uom,quantity:"2",manualPriceVnd,manualReason}]});
beforeEach(()=>{vi.clearAllMocks();fixture()});
it("authorized ordinary final price uses same engine reference and MANUAL_APPROVED snapshot",async()=>{const r=await previewCommercialDocumentAction(input());expect(r.success).toBe(true);expect(r.totalVnd).toBe("180000");expect(r.lines?.[0].priceSourceType).toBe("MANUAL_APPROVED");expect(JSON.parse(r.lines![0].overrideReason!)).toMatchObject({beforeVnd:"150000",afterVnd:"90000",ruleId:rule});expect(m.rpc).not.toHaveBeenCalled()});
it("blank final price uses canonical price with no override",async()=>{const r=await previewCommercialDocumentAction(input(""));expect(r.success).toBe(true);expect(r.lines?.[0].unitPriceVnd).toBe("150000");expect(r.lines?.[0].overrideReason).toBeNull()});
it("cannot grant Sales an unauthorized override via crafted payload",async()=>{fixture(false);const r=await previewCommercialDocumentAction(input());expect(r.success).toBe(false);expect(r.message).toContain("không có quyền");expect(m.rpc).not.toHaveBeenCalled()});
it("absence of a reference requires an explicit approved reason",async()=>{fixture(true,null);expect((await previewCommercialDocumentAction(input())).success).toBe(false);expect((await previewCommercialDocumentAction(input("90000","Approved synthetic exception"))).success).toBe(true)});
it("changed reference produces different audit snapshot rather than silently accepting stale reference",async()=>{const a=await previewCommercialDocumentAction(input());fixture(true,"160000");const b=await previewCommercialDocumentAction(input());expect(a.lines?.[0].overrideReason).not.toBe(b.lines?.[0].overrideReason)});
