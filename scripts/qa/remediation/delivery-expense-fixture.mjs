import {randomUUID} from 'node:crypto';
import {stockFixture,salesFixture} from './native-fixture.mjs';
export async function deliveryExpenseScenario(tx,qa,{retry=false}={}) {
 const {rpc,fixtures:f}=qa,s=await stockFixture(tx,qa,'1'),sale=await salesFixture(tx,qa,s);
 const allocation=await rpc(tx,'upsert_supply_allocation',[sale.line,'WAREHOUSE',null,f.warehouse,'1',null,null,randomUUID()]);
 const deliveries=[];
 for(const failed of retry?[true,false]:[false]){
  const delivery=await rpc(tx,'create_delivery_from_allocations',[sale.so,[{supply_allocation_id:allocation,planned_base_quantity:'1'}],new Date().toISOString(),randomUUID()]);
  const [line]=await tx`select id from public.delivery_lines where delivery_id=${delivery}`;
  await rpc(tx,'assign_delivery',[delivery,null,null,failed?'Xe QA chuyến thất bại':'Xe QA chuyến giao lại','',1,randomUUID()]);
  await rpc(tx,'handoff_delivery_actual',[delivery,2,new Date().toISOString(),randomUUID(),[{delivery_line_id:line.id,loaded_base_quantity:'1'}]]);
  const result=await rpc(tx,'submit_delivery_result',[delivery,failed?'FAILED':'FULL',[{delivery_line_id:line.id,actual_base_quantity:failed?'0':'1'}],'QA','','Ghi chi phí chuyến QA',null,3,randomUUID()]);
  const verification=await rpc(tx,'verify_delivery',[result,[{delivery_line_id:line.id,accepted_base_quantity:failed?'0':'1',billable_base_quantity:failed?'0':'1',billing_variance_reason:''}],4,randomUUID()]);
  await tx.unsafe('set local role postgres');
  if(failed){const [vl]=await tx`select id from public.delivery_verification_lines where delivery_verification_id=${verification}`;const rc=await rpc(tx,'open_return_case',[vl.id,'TRANSIT_REMAINDER','1','Còn hàng sau chuyến thất bại',null,randomUUID()]);await rpc(tx,'resolve_return_case',[rc,'RETURNED',f.warehouse,'Trả kho trước chuyến giao lại',null,1,randomUUID()]);}
  await tx.unsafe('set local role postgres');const [d]=await tx`select version from public.deliveries where id=${delivery}`;
  const [a]=await tx`select id from public.delivery_assignments where delivery_id=${delivery} and superseded_at is null`;
  deliveries.push({delivery,assignment:a.id,version:d.version,failed});
 }
 const category=await rpc(tx,'create_expense_category',[f.branch,s.prefix,'Chi phí chuyến có nguồn QA',randomUUID()]);
 return {branch:f.branch,supplier:f.supplier,stock:s,sale,deliveries,category};
}
