import {describe,expect,it} from "vitest";
import {finalPurchaseCostReason} from "./manual-cost";
const ref={id:"qa-rule",version:4,unitCostVnd:"80000"};
describe("authorized routine purchase cost audit",()=>{
 it("records exact reference/final/version without a generic approval note",()=>expect(JSON.parse(finalPurchaseCostReason("70000","",ref))).toEqual({adjustment:"PURCHASE_FINAL_UNIT_COST",reasonSource:"SYSTEM",beforeVnd:"80000",afterVnd:"70000",ruleId:"qa-rule",ruleVersion:4}));
 it.each(["0","-1","1.1","Infinity","NaN","9223372036854775808"])("rejects invalid VND %s",v=>expect(()=>finalPurchaseCostReason(v,"",ref)).toThrow());
 it("requires human justification without a reference",()=>expect(()=>finalPurchaseCostReason("70000","",null)).toThrow());
 it("retains human justification for above-reference exceptions",()=>{expect(()=>finalPurchaseCostReason("90000","",ref)).toThrow();expect(finalPurchaseCostReason("90000","Approved QA exception",ref)).toBe("Approved QA exception")});
 it("preserves bigint precision",()=>expect(JSON.parse(finalPurchaseCostReason("9007199254740993","",{...ref,unitCostVnd:"9007199254740994"})).afterVnd).toBe("9007199254740993"));
});
