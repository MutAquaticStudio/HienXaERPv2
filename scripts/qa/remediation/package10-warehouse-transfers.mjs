import assert from'node:assert/strict';import{randomUUID}from'node:crypto';import{readFile,writeFile}from'node:fs/promises';import{argumentsForRun,openQA,stockFixture,rejected}from'./native-fixture.mjs';
const args=argumentsForRun(),qa=await openQA(args),{sql,rpc,fixtures:f}=qa,p=JSON.parse(await readFile(args.personas,'utf8')).personas;
const report={scope:'G18_NATIVE_PARTIAL_SHORTAGE_SOURCE_VALUE_FAULT_RETRY_VERSION',database:args.database,productionAccess:'NONE',managedAuthTested:false,checks:[]},rollback=new Error('ROLLBACK_G18');
try{try{await sql.begin(async tx=>{
 const s=await stockFixture(tx,qa,'10'),to=randomUUID();await tx.unsafe('set local role postgres');await tx`insert into public.warehouses(id,branch_id,code,name,address_text) values(${to},${f.branch},${s.prefix},'Kho đến giả QA','QA cục bộ')`;
 const input=[f.branch,f.warehouse,to,s.material,'6','Chuyển kho theo nguồn mới',randomUUID()];const transfer=await rpc(tx,'create_warehouse_transfer',input);assert.equal(await rpc(tx,'create_warehouse_transfer',input),transfer);
 const ev=(kind,lot,issue,q,version,op=randomUUID())=>[transfer,kind,lot,issue,q,'Theo nguồn chuyển kho QA',version,op];
 await rejected(tx,sp=>rpc(sp,'record_warehouse_transfer_event',ev('DISPATCH',null,null,'3',null)),'transfer_version_conflict','40001');
 await rejected(tx,sp=>rpc(sp,'record_warehouse_transfer_event',ev('DISPATCH',null,null,'3.0000001',1)),'quantity_precision_exceeds_six','22023');
 await rejected(tx,sp=>rpc(sp,'record_warehouse_transfer_event',ev('DISPATCH',null,null,'3',1),p.sales.subject),'forbidden','42501');
 await tx.unsafe('set local role postgres');
 await tx.unsafe("create function pg_temp.fail_transfer_transit() returns trigger language plpgsql as $$begin if new.warehouse_transfer_id is not null and new.location_kind='IN_TRANSIT' then raise exception 'qa_transfer_movement_fault' using errcode='P0001';end if;return new;end$$;create trigger qa_fail_transfer_transit after insert on public.inventory_movements for each row execute function pg_temp.fail_transfer_transit();").simple();
 const dispatch=ev('DISPATCH',null,null,'3',1);await rejected(tx,sp=>rpc(sp,'record_warehouse_transfer_event',dispatch),'qa_transfer_movement_fault','P0001');
 await tx.unsafe('set local role postgres');assert.equal((await tx`select count(*)::int n from public.warehouse_transfer_events where transfer_id=${transfer}`)[0].n,0);assert.equal((await tx`select version from public.warehouse_transfers where id=${transfer}`)[0].version,1);await tx.unsafe('drop trigger qa_fail_transfer_transit on public.inventory_movements');
 const first=await rpc(tx,'record_warehouse_transfer_event',dispatch);assert.equal(await rpc(tx,'record_warehouse_transfer_event',dispatch),first);
 await rpc(tx,'record_warehouse_transfer_event',ev('RECEIVE',first,null,'2',2));
 const issue=await rpc(tx,'record_warehouse_transfer_event',ev('REPORT_SHORTAGE',first,null,'1',3));
 await rejected(tx,sp=>rpc(sp,'record_warehouse_transfer_event',ev('RECEIVE',first,null,'1',4)),'transfer_open_issue_requires_source','23514');
 const view=async()=>{await qa.actor(tx,f.owner);return(await tx`select * from public.warehouse_transfer_read where id=${transfer}`)[0];};
 const shortage=await view();assert.equal(shortage.in_transit_base_quantity,'1.000000');assert.equal(shortage.transfer_state,'IN_PROGRESS');assert.equal(shortage.in_transit_value_vnd,'150000');
 await rpc(tx,'record_warehouse_transfer_event',ev('APPROVE_LOSS',first,issue,'1',4));
 const second=await rpc(tx,'record_warehouse_transfer_event',ev('DISPATCH',null,null,'3',5));
 await rpc(tx,'record_warehouse_transfer_event',ev('RECEIVE',second,null,'1.000001',6));
 await rpc(tx,'record_warehouse_transfer_event',ev('RECEIVE',second,null,'1.000001',7));
 const finalArgs=ev('RECEIVE',second,null,'0.999998',8);const final=await rpc(tx,'record_warehouse_transfer_event',finalArgs);assert.equal(await rpc(tx,'record_warehouse_transfer_event',finalArgs),final);
 await rejected(tx,sp=>rpc(sp,'record_warehouse_transfer_event',ev('RECEIVE',second,null,'0.000001',9)),'transfer_event_exceeds_transit','23514');
 const closed=await view();assert.equal(closed.transfer_state,'CLOSED');assert.equal(closed.shipped_base_quantity,'6.000000');assert.equal(closed.received_base_quantity,'5.000000');assert.equal(closed.loss_base_quantity,'1.000000');assert.equal(closed.in_transit_value_vnd,'0');
 await tx.unsafe('set local role postgres');const [facts]=await tx`select sum(base_quantity_delta)::text quantity,sum(inventory_value_delta_vnd)::text value from public.inventory_movements where material_id=${s.material}`;assert.deepEqual(facts,{quantity:'9.000000',value:'1350000'});
 const [lotValues]=await tx`select sum(value_vnd)::text value from public.warehouse_transfer_events where source_dispatch_id=${second} and event_kind='RECEIVE'`;assert.equal(lotValues.value,'450000');
 const [journal]=await tx`select count(*)::int n from public.audit_events where trace_id=${finalArgs.at(-1)}`;assert.equal(journal.n,1);
 report.checks.push({name:'PARTIAL3_RECEIVE2_SHORTAGE1_APPROVED_LOSS_THEN_SECOND_LOT_FRACTIONAL_TOTAL3',status:'PASS',shortage,closed,facts,lotValues,journal,faultRolledBack:true});
 // Exact plan is preserved when ending an unshipped remainder: no stock-count adjustment.
 const partial=await rpc(tx,'create_warehouse_transfer',[f.branch,f.warehouse,to,s.material,'2','Đóng phần chưa chuyển có lý do',randomUUID()]);
 const partialLot=await rpc(tx,'record_warehouse_transfer_event',[partial,'DISPATCH',null,null,'1','Xuất thực một đơn vị',1,randomUUID()]);
 await rpc(tx,'record_warehouse_transfer_event',[partial,'RECEIVE',partialLot,null,'1','Nhận đủ phần thực xuất',2,randomUUID()]);
 await rpc(tx,'record_warehouse_transfer_event',[partial,'CLOSE_DISPATCH',null,null,'0','Dừng phần kế hoạch còn lại',3,randomUUID()]);await qa.actor(tx,f.owner);
 const [ended]=await tx`select transfer_state,planned_base_quantity::text,shipped_base_quantity from public.warehouse_transfer_read where id=${partial}`;assert.deepEqual(ended,{transfer_state:'CLOSED',planned_base_quantity:'2.000000',shipped_base_quantity:'1.000000'});report.checks.push({name:'CLOSE_UNSHIPPED_REMAINDER_PRESERVES_PLAN',status:'PASS',ended});
 throw rollback;
});}catch(e){if(e!==rollback)throw e;}report.status='PASS';report.rolledBack=true;await writeFile(args.out,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks.length}));}catch(error){await writeFile(args.out.replace(/\.json$/,'-failure.json'),JSON.stringify({...report,status:'FAIL',error:{message:error.message,code:error.code}},null,2));throw error;}finally{await sql.end({timeout:3});}
