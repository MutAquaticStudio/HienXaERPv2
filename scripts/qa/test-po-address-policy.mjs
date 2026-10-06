import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import postgres from 'postgres';
import { nativeRpcParameters } from './native-rpc-parameters.mjs';
import { migrationFiles } from './reconcile-current-candidate.mjs';

// Only the already-owned synthetic PostgreSQL cluster; never a cloud URL.
const directory=process.env.HX_OWNED_NATIVE_DIRECTORY;
assert.equal(directory,'/private/tmp/hx-native-goal.Qfwbz9');
const ownership=JSON.parse(await fs.readFile(`${directory}/cluster-ownership.json`,'utf8'));
const credentials=JSON.parse(await fs.readFile(`${directory}/native-private-credentials.json`,'utf8'));
const target=process.env.HX_PO_NATIVE_TARGET;
assert.ok(['CLEAN','DIVERGED'].includes(target));
assert.equal(ownership.clusterOwned,true);assert.equal(credentials.host,'127.0.0.1');assert.equal(credentials.port,54757);
const sql=postgres({host:credentials.host,port:credentials.port,username:credentials.username,password:credentials.password,database:credentials.databases[target],ssl:false,max:1,prepare:false,connect_timeout:5,onnotice:()=>{}});
const evidence={scope:'PO_ADDRESS_POLICY',target,auth:'ISOLATED_SQL_AUTH_UID_FIXTURE_NOT_BROWSER_AUTH',checks:[],failures:[],managed_qa:'NOT_MODIFIED',production:'NOT_TOUCHED'};
const id=()=>randomUUID();
const f=Object.fromEntries(['actor','employee','branch','otherBranch','role','customer','site','supplier','warehouse','otherWarehouse','missingWarehouse','buyerActor','buyerEmployee','buyerRole','foreignActor','foreignEmployee','foreignRole','unit','bag','m3','group','materialA','materialB','priceA','priceB','costA','costB'].map(key=>[key,id()]));
const code=`PA${id().replaceAll('-','').slice(0,12).toUpperCase()}`;
const when='2030-01-01T00:00:00Z';
const meta=new Map();
async function rpc(name,args,actor=f.actor){
  if(!meta.has(name)){
    const rows=await sql`select p.proargnames names,array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t) types from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=${name}`;
    assert.equal(rows.length,1,`one canonical overload: ${name}`);meta.set(name,rows[0]);
  }
  const m=meta.get(name);assert.equal(args.length,m.types.length);
  return sql.begin(async tx=>{
    await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
    evidence.actors??={};if(!evidence.actors[actor]){const [identity]=await tx`select current_user caller,current_setting('request.jwt.claim.sub',true)::uuid actor,(select rolsuper from pg_roles where rolname=current_user) superuser`;assert.equal(identity.caller,'authenticated');assert.equal(identity.superuser,false);assert.equal(identity.actor,actor);evidence.actors[actor]=identity;}
    const named=args.map((_,i)=>`${m.names[i]}=>$${i+1}::${m.types[i]}`).join(',');
    return (await tx.unsafe(`select public.${name}(${named}) value`,nativeRpcParameters(tx,args,m.types)))[0].value;
  });
}
const rejects=(name,args,code,message)=>assert.rejects(()=>rpc(name,args),e=>e.code===code&&e.message.includes(message));
async function check(name,run){try{const detail=await run();evidence.checks.push({name,status:'PASS',...detail});}catch(e){evidence.failures.push({name,code:e.code??null,message:e.message,stack:e.stack?.split('\n').slice(0,5)});}}
const lines=()=>[
  {material_id:f.materialA,ordered_uom_id:f.bag,quantity:'10',conversion_numerator:'50',conversion_denominator:'1',rounding_mode:'HALF_UP',unit_cost_vnd:'60000',purchase_price_rule_id:f.costA,purchase_price_rule_version:1,price_source_type:'CONTRACT'},
  {material_id:f.materialB,ordered_uom_id:f.m3,quantity:'2',conversion_numerator:'1',conversion_denominator:'1',rounding_mode:'HALF_UP',unit_cost_vnd:'200000',purchase_price_rule_id:f.costB,purchase_price_rule_version:1,price_source_type:'CONTRACT'},
];
const createArgs=(op=id())=>[f.branch,f.supplier,f.warehouse,when,'Synthetic PO terms',lines(),op];
async function master(address){await sql`update public.warehouses set address_text=${address} where id=${f.warehouse}`;}
async function effects(){return (await sql`select
  (select count(*)::int from public.purchase_orders where branch_id=${f.branch}) po,
  (select count(*)::int from public.purchase_order_lines l join public.purchase_orders p on p.id=l.purchase_order_id where p.branch_id=${f.branch}) lines,
  (select count(*)::int from public.supply_allocations where branch_id=${f.branch}) allocations,
  (select count(*)::int from public.receivable_obligations where branch_id=${f.branch}) ar,
  (select count(*)::int from public.payable_obligations where branch_id=${f.branch}) ap,
  (select count(*)::int from public.inventory_movements where branch_id=${f.branch}) movements,
  (select count(*)::int from public.command_receipts where actor_auth_user_id=${f.actor}) receipts`)[0];}
