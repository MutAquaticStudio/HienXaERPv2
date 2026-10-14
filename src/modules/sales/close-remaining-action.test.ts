vi.mock("server-only", () => ({}));
import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({permission:vi.fn(),rpc:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/access/context",()=>({requireInternalPermission:mocks.permission,requireCustomerAccess:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createServerSupabase:vi.fn(async()=>({rpc:mocks.rpc}))}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
vi.mock("next/navigation",()=>({redirect:(path:string)=>{throw new Error("REDIRECT:"+path);}}));
import {closeSalesOrderRemainingAction} from "./actions";
const id="a3cc4dcf-aa24-44c7-9186-c631a5571d7a",op="2b217e87-7375-4c61-b1b9-5f0de6a2b4b8";
function form(reason="  Close only remaining UAT quantity  "){const data=new FormData();data.set("entityId",id);data.set("operationId",op);data.set("reason",reason);return data;}
beforeEach(()=>{vi.clearAllMocks();mocks.permission.mockResolvedValue({});mocks.rpc.mockResolvedValue({data:id,error:null});});
describe("close remaining server action",()=>{
  it("calls only the exact canonical RPC and permission with stable receipt ID",async()=>{
    await expect(closeSalesOrderRemainingAction(form())).rejects.toThrow("remaining-closed");
    expect(mocks.permission).toHaveBeenCalledWith("orders.cancel");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("close_sales_order_remaining",{target_order_id:id,close_reason:"Close only remaining UAT quantity",operation_id:op});
    expect(mocks.revalidate).toHaveBeenCalledWith(`/admin/orders/${id}`);
  });
  it("does not invoke the RPC when the current actor is forbidden",async()=>{
    mocks.permission.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(closeSalesOrderRemainingAction(form())).rejects.toThrow("FORBIDDEN");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["","x","x".repeat(501)])("fails invalid reason before execution",async reason=>{
    await expect(closeSalesOrderRemainingAction(form(reason))).rejects.toThrow("invalid-command");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not turn an unresolved execution conflict into success",async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{code:"PT409",message:"sales_order_unresolved_execution"}});
    await expect(closeSalesOrderRemainingAction(form())).rejects.toThrow("?error=");
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
