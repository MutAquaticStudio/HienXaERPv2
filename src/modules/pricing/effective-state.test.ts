import {expect,it} from "vitest";
import {effectivePriceState,matchesEffectivePriceState} from "./effective-state";
const rule={active:true,effective_from:"2026-10-10T00:00:00+07:00",effective_to:"2026-10-11T00:00:00+07:00"};
const start=Date.parse("2026-10-09T17:00:00Z"),end=Date.parse("2026-10-10T17:00:00Z");
it.each([
 ["before start",start-1,"FUTURE"],["exact start",start,"ACTIVE"],["within period",start+1,"ACTIVE"],
 ["before end",end-1,"ACTIVE"],["exact end",end,"EXPIRED"],["after end",end+1,"EXPIRED"],
] as const)("%s respects inclusive start/exclusive end",(_,now,expected)=>expect(effectivePriceState(rule,now)).toBe(expected));
it("keeps inactive historical prices inactive regardless of dates",()=>expect(effectivePriceState({...rule,active:false},start)).toBe("INACTIVE"));
it("supports an unbounded end",()=>expect(effectivePriceState({...rule,effective_to:null},end+1)).toBe("ACTIVE"));
it("compares timezone offsets as absolute instants",()=>expect(effectivePriceState({...rule,effective_from:"2026-10-09T17:00:00Z"},start)).toBe("ACTIVE"));
it("fails closed for malformed stored instants",()=>expect(()=>effectivePriceState({...rule,effective_to:"invalid"},start)).toThrow("Thời gian hiệu lực"));
it.each(["ACTIVE","FUTURE","EXPIRED","INACTIVE"])("filter %s matches displayed state",state=>{
 for(const r of [rule,{...rule,active:false},{...rule,effective_from:"2026-10-12T00:00:00Z"},{...rule,effective_to:"2026-10-08T00:00:00Z"}])expect(matchesEffectivePriceState(r,state,start)).toBe(effectivePriceState(r,start)===state);
});
it("retains all historical states in the default filter",()=>expect(matchesEffectivePriceState({...rule,active:false},"",start)).toBe(true));
