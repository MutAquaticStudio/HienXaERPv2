import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({access:vi.fn(),client:vi.fn(),rpc:vi.fn(),calls:[] as unknown[],rows:[] as unknown[]}));
vi.mock("@/lib/access/context",()=>({requireInternalPermission:m.access}));
vi.mock("@/lib/supabase/server",()=>({createServerSupabase:m.client}));
vi.mock("@/modules/portal/server",()=>({portalRpc:m.rpc}));
vi.mock("@/modules/pricing/request-clock",()=>({readPricingClock:async()=>Date.now()}));
vi.mock("@/modules/pricing/editor",()=>({PricingRuleEditor:()=>null}));
import Page from "./page";
beforeEach(()=>{
 vi.clearAllMocks();vi.spyOn(Date,"now").mockReturnValue(Date.parse("2026-10-09T17:00:00Z"));m.calls=[];m.rows=[];
 m.access.mockResolvedValue({branchId:"branch",branchName:"QA",permissions:new Set(["pricing.read"])});
 const q:Record<string,unknown>={};for(const method of ["select","eq","lte","gt","or","order","limit"])q[method]=(...args:unknown[])=>{m.calls.push({method,args});return q;};
 q.then=(resolve:unknown,reject:unknown)=>Promise.resolve({data:m.rows,error:null}).then(resolve as never,reject as never);
 m.client.mockResolvedValue({from:()=>q});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const base={id:"rule",scope_type:"DEFAULT",material_id:"material",unit_price_vnd:"9007199254740993",version:1,source_type:"LIST",price_uom_id:"uom",effective_from:"2026-10-10T00:00:00+07:00",effective_to:null,active:true};
it("Sales historical listing uses the same effective-state contract",async()=>{
 m.rows=[base,{...base,id:"expired",version:2,effective_to:"2026-10-10T00:00:00+07:00"},{...base,id:"future",version:3,effective_from:"2026-10-11T00:00:00+07:00"},{...base,id:"inactive",version:4,active:false}];
 render(await Page({searchParams:Promise.resolve({})}));for(const label of ["v1 · Đang hiệu lực","v2 · Hết hiệu lực","v3 · Chưa có hiệu lực","v4 · Đã ngừng"])expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
 expect(m.rpc).not.toHaveBeenCalled();
});
it("Sales current filter excludes expired rules and uses server instant before limiting",async()=>{
 m.rows=[base,{...base,id:"expired",version:2,effective_to:"2026-10-10T00:00:00+07:00"}];
 render(await Page({searchParams:Promise.resolve({state:"ACTIVE"})}));
 expect(screen.queryByText(/v2 · Hết hiệu lực/)).not.toBeInTheDocument();
 expect(m.calls).toContainEqual({method:"lte",args:["effective_from","2026-10-09T17:00:00.000Z"]});
 expect(m.calls).toContainEqual({method:"or",args:["effective_to.is.null,effective_to.gt.2026-10-09T17:00:00.000Z"]});
});