try{
  const [identity]=await sql`select current_database() database,host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') directory,current_setting('server_version_num') version`;
  assert.equal(identity.database,credentials.databases[target]);assert.equal(identity.host,'127.0.0.1');assert.equal(identity.port,54757);assert.equal(identity.directory,ownership.data_directory);assert.equal(identity.version,'170011');evidence.identity=identity;
  const files=await migrationFiles();const patch=files.find(file=>file.version==='20261004052921');assert.ok(patch);
  const history=await sql`select version,statements from supabase_migrations.schema_migrations order by version`;
  const extra=history.filter(row=>!files.some(file=>file.version===row.version));
  assert.deepEqual(extra.map(row=>row.version),target==='DIVERGED'?['20261002114730']:[]);
  evidence.retainedExtra=extra.map(row=>({version:row.version,sha256:createHash('sha256').update(JSON.stringify(row.statements)).digest('hex')}));
  for(const file of files.filter(file=>file!==patch))assert.deepEqual(history.find(row=>row.version===file.version)?.statements,[file.raw],`content parity ${file.version}`);
  const historical=await sql`select id,state,destination_address_snapshot from public.purchase_orders where destination_type='WAREHOUSE' and state<>'DRAFT' and btrim(destination_address_snapshot,E' \t\n\r')='' order by id`;
  evidence.historicalFinding={scope:'OWNED_SYNTHETIC_ONLY_NOT_PRODUCTION',confirmedBlankSnapshots:historical.map(row=>row.id),repairApplied:false};
  if(history.some(row=>row.version===patch.version))assert.deepEqual(history.find(row=>row.version===patch.version).statements,[patch.raw]);
  else await sql.begin(async tx=>{await tx.unsafe(patch.raw).simple();await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${patch.version},'po_warehouse_address_policy',${[patch.raw]})`;});
  assert.deepEqual(await sql`select id,state,destination_address_snapshot from public.purchase_orders where destination_type='WAREHOUSE' and state<>'DRAFT' and btrim(destination_address_snapshot,E' \t\n\r')='' order by id`,historical,'migration must not repair historical snapshots');
  const after=await sql`select version,statements from supabase_migrations.schema_migrations order by version`;
  for(const file of files)assert.deepEqual(after.find(row=>row.version===file.version)?.statements,[file.raw]);
  assert.deepEqual(after.filter(row=>!files.some(file=>file.version===row.version)),extra);
  evidence.manifest=files.map(({version,path,sha256})=>({version,path,sha256}));evidence.migrationParity='PASS_CANONICAL_CONTENT_WITH_RETAINED_DIVERGENCE';
  evidence.checks.push({name:'AFFECTED_MIGRATION_CANDIDATE_CONTENT',status:'PASS',canonicalCount:files.length,extraRetained:extra.length});
  await sql.begin(async tx=>{
    await tx`insert into auth.users(id) values(${f.actor})`;
    await tx`insert into public.branches(id,code,name) values(${f.branch},${code},'Isolated PO QA'),(${f.otherBranch},${code+'B'},'Isolated other branch')`;
    await tx`insert into public.employees(id,auth_user_id,code,display_name) values(${f.employee},${f.actor},${code},'Isolated Owner')`;
    await tx`insert into public.roles(id,code,name) values(${f.role},${code.toLowerCase()},'PO permissions')`;
    const permissions=['purchasing.create','purchasing.confirm','purchasing.read','purchasing.price.read','orders.create','roles.manage','inventory.receive'];
    await tx`insert into public.role_permissions(role_id,permission_code) select ${f.role},code from public.permissions where code=any(${permissions})`;
    await tx`insert into public.employee_branch_access(employee_id,branch_id,role_id) values(${f.employee},${f.branch},${f.role})`;
    await tx`insert into public.customers(id,branch_id,code,display_name) values(${f.customer},${f.branch},${code},'Synthetic customer')`;
    await tx`insert into public.customer_sites(id,customer_id,code,name,address_text,receiver_name,receiver_phone) values(${f.site},${f.customer},${code},'Synthetic site','Địa chỉ công trình','Synthetic receiver','0900000000')`;
    await tx`insert into public.suppliers(id,branch_id,code,name,address_text) values(${f.supplier},${f.branch},${code},'Synthetic supplier','Địa chỉ NCC khác kho')`;
    await tx`insert into public.warehouses(id,branch_id,code,name,address_text) values(${f.warehouse},${f.branch},${code},'Synthetic warehouse','  Địa chỉ kho hợp lệ\t'),(${f.otherWarehouse},${f.otherBranch},${code+'B'},'Other branch warehouse','Other branch address')`;
    await tx`insert into public.material_groups(id,code,name) values(${f.group},${code},'Synthetic group')`;
    await tx`insert into public.units_of_measure(id,code,name,symbol) values(${f.unit},${code.toLowerCase()},'Synthetic unit','kg')`;
    await tx`insert into public.units_of_measure(id,code,name,symbol) values(${f.bag},${code.toLowerCase()+'p'},'Synthetic package','bao'),(${f.m3},${code.toLowerCase()+'v'},'Synthetic volume','m³')`;
    await tx`insert into public.materials(id,group_id,code,name,base_uom_id) values(${f.materialA},${f.group},${code+'A'},'Synthetic A',${f.unit}),(${f.materialB},${f.group},${code+'B'},'Synthetic B',${f.m3})`;
    await tx`insert into public.purchase_price_rules(id,branch_id,supplier_id,material_id,purchase_uom_id,unit_cost_vnd,version,source_type,effective_from,created_by) values(${f.costA},${f.branch},${f.supplier},${f.materialA},${f.bag},60000,1,'CONTRACT','2020-01-01',${f.actor}),(${f.costB},${f.branch},${f.supplier},${f.materialB},${f.m3},200000,1,'CONTRACT','2020-01-01',${f.actor})`;
    await tx`insert into public.material_uom_conversions(material_id,from_uom_id,to_uom_id,numerator,denominator,conversion_type,settlement_allowed,source_note) values(${f.materialA},${f.bag},${f.unit},50,1,'PACKAGING',true,'Fixture conversion reused from existing native QA, not a production rule')`;
    await tx`insert into public.warehouses(id,branch_id,code,name,address_text) values(${f.missingWarehouse},${f.branch},${code+'M'},'Synthetic missing-address warehouse',null)`;
    await tx`insert into auth.users(id) values(${f.buyerActor}),(${f.foreignActor})`;
    await tx`insert into public.employees(id,auth_user_id,code,display_name) values(${f.buyerEmployee},${f.buyerActor},${code+'U'},'Synthetic purchasing actor'),(${f.foreignEmployee},${f.foreignActor},${code+'F'},'Synthetic other-branch actor')`;
    await tx`insert into public.roles(id,code,name) values(${f.buyerRole},${code.toLowerCase()+'u'},'Purchasing without warehouse management'),(${f.foreignRole},${code.toLowerCase()+'f'},'Other branch purchaser')`;
    await tx`insert into public.role_permissions(role_id,permission_code) values(${f.buyerRole},'purchasing.create'),(${f.buyerRole},'purchasing.read'),(${f.foreignRole},'purchasing.create'),(${f.foreignRole},'roles.manage')`;
    await tx`insert into public.employee_branch_access(employee_id,branch_id,role_id) values(${f.buyerEmployee},${f.branch},${f.buyerRole}),(${f.foreignEmployee},${f.otherBranch},${f.foreignRole})`;
    await tx`insert into public.pricing_rules(id,branch_id,scope_type,material_id,price_uom_id,unit_price_vnd,version,source_type,effective_from,created_by) values(${f.priceA},${f.branch},'DEFAULT',${f.materialA},${f.bag},80000,1,'LIST','2020-01-01',${f.actor}),(${f.priceB},${f.branch},'DEFAULT',${f.materialB},${f.m3},250000,1,'LIST','2020-01-01',${f.actor})`;
  });
  evidence.fixture={branch:f.branch,actor:f.actor,units:{A:'bao -> kg, fixture PACKAGING 50/1',B:'m³ -> m³, 1/1'},expectedTotalVnd:'1000000'};
  let validPo,legacyPo;
  await check('A_D_VALID_SOURCE_TWO_LINES',async()=>{
    validPo=await rpc('create_purchase_order_draft',createArgs());
    const [po]=await sql`select destination_address_snapshot from public.purchase_orders where id=${validPo}`;assert.equal(po.destination_address_snapshot,'Địa chỉ kho hợp lệ');
    const [total]=await sql`select count(*)::int count,sum(line_total_cost_vnd)::text total from public.purchase_order_lines where purchase_order_id=${validPo}`;assert.deepEqual(total,{count:2,total:'1000000'});return {po:validPo,totalVnd:'1000000'};
  });
  await check('B_C_REJECT_NULL_EMPTY_ASCII_UNICODE_BLANK_RPC_NO_PARTIAL_EFFECTS',async()=>{
    const inputs=[null,'','   ','\t\r\n\v\f','\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'];
    for(const address of inputs){await master(address);const before=await effects();await rejects('create_purchase_order_draft',createArgs(),'22023','warehouse_address_required');assert.deepEqual(await effects(),before);assert.equal((await sql`select private.normalize_po_warehouse_address(${address}) value`)[0].value,null);}
    return {invalidCases:inputs.length};
  });
  await check('E_F_RETRY_AFTER_VALIDATION_REPAIR_AND_COMMITTED_RETRY_IMMUTABLE',async()=>{
    const args=createArgs();await master(null);const before=await effects();await rejects('create_purchase_order_draft',args,'22023','warehouse_address_required');assert.deepEqual(await effects(),before);
    await rpc('save_catalog_record',['warehouses',f.warehouse,f.branch,{address_text:'Địa chỉ được bổ sung'},{address_text:null},'Bổ sung trước tạo PO',id()]);
    const po=await rpc('create_purchase_order_draft',args);const once=await effects();await master(null);assert.equal(await rpc('create_purchase_order_draft',args),po);assert.deepEqual(await effects(),once);
    assert.equal((await sql`select destination_address_snapshot from public.purchase_orders where id=${po}`)[0].destination_address_snapshot,'Địa chỉ được bổ sung');
    const changed=[...args];changed[4]='Changed terms';await rejects('create_purchase_order_draft',changed,'23505','operation_payload_conflict');
    await sql`delete from public.role_permissions where role_id=${f.role} and permission_code='purchasing.create'`;
    await rejects('create_purchase_order_draft',args,'42501','forbidden');
    await sql`insert into public.role_permissions(role_id,permission_code) values(${f.role},'purchasing.create')`;
    return {po,onePo:true,successfulRetryPermissionRechecked:true};
  });
  await check('G_LEGACY_DRAFT_BLANK_BLOCKED_CONFIRM_AND_NO_RECEIPT',async()=>{
    await master('Địa chỉ hiện tại');legacyPo=await rpc('create_purchase_order_draft',createArgs());
    // Isolated admin fixture represents an old DRAFT, not a current valid RPC creation.
    await sql`update public.purchase_orders set destination_address_snapshot='\t \n' where id=${legacyPo}`;
    const args=[legacyPo,id()];const before=await effects();await rejects('confirm_purchase_order',args,'22023','purchase_order_destination_address_required');assert.deepEqual(await effects(),before);
    assert.equal((await sql`select state from public.purchase_orders where id=${legacyPo}`)[0].state,'DRAFT');return {po:legacyPo,fixture:'SIMULATED_LEGACY_DRAFT_ONLY'};
  });
  await check('H_EXPLICIT_SNAPSHOT_REFRESH_VERSION_AUDIT_RETRY',async()=>{
    assert.ok(legacyPo);await master('  Kho mới\n');const args=[legacyPo,1,f.warehouse,'Owner cập nhật snapshot DRAFT',id()];
    const invalid=[...args];invalid[2]=f.otherWarehouse;await rejects('update_purchase_order_warehouse',invalid,'23503','supplier_or_warehouse_invalid');
    assert.equal(await rpc('update_purchase_order_warehouse',args),legacyPo);
    await master('Địa chỉ master thay sau refresh');assert.equal(await rpc('update_purchase_order_warehouse',args),legacyPo);
    const [po]=await sql`select draft_version,destination_address_snapshot from public.purchase_orders where id=${legacyPo}`;assert.equal(po.draft_version,2);assert.equal(po.destination_address_snapshot,'Kho mới');
    const audit=await sql`select reason,changed_fields from public.audit_events where entity_id=${legacyPo} and trace_id=${args[4]}`;assert.equal(audit.length,1);assert.equal(audit[0].reason,args[3]);assert.ok(audit[0].changed_fields.includes('destination_address_snapshot'));
    await rejects('update_purchase_order_warehouse',[legacyPo,1,f.warehouse,'Stale action',id()],'PT409','draft_version_conflict');
    await rpc('update_purchase_order_draft',[legacyPo,2,when,'Quantity and terms change',lines().map((line,i)=>({...line,quantity:i===0?'12':line.quantity})),id()]);assert.equal((await sql`select destination_address_snapshot from public.purchase_orders where id=${legacyPo}`)[0].destination_address_snapshot,'Kho mới');
    await rpc('confirm_purchase_order',[legacyPo,id()]);return {po:legacyPo,versionAfterLineEdit:3,reasonAudited:true};
  });
  await check('I_CONFIRMED_SNAPSHOT_IMMUTABLE',async()=>{
    assert.ok(legacyPo);const before=await sql`select destination_address_snapshot,draft_version,state from public.purchase_orders where id=${legacyPo}`;assert.equal(before[0].state,'CONFIRMED');await master('Master thay đổi sau chốt');assert.deepEqual(await sql`select destination_address_snapshot,draft_version,state from public.purchase_orders where id=${legacyPo}`,before);
    await rejects('update_purchase_order_warehouse',[legacyPo,3,f.warehouse,'Forbidden confirmed refresh',id()],'23514','purchase_order_not_editable');return {po:legacyPo};
  });
  await check('J_DIRECT_DELIVERY_CUSTOMER_SITE_NOT_SUPPLIER_OR_WAREHOUSE',async()=>{
    const sales=lines().map((line,i)=>{const {unit_cost_vnd,purchase_price_rule_id,purchase_price_rule_version,...rest}=line;return {...rest,unit_price_vnd:i===0?'80000':'250000',pricing_rule_id:i===0?f.priceA:f.priceB,pricing_rule_version:1,price_source_type:'LIST'};});
    const so=await rpc('create_sales_order_draft',[f.branch,f.customer,f.site,when,'Direct test',sales,id()]);
    const source=await sql`select id from public.sales_order_lines where sales_order_id=${so} order by line_number`;
    const purchase=lines().map((line,i)=>({...line,linked_sales_order_line_id:source[i].id}));await master(null);
    const po=await rpc('create_direct_purchase_from_sales_order',[so,f.supplier,purchase,when,id()]);
    const [row]=await sql`select destination_type,destination_address_snapshot from public.purchase_orders where id=${po}`;assert.equal(row.destination_type,'CUSTOMER_SITE');assert.equal(row.destination_address_snapshot,'Địa chỉ công trình');return {po,source:so};
  });

  await check('NV_01_02_06_REAL_BUYER_AND_WAREHOUSE_MANAGER',async()=>{
    const args=createArgs();args[2]=f.missingWarehouse;const before=await effects();
    await assert.rejects(()=>rpc('create_purchase_order_draft',args,f.buyerActor),e=>e.code==='22023'&&e.message==='warehouse_address_required');assert.deepEqual(await effects(),before);
    await assert.rejects(()=>rpc('save_catalog_record',['warehouses',f.missingWarehouse,f.branch,{address_text:'Unauthorized edit'},{address_text:null},'No management permission',id()],f.buyerActor),e=>e.code==='42501');
    await rpc('save_catalog_record',['warehouses',f.missingWarehouse,f.branch,{address_text:'Địa chỉ bổ sung qua catalog'},{address_text:null},'Bổ sung địa chỉ cho người mua',id()]);
    const po=await rpc('create_purchase_order_draft',args,f.buyerActor);
    assert.equal((await sql`select state,destination_address_snapshot from public.purchase_orders where id=${po}`)[0].state,'DRAFT');
    await assert.rejects(()=>rpc('create_purchase_order_draft',createArgs(),f.foreignActor),e=>e.code==='42501');
    await assert.rejects(()=>rpc('save_catalog_record',['warehouses',f.warehouse,f.branch,{address_text:'Wrong branch'},{address_text:null},'Foreign branch caller',id()],f.foreignActor),e=>e.code==='42501');
    const visible=await sql.begin(async tx=>{await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${f.foreignActor},true)`;return tx`select id from public.purchase_orders where id=${po}`;});assert.equal(visible.length,0);
    await master(null);const forged=lines().map(line=>({...line,destination_address_snapshot:'Forged client address'}));const beforeForged=await effects();await rejects('create_purchase_order_draft',[f.branch,f.supplier,f.warehouse,when,'Forged snapshot',forged,id()],'22023','warehouse_address_required');assert.deepEqual(await effects(),beforeForged);
    const [signature]=await sql`select p.proargnames names from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_purchase_order_draft'`;assert.ok(!signature.names.includes('destination_address_snapshot'));
    return {po,buyer:f.buyerActor,manager:f.actor,foreignActor:f.foreignActor,foreignVisibleRows:0,snapshotClientOverrideRejected:true};
  });
  await check('NV_03_07_PARTIAL_RECEIPTS_STOCK_AP_RETRY_AND_OVER_RECEIVE',async()=>{
    await master('Kho cho đối chiếu nhận hàng');const before=await effects();const po=await rpc('create_purchase_order_draft',createArgs());
    const [draft]=await sql`select state,supplier_id,warehouse_id,destination_address_snapshot,commercial_terms,expected_at from public.purchase_orders where id=${po}`;assert.equal(draft.state,'DRAFT');assert.equal(draft.supplier_id,f.supplier);assert.equal(draft.warehouse_id,f.warehouse);assert.equal(draft.destination_address_snapshot,'Kho cho đối chiếu nhận hàng');assert.equal(draft.commercial_terms,'Synthetic PO terms');assert.equal(draft.expected_at.toISOString(),'2030-01-01T00:00:00.000Z');
    const source=await sql`select id,material_id,ordered_uom_id,base_uom_id,quantity::text,conversion_numerator::text,conversion_denominator::text,unit_cost_vnd::text,line_total_cost_vnd::text from public.purchase_order_lines where purchase_order_id=${po} order by line_number`;
    assert.equal(source.length,2);assert.equal(source[0].ordered_uom_id,f.bag);assert.equal(source[0].base_uom_id,f.unit);assert.equal(source[1].ordered_uom_id,f.m3);assert.equal(source[1].base_uom_id,f.m3);assert.equal(BigInt(source[0].line_total_cost_vnd),600000n);assert.equal(BigInt(source[1].line_total_cost_vnd),400000n);
    const afterDraft=await effects();assert.equal(afterDraft.ap,before.ap);assert.equal(afterDraft.ar,before.ar);assert.equal(afterDraft.movements,before.movements);
    const confirmation=[po,id()];await rpc('confirm_purchase_order',confirmation);const confirmed=await effects();assert.equal(confirmed.ap,before.ap);assert.equal(confirmed.ar,before.ar);assert.equal(confirmed.movements,before.movements);assert.equal(await rpc('confirm_purchase_order',confirmation),po);assert.deepEqual(await effects(),confirmed);
    const receivedAt=new Date().toISOString();const first=[po,[{purchase_order_line_id:source[0].id,received_quantity:'6'},{purchase_order_line_id:source[1].id,received_quantity:'1'}],null,receivedAt,id()];
    const r1=await rpc('receive_purchase_order',first);const once=await effects();assert.equal(await rpc('receive_purchase_order',first),r1);assert.deepEqual(await effects(),once);
    const [firstAp]=await sql`select original_amount_vnd::text amount from public.payable_obligations where purchase_receipt_id=${r1}`;assert.equal(firstAp.amount,'560000');
    const firstStock=await sql`select material_id,received_base_quantity::text quantity,inventory_value_vnd::text value from public.purchase_receipt_lines where purchase_receipt_id=${r1}`;
    assert.equal(Number(firstStock.find(x=>x.material_id===f.materialA).quantity),300);assert.equal(Number(firstStock.find(x=>x.material_id===f.materialB).quantity),1);assert.equal(BigInt(firstStock.find(x=>x.material_id===f.materialA).value),360000n);assert.equal(BigInt(firstStock.find(x=>x.material_id===f.materialB).value),200000n);
    const remaining=await sql`select l.material_id,(l.quantity-coalesce(sum(r.received_quantity),0))::text remaining from public.purchase_order_lines l left join public.purchase_receipt_lines r on r.purchase_order_line_id=l.id where l.purchase_order_id=${po} group by l.id order by l.line_number`;assert.equal(Number(remaining[0].remaining),4);assert.equal(Number(remaining[1].remaining),1);assert.equal((await sql`select state from public.purchase_orders where id=${po}`)[0].state,'CONFIRMED');
    const countsBefore=await effects();const receiptCount=(await sql`select count(*)::int n from public.purchase_receipts where purchase_order_id=${po}`)[0].n;
    await rejects('receive_purchase_order',[po,[{purchase_order_line_id:source[1].id,received_quantity:'1'},{purchase_order_line_id:source[0].id,received_quantity:'5'}],null,receivedAt,id()],'23514','receipt_exceeds_purchase_line');assert.deepEqual(await effects(),countsBefore);assert.equal((await sql`select count(*)::int n from public.purchase_receipts where purchase_order_id=${po}`)[0].n,receiptCount);
    const second=[po,[{purchase_order_line_id:source[0].id,received_quantity:'4'},{purchase_order_line_id:source[1].id,received_quantity:'1'}],null,receivedAt,id()];const r2=await rpc('receive_purchase_order',second);const finished=await effects();assert.equal(await rpc('receive_purchase_order',second),r2);assert.equal(await rpc('receive_purchase_order',first),r1);assert.deepEqual(await effects(),finished);
    const obligations=await sql`select original_amount_vnd::text amount from public.payable_obligations where purchase_receipt_id in (${r1},${r2}) order by original_amount_vnd`;assert.deepEqual(obligations.map(x=>x.amount),['440000','560000']);assert.equal(obligations.reduce((sum,x)=>sum+BigInt(x.amount),0n),1000000n);
    const movements=await sql`select m.material_id,sum(m.base_quantity_delta)::text quantity,sum(m.inventory_value_delta_vnd)::text value from public.inventory_movements m join public.purchase_receipt_lines r on r.id=m.source_purchase_receipt_line_id where r.purchase_receipt_id in (${r1},${r2}) group by m.material_id`;
    assert.equal(movements.length,2);assert.equal(Number(movements.find(x=>x.material_id===f.materialA).quantity),500);assert.equal(Number(movements.find(x=>x.material_id===f.materialB).quantity),2);assert.equal(BigInt(movements.find(x=>x.material_id===f.materialA).value),600000n);assert.equal(BigInt(movements.find(x=>x.material_id===f.materialB).value),400000n);assert.equal(finished.ar,before.ar);
    const [closed]=await sql`select state,destination_address_snapshot from public.purchase_orders where id=${po}`;assert.equal(closed.state,'CLOSED');assert.equal(closed.destination_address_snapshot,draft.destination_address_snapshot);
    return {po,lines:source.map(x=>x.id),receipts:[r1,r2],amountsVnd:['560000','440000'],totalAPVnd:'1000000',baseQuantities:{A_kg:'500',B_m3:'2'},ARDelta:0,partialRollbackVerified:true,retryDuplicateEffects:0};
  });
  await check('NV_04_EXPLICIT_CHANGE_WAREHOUSE_ONLY_VALID_SNAPSHOT',async()=>{
    await master('Kho ban đầu');const po=await rpc('create_purchase_order_draft',createArgs());
    await rpc('save_catalog_record',['warehouses',f.missingWarehouse,f.branch,{address_text:null},{address_text:'Địa chỉ bổ sung qua catalog'},'Fixture thiếu địa chỉ',id()]);
    const before=await effects();await rejects('update_purchase_order_warehouse',[po,1,f.missingWarehouse,'Kho chưa đủ thông tin',id()],'22023','warehouse_address_required');assert.deepEqual(await effects(),before);assert.equal((await sql`select draft_version from public.purchase_orders where id=${po}`)[0].draft_version,1);
    await rpc('save_catalog_record',['warehouses',f.missingWarehouse,f.branch,{address_text:'Kho nhận thay thế'},{address_text:null},'Bổ sung địa chỉ kho nhận',id()]);
    await rpc('update_purchase_order_warehouse',[po,1,f.missingWarehouse,'Chủ động đổi kho nhận',id()]);const [updated]=await sql`select warehouse_id,destination_address_snapshot,draft_version from public.purchase_orders where id=${po}`;assert.equal(updated.warehouse_id,f.missingWarehouse);assert.equal(updated.destination_address_snapshot,'Kho nhận thay thế');assert.equal(updated.draft_version,2);
    return {po,oldWarehouse:f.warehouse,newWarehouse:f.missingWarehouse,version:2};
  });
  await check('NV_08_SUPPLIER_VERIFICATION_AP_INDEPENDENT_FROM_CUSTOMER_AR',async()=>{
    const sales=lines().map((line,i)=>{const {unit_cost_vnd,purchase_price_rule_id,purchase_price_rule_version,...rest}=line;return {...rest,unit_price_vnd:i===0?'80000':'250000',pricing_rule_id:i===0?f.priceA:f.priceB,pricing_rule_version:1,price_source_type:'LIST'};});
    const so=await rpc('create_sales_order_draft',[f.branch,f.customer,f.site,when,'Direct acceptance',sales,id()]);
    const source=await sql`select id from public.sales_order_lines where sales_order_id=${so} order by line_number`;const purchase=lines().map((line,i)=>({...line,linked_sales_order_line_id:source[i].id}));await master(null);
    const before=await effects();const po=await rpc('create_direct_purchase_from_sales_order',[so,f.supplier,purchase,when,id()]);await rpc('confirm_purchase_order',[po,id()]);
    const afterCreate=await effects();assert.equal(afterCreate.ap,before.ap);assert.equal(afterCreate.ar,before.ar);assert.equal(afterCreate.movements,before.movements);
    const [snapshot]=await sql`select destination_type,destination_address_snapshot,warehouse_id from public.purchase_orders where id=${po}`;assert.equal(snapshot.destination_type,'CUSTOMER_SITE');assert.equal(snapshot.destination_address_snapshot,'Địa chỉ công trình');assert.equal(snapshot.warehouse_id,null);
    const linked=await sql`select id,linked_sales_order_line_id from public.purchase_order_lines where purchase_order_id=${po} order by line_number`;assert.deepEqual(linked.map(x=>x.linked_sales_order_line_id),source.map(x=>x.id));
    const intent=[po,linked.map((line,i)=>({purchase_order_line_id:line.id,supplier_quantity:i===0?'10':'2'})),null,'Synthetic supplier verification',id()];const fulfillment=await rpc('verify_supplier_fulfillment',intent);const posted=await effects();assert.equal(await rpc('verify_supplier_fulfillment',intent),fulfillment);assert.deepEqual(await effects(),posted);
    const [ap]=await sql`select original_amount_vnd::text amount from public.payable_obligations where supplier_fulfillment_id=${fulfillment}`;assert.equal(ap.amount,'1000000');assert.equal(posted.ar,before.ar);assert.equal(posted.movements,before.movements);assert.equal((await sql`select count(*)::int n from public.purchase_receipts where purchase_order_id=${po}`)[0].n,0);
    return {po,so,fulfillment,APVnd:'1000000',ARDelta:0,warehouseMovementDelta:0,linkedLines:linked.map(x=>x.id),customerVerification:'NOT_PERFORMED_NOT_ASSUMED'};
  });
  await check('K_BRANCH_PERMISSION_AND_VERSION_BOUNDARIES',async()=>{
    await master('Địa chỉ hợp lệ');const args=createArgs();args[2]=f.otherWarehouse;await rejects('create_purchase_order_draft',args,'23503','supplier_or_warehouse_invalid');
    await rejects('save_catalog_record',['warehouses',f.otherWarehouse,f.branch,{address_text:'Wrong branch update'},{address_text:'Other branch address'},'Not allowed across branch',id()],'42501','forbidden');
    await sql`delete from public.role_permissions where role_id=${f.role} and permission_code='roles.manage'`;
    await rejects('save_catalog_record',['warehouses',f.warehouse,f.branch,{address_text:'Unauthorized update'},{address_text:'Địa chỉ hợp lệ'},'No management permission',id()],'42501','forbidden');
    await sql`delete from public.role_permissions where role_id=${f.role} and permission_code='purchasing.create'`;
    await rejects('create_purchase_order_draft',createArgs(),'42501','forbidden');
    await rejects('update_purchase_order_warehouse',[validPo,1,f.warehouse,'No creation permission',id()],'42501','forbidden');
    return {crossBranchWarehouseRejected:true,missingPermissionRejected:true};
  });
}catch(e){evidence.failures.push({name:'SETUP',code:e.code??null,message:e.message,stack:e.stack?.split('\n').slice(0,6)});}
finally{await sql.end({timeout:3});evidence.status=evidence.failures.length?'FAIL':'PASS_NATIVE_TARGETED';evidence.harnessSha256=createHash('sha256').update(await fs.readFile(new URL(import.meta.url))).digest('hex');const output=process.env.HX_PO_NATIVE_OUTPUT;assert.ok(output?.startsWith('/private/tmp/hx-po-business-20261004/'));await fs.writeFile(output,JSON.stringify(evidence,null,2));console.log(JSON.stringify({target,status:evidence.status,checks:evidence.checks,failures:evidence.failures,artifact:output}));if(evidence.failures.length)process.exitCode=1;}
