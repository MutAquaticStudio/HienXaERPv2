import {describe,expect,it,vi} from "vitest";
vi.mock("./actions",()=>({calculateEarningAction:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createServerSupabase:vi.fn()}));
import {workRuleApplies,type VerifiedWorkRule} from "./verified-work-earning-form";
const rule:VerifiedWorkRule={id:"rule",code:"LIVE_UAT_WK_VERIFY_50K",version:1,employee_id:"worker",earning_type:"PER_TRIP",calculation_kind:"FIXED_PER_BASIS",effective_from:"2026-10-07",effective_to:null};
describe("verified work source eligibility",()=>{
  it("accepts the configured employee after the effective source date",()=>expect(workRuleApplies(rule,"worker","2026-10-07T12:37:35Z")).toBe(true));
  it("rejects another employee",()=>expect(workRuleApplies(rule,"other","2026-10-08T01:00:00Z")).toBe(false));
  it("does not backfill before effective source date",()=>expect(workRuleApplies(rule,"worker","2026-10-06T12:00:00Z")).toBe(false));
  it("rejects a commission/profit rule on a Work Result",()=>expect(workRuleApplies({...rule,earning_type:"SALES_COMMISSION",calculation_kind:"PERCENT_BPS"},"worker","2026-10-08T01:00:00Z")).toBe(false));
  it("fails closed on an invalid timestamp",()=>expect(workRuleApplies(rule,"worker","invalid")).toBe(false));
  it("respects the rule expiry",()=>expect(workRuleApplies({...rule,effective_to:"2026-10-07"},"worker","2026-10-08T01:00:00Z")).toBe(false));
});
