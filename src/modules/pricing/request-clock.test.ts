import {afterEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({connection:vi.fn(async()=>undefined)}));
vi.mock("server-only",()=>({}));
vi.mock("next/server",()=>({connection:m.connection}));
import {readPricingClock} from "./request-clock";
afterEach(()=>vi.restoreAllMocks());
it("captures exactly one authoritative instant after the request boundary",async()=>{
 const instant=Date.parse("2026-10-09T17:00:00Z");
 const now=vi.spyOn(Date,"now").mockReturnValue(instant);
 expect(await readPricingClock()).toBe(instant);
 expect(m.connection).toHaveBeenCalledTimes(1);
 expect(now).toHaveBeenCalledTimes(1);
});
