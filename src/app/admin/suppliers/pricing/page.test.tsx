import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const mocks=vi.hoisted(()=>({access:vi.fn(),client:vi.fn(),rpc:vi.fn(),from:vi.fn(),calls:[] as {table:string;method:string;args:unknown[]}[],results:{} as Record<string,{data:unknown[];error:unknown}>}));
vi.mock("next/navigation",()=>({useRouter:()=>({replace:vi.fn()}),usePathname:()=>"/admin/suppliers/pricing"}));
vi.mock("@/lib/access/context",()=>({requireInternalAccess:mocks.access}));
vi.mock("@/lib/supabase/server",()=>({createServerSupabase:mocks.client}));
vi.mock("@/modules/portal/server",()=>({portalRpc:mocks.rpc}));
vi.mock("@/modules/pricing/request-clock",()=>({readPricingClock:async()=>Date.now()}));
vi.mock("@/modules/pricing/editor",()=>({PricingRuleEditor:()=>null}));
vi.mock("next/link",()=>({default:({href,children}:{href:string;children:ReactNode})=><a href={href}>{children}</a>}));
import PurchasePricingPage from "./page";
const priceRows=(supplierName:string)=>screen.queryAllByText(supplierName,{selector:"td"}).filter(cell=>cell.closest("tr")?.textContent?.includes("SYN Material"));
const branch="00000000-0000-4000-8000-000000000001",supplier="00000000-0000-4000-8000-000000000002",material="00000000-0000-4000-8000-000000000003",uom="00000000-0000-4000-8000-000000000004";
const permissions=["purchasing.read","purchasing.price.read","purchasing.price.manage","suppliers.read","catalog.read"];
beforeEach(()=>{vi.clearAllMocks();vi.spyOn(Date,"now").mockReturnValue(Date.parse("2026-10-10T00:00:00+07:00"));mocks.calls.length=0;mocks.results={purchase_price_rules:{data:[{id:"rule-a",supplier_id:supplier,material_id:material,purchase_uom_id:uom,unit_cost_vnd:"60000",version:1,source_type:"CONTRACT",effective_from:"2026-10-10T00:00:00+07:00",effective_to:null,active:true},{id:"rule-b",supplier_id:supplier,material_id:material,purchase_uom_id:uom,unit_cost_vnd:"200000",version:2,source_type:"CONTRACT",effective_from:"2026-10-11T00:00:00+07:00",effective_to:null,active:true}],error:null},suppliers:{data:[{id:supplier,name:"SYN Later Supplier"}],error:null},materials:{data:[{id:material,name:"SYN Material"}],error:null},units_of_measure:{data:[{id:uom,symbol:"bag"}],error:null}};
 mocks.access.mockResolvedValue({branchId:branch,branchName:"SYN QA",permissions:new Set(permissions)});mocks.rpc.mockResolvedValue({suppliers:[{id:"first-option",name:"Earlier supplier"}],materials:[],units:[],customers:[],groups:[]});
 mocks.from.mockImplementation((table:string)=>{const query:Record<string,unknown>={};for(const method of ["select","eq","in","order","limit","lte","gt","or"])query[method]=(...args:unknown[])=>{mocks.calls.push({table,method,args});return query;};query.then=(resolve:unknown,reject:unknown)=>{mocks.calls.push({table,method:"await",args:[]});return Promise.resolve(mocks.results[table]).then(resolve as never,reject as never);};return query;});mocks.client.mockResolvedValue({from:mocks.from});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it("resolves names outside the bounded form options and matches two visible price rows",async()=>{render(await PurchasePricingPage({searchParams:Promise.resolve({q:"  syn later supplier  "})}));expect(priceRows("SYN Later Supplier")).toHaveLength(2);expect(mocks.calls).toContainEqual({table:"suppliers",method:"eq",args:["branch_id",branch]});expect(mocks.calls).toContainEqual({table:"suppliers",method:"in",args:["id",[supplier]]});expect(mocks.calls).toContainEqual({table:"materials",method:"in",args:["id",[material]]});expect(mocks.calls).toContainEqual({table:"units_of_measure",method:"in",args:["id",[uom]]});for(const table of ["suppliers","materials","units_of_measure"])expect(mocks.calls).toContainEqual({table,method:"limit",args:[100]});});
it("supports read-only cost actors without management RPC or create form",async()=>{mocks.access.mockResolvedValue({branchId:branch,branchName:"SYN QA",permissions:new Set(permissions.filter(p=>p!=="purchasing.price.manage"))});render(await PurchasePricingPage({searchParams:Promise.resolve({q:"SYN Later Supplier"})}));expect(priceRows("SYN Later Supplier")).toHaveLength(2);expect(mocks.rpc).not.toHaveBeenCalled();expect(screen.queryByRole("button",{name:"+ Tạo giá mua"})).not.toBeInTheDocument();});
it("does not load supplier labels without the existing supplier-read permission",async()=>{mocks.access.mockResolvedValue({branchId:branch,branchName:"SYN QA",permissions:new Set(["purchasing.read","purchasing.price.read","catalog.read"])});render(await PurchasePricingPage({searchParams:Promise.resolve({})}));expect(mocks.from).not.toHaveBeenCalledWith("suppliers");expect(screen.queryByText("SYN Later Supplier")).not.toBeInTheDocument();});
it("does not load catalog labels without the existing catalog-read permission",async()=>{mocks.access.mockResolvedValue({branchId:branch,branchName:"SYN QA",permissions:new Set(["purchasing.read","purchasing.price.read","suppliers.read"])});render(await PurchasePricingPage({searchParams:Promise.resolve({})}));expect(mocks.from).not.toHaveBeenCalledWith("materials");expect(mocks.from).not.toHaveBeenCalledWith("units_of_measure");});
it("manage-only permission does not execute price or label reads",async()=>{mocks.access.mockResolvedValue({branchId:branch,branchName:"SYN QA",permissions:new Set(["purchasing.price.manage"])});render(await PurchasePricingPage({searchParams:Promise.resolve({})}));expect(mocks.calls.filter(c=>c.method==="await")).toHaveLength(0);expect(mocks.rpc).toHaveBeenCalledWith(expect.anything(),"purchase_pricing_config_options",{target_branch_id:branch});});
it("fails closed and does not expose database error details when label read fails",async()=>{mocks.results.suppliers.error={message:"PRIVATE_DATABASE_DETAILS"};await expect(PurchasePricingPage({searchParams:Promise.resolve({})})).rejects.toThrow("Không tải được tên NCC/vật tư trong phạm vi được phép.");});

it("labels current, future, expired and inactive prices under a controlled server clock",async()=>{
 const first=mocks.results.purchase_price_rules.data[0] as Record<string,unknown>;
 mocks.results.purchase_price_rules.data=[first,{...first,id:"future",version:3,effective_from:"2026-10-11T00:00:00+07:00"},{...first,id:"expired",version:4,effective_to:"2026-10-10T00:00:00+07:00"},{...first,id:"inactive",version:5,active:false}];
 render(await PurchasePricingPage({searchParams:Promise.resolve({})}));
 for(const [id,label] of [["rule-a","Đang hiệu lực"],["future","Chưa có hiệu lực"],["expired","Hết hiệu lực"],["inactive","Đã ngừng"]])expect(document.querySelector(`tr[data-price-rule-id="${id}"]`)).toHaveTextContent(label);
});
it.each(["ACTIVE","FUTURE","EXPIRED","INACTIVE"])("filters %s consistently before rendering",async state=>{
 const first=mocks.results.purchase_price_rules.data[0] as Record<string,unknown>;
 mocks.results.purchase_price_rules.data=[first,{...first,id:"future",version:3,effective_from:"2026-10-11T00:00:00+07:00"},{...first,id:"expired",version:4,effective_to:"2026-10-10T00:00:00+07:00"},{...first,id:"inactive",version:5,active:false}];
 render(await PurchasePricingPage({searchParams:Promise.resolve({state})}));
 expect(priceRows("SYN Later Supplier")).toHaveLength(1);
 expect(mocks.calls).toContainEqual({table:"purchase_price_rules",method:"eq",args:["active",state!=="INACTIVE"]});
 if(state==="ACTIVE")expect(mocks.calls).toContainEqual({table:"purchase_price_rules",method:"or",args:["effective_to.is.null,effective_to.gt.2026-10-09T17:00:00.000Z"]});
});
it("denies unauthorized actors before making any cost request",async()=>{
 mocks.access.mockResolvedValue({branchId:branch,permissions:new Set(["catalog.read"])});
 await expect(PurchasePricingPage({searchParams:Promise.resolve({})})).rejects.toThrow("Không có quyền bảng giá mua.");
 expect(mocks.client).not.toHaveBeenCalled();
});
