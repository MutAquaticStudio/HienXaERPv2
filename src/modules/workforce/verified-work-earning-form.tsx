import {randomUUID} from "node:crypto";
import {createServerSupabase} from "@/lib/supabase/server";
import {formatBusinessDateTime} from "@/lib/core/business-time";
import {calculateEarningAction} from "./actions";

export type VerifiedWorkRule={id:string;code:string;version:number;employee_id:string|null;earning_type:string;calculation_kind:string;effective_from:string;effective_to:string|null};
type Relation<T>=T|T[]|null;
type SourceRow={id:string;verified_at:string;work_items:Relation<{id:string;work_number:string;branch_id:string}>;work_item_results:Relation<{work_item_assignments:Relation<{employee_id:string}>}>};
const first=<T,>(value:Relation<T>):T|null=>Array.isArray(value)?value[0]??null:value;
export function workRuleApplies(rule:VerifiedWorkRule,employeeId:string,verifiedAt:string){
  const instant=Date.parse(verifiedAt);if(!Number.isFinite(instant))return false;
  const sourceDate=new Date(instant).toISOString().slice(0,10);
  return rule.calculation_kind==="FIXED_PER_BASIS"&&["PER_JOB","PER_TRIP"].includes(rule.earning_type)
    &&(!rule.employee_id||rule.employee_id===employeeId)&&sourceDate>=rule.effective_from&&(!rule.effective_to||sourceDate<=rule.effective_to);
}
export async function VerifiedWorkEarningForm({branchId,rules}:{branchId:string;rules:VerifiedWorkRule[]}){
  const supabase=await createServerSupabase();
  const {data,error}=await supabase.from("work_item_verifications")
    .select("id,verified_at,work_items!inner(id,work_number,branch_id),work_item_results!inner(work_item_assignments!inner(employee_id))")
    .eq("work_items.branch_id",branchId).eq("work_items.execution_state","VERIFIED").order("verified_at",{ascending:false}).limit(50);
  if(error)return <p className="form-message" role="alert">{"Không tải được công việc đã xác minh. Hãy tải lại."}</p>;
  const sources=(data??[]) as unknown as SourceRow[];
  const pairs=sources.flatMap(source=>{const work=first(source.work_items),result=first(source.work_item_results),assignment=result?first(result.work_item_assignments):null;if(!work||work.branch_id!==branchId||!assignment)return[];return rules.filter(rule=>workRuleApplies(rule,assignment.employee_id,source.verified_at)).map(rule=>({source,work,rule}));});
  if(!pairs.length)return null;
  return <section className="card card-pad"><h2>{"Tính thu nhập từ công việc đã xác minh"}</h2><p className="muted">{"Chọn công việc đã xác minh và quy tắc áp dụng. Khoản thu nhập cần được duyệt trước khi chi trả."}</p><ul className="clean-list">{pairs.map(({source,work,rule})=><li key={source.id+":"+rule.id}><strong>{work.work_number} · {rule.code} · Phiên bản {rule.version}</strong><small className="table-subline mono">{source.id} · {formatBusinessDateTime(source.verified_at)}</small><form className="inline-actions" action={calculateEarningAction}><input type="hidden" name="ruleId" value={rule.id}/><input type="hidden" name="sourceKind" value="WORK_ITEM_VERIFICATION"/><input type="hidden" name="sourceId" value={source.id}/><input type="hidden" name="returnTo" value="/admin/compensation"/><input type="hidden" name="operationId" value={randomUUID()}/><button className="button button-secondary" type="submit">{"Tính thu nhập từ công việc đã xác minh"}</button></form></li>)}</ul></section>;
}
