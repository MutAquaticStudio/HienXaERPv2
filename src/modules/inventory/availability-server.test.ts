import { beforeEach, expect, it, vi } from "vitest";
import { loadWarehouseAvailability } from "./availability-server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ permission: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: mocks.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: mocks.client }));
beforeEach(() => vi.clearAllMocks());
it("checks inventory permission and branch before reading", async () => {
 mocks.permission.mockResolvedValue({branchId:"b"});
 await expect(loadWarehouseAvailability("a",["m"])).rejects.toThrow("STOCK_BRANCH_SCOPE_MISMATCH");
 expect(mocks.permission).toHaveBeenCalledWith("inventory.read");expect(mocks.client).not.toHaveBeenCalled();
});
it("does not query an empty material scope", async () => {
 mocks.permission.mockResolvedValue({branchId:"a"});
 expect((await loadWarehouseAvailability("a",[])).positions).toEqual([]);expect(mocks.client).not.toHaveBeenCalled();
});
it("reads only branch-scoped exact quantity fields, with no price/cost or writers", async () => {
 mocks.permission.mockResolvedValue({branchId:"a"});
 const requests: {table:string; select:ReturnType<typeof vi.fn>; eq:ReturnType<typeof vi.fn>; in:ReturnType<typeof vi.fn>}[]=[];
 mocks.client.mockResolvedValue({from:(table:string)=>{
  const result={data: table==="warehouse_inventory_read" ? [{warehouse_id:"w",material_id:"m",base_uom_id:"u",on_hand_base_quantity:"3.000000",reserved_base_quantity:"1.000000",available_base_quantity:"2.000000"}] : table==="units_of_measure" ? [{id:"u",symbol:"bao"}] : [{id:"w",name:"Kho"}],error:null};
  const q={select:vi.fn(),eq:vi.fn(),in:vi.fn(),order:vi.fn(),limit:vi.fn(),then:(resolve:(v:typeof result)=>unknown)=>Promise.resolve(result).then(resolve)};
  for(const key of ["select","eq","in","order","limit"] as const)q[key].mockReturnValue(q);
  requests.push({table,...q});return q;
 }});
 const data=await loadWarehouseAvailability("a",["m"]);expect(data.positions[0].available_base_quantity).toBe("2.000000");expect(data.positions[0].baseSymbol).toBe("bao");
 const q=requests.find(row=>row.table==="warehouse_inventory_read")!;expect(q.eq).toHaveBeenCalledWith("branch_id","a");expect(q.in).toHaveBeenCalledWith("material_id",["m"]);expect(q.select.mock.calls[0][0]).not.toMatch(/cost|price|value_vnd/);expect(data.incomplete).toBe(false);
});
