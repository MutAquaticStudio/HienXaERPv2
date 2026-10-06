import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import postgres from 'postgres';
import { nativeRpcParameters } from './native-rpc-parameters.mjs';
import { readViewCatalog, prepareViewReference, compareViewCatalog } from './reconciliation-view-catalog.mjs';
import { plan, migrationFiles } from './reconcile-current-candidate.mjs';

// This runner only owns the fresh, loopback cluster recorded by this QA turn.
const directory=process.env.HX_OWNED_NATIVE_DIRECTORY;
assert.match(directory??'',/^\/private\/tmp\/hx-native-goal\.[A-Za-z0-9]+$/);
const credentials=JSON.parse(await fs.readFile(`${directory}/native-private-credentials.json`,'utf8'));
const ownership=JSON.parse(await fs.readFile(`${directory}/cluster-ownership.json`,'utf8'));
assert.equal(credentials.host,'127.0.0.1');
const options={host:credentials.host,port:credentials.port,username:credentials.username,password:credentials.password,
  database:credentials.databases.CLEAN,ssl:false,max:1,prepare:false,connect_timeout:5,onnotice:()=>{}};
const sql=postgres(options);
const evidence={scope:'OWNED_NATIVE_WORKFLOWS',checks:[],failures:[],auth:'SQL_AUTH_UID_FIXTURE_NOT_MANAGED_AUTH',storage:'NO_STORAGE_RUNTIME',managedMutation:false,production:'NOT_TOUCHED'};
evidence.executionInputs=[];
for(const file of ['test-owned-native-workflows.mjs','native-rpc-parameters.mjs','reconciliation-view-catalog.mjs','reconcile-current-candidate.mjs','qa-reconciliation-plan.json']){
  evidence.executionInputs.push({path:`scripts/qa/${file}`,sha256:createHash('sha256').update(await fs.readFile(new URL(file,import.meta.url))).digest('hex')});
}
const check=(name,detail={})=>evidence.checks.push({name,status:'PASS',...detail});
const id=()=>randomUUID();
const f=Object.fromEntries(['actor','employee','branch','otherBranch','role','customer','otherCustomer','site','otherSite','supplier','warehouse','raceWarehouse','vehicle','group','kg','bag','materialA','materialB','priceA','priceB','costA','costB','account','evidence'].map(key=>[key,id()]));
const fixtureCode=`HX${id().replaceAll('-','').slice(0,12).toUpperCase()}`;
const when='2030-01-01T00:00:00.000Z';
const receivedAt=new Date().toISOString();
const rpcMetadata=new Map();
async function metadata(name){
  if(!rpcMetadata.has(name)){
    const rows=await sql`select p.proargnames names,array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t) types
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=${name}`;
    assert.equal(rows.length,1,`RPC ${name} has exactly one overload`);
    rpcMetadata.set(name,rows[0]);
  }
  return rpcMetadata.get(name);
}
async function rpc(name,args,connection=sql){
  const m=await metadata(name);
  assert.ok(args.length<=m.types.length);
  return connection.begin(async tx=>{
    await tx.unsafe('set local role authenticated');
    await tx`select set_config('request.jwt.claim.sub',${f.actor},true)`;
    const placeholders=args.map((_,i)=>`${m.names[i]}=>$${i+1}::${m.types[i]}`).join(',');
    const [row]=await tx.unsafe(`select public.${name}(${placeholders}) as value`,nativeRpcParameters(tx,args,m.types.slice(0,args.length)));
    return row.value;
  });
}
async function rejects(name,args,code,message){
  await assert.rejects(()=>rpc(name,args),error=>error.code===code && (!message||error.message.includes(message)));
}
const saleLines=(quantities=['2','3'])=>[
  {material_id:f.materialA,ordered_uom_id:f.bag,quantity:quantities[0],conversion_numerator:'50',conversion_denominator:'1',rounding_mode:'HALF_UP',unit_price_vnd:'5000',pricing_rule_id:f.priceA,pricing_rule_version:1,price_source_type:'LIST'},
  {material_id:f.materialB,ordered_uom_id:f.kg,quantity:quantities[1],conversion_numerator:'1',conversion_denominator:'1',rounding_mode:'HALF_UP',unit_price_vnd:'700',pricing_rule_id:f.priceB,pricing_rule_version:1,price_source_type:'LIST'},
];
  const buyLines=()=>saleLines().map((line,index)=>{
  const rest={...line};
  for(const key of ['unit_price_vnd','pricing_rule_id','pricing_rule_version'])delete rest[key];
  return {...rest,unit_cost_vnd:index===0?'3000':'400',purchase_price_rule_id:index===0?f.costA:f.costB,purchase_price_rule_version:1,price_source_type:'CONTRACT'};
});
async function group(name,run){
  const selected=process.env.HX_NATIVE_WORKFLOW_GROUPS?.split(',');
  if(selected && !selected.includes(name))return;
  try{await run();check(name,{level:'NATIVE_SQL_BUSINESS_EFFECTS'});}
  catch(error){evidence.failures.push({group:name,code:error.code??null,message:error.message,stack:error.stack?.split('\n').slice(0,4).join('\n')});}
}
async function raceSameIntent(name,args){
  const m=await metadata(name),a=postgres(options),b=postgres(options);
  let releaseA,signalA,timer;
  const release=new Promise(resolve=>{releaseA=resolve;});
  const ready=new Promise(resolve=>{signalA=resolve;});
  const events={command:name,engine:evidence.identity.version,transactions:[]};
  async function execute(connection,label,hold){
    const event={label,startedAt:new Date().toISOString()};events.transactions.push(event);
    try{
      const value=await connection.begin(async tx=>{
        await tx.unsafe("set local lock_timeout='5s';set local statement_timeout='8s';set local idle_in_transaction_session_timeout='10s'").simple();
        await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${f.actor},true)`;
        event.pid=(await tx`select pg_backend_pid() pid`)[0].pid;
        const placeholders=args.map((_,i)=>`${m.names[i]}=>$${i+1}::${m.types[i]}`).join(',');
        const [row]=await tx.unsafe(`select public.${name}(${placeholders}) as value`,nativeRpcParameters(tx,args,m.types.slice(0,args.length)));
        if(hold){signalA();await release;}
        return row.value;
      });event.outcome='COMMIT';event.value=value;return {value};
    }catch(error){event.outcome='ROLLBACK';event.code=error.code;return {error};}
    finally{event.finishedAt=new Date().toISOString();}
  }
  let first,second;
  try{
    timer=setTimeout(()=>{signalA();releaseA();},9000);
    first=execute(a,'A',true);await ready;
    second=execute(b,'B',false);
    const deadline=Date.now()+4000;
    let blocking=[];
    while(Date.now()<deadline){
      const target=events.transactions.find(event=>event.label==='B');
      if(target?.pid){blocking=(await sql`select pg_blocking_pids(${target.pid}) pids`)[0].pids;if(blocking.length)break;}
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    const left=events.transactions.find(event=>event.label==='A'),right=events.transactions.find(event=>event.label==='B');
    assert.ok(left.pid && right.pid && left.pid!==right.pid,'Two independent PostgreSQL sessions required');
    assert.ok(blocking.includes(left.pid),'Transaction B actually overlaps and waits on A');events.blockedBy=blocking;
    releaseA();const [one,two]=await Promise.all([first,second]);
    assert.ok(!one.error,one.error?.message);
    if(two.error)assert.ok(['23505','23514','PT409'].includes(two.error.code),`Unexpected race SQLSTATE ${two.error.code}`);
    else assert.equal(two.value,one.value);
    assert.equal(await rpc(name,args),one.value,'Retry same intent returns committed source');
    events.finalEntity=one.value;evidence.races??=[];evidence.races.push(events);return one.value;
  }finally{
    clearTimeout(timer);releaseA();await Promise.allSettled([first,second].filter(Boolean));
    await a.end({timeout:3});await b.end({timeout:3});
  }
}
const disposableRollback=Object.assign(new Error('QA_ROLLBACK_OWNED_VIEW_MUTATION'),{code:'QA_ROLLBACK'});
try{
  const [identity]=await sql`select current_database() database,host(inet_server_addr()) host,inet_server_port() port,
    current_setting('data_directory') directory,current_setting('server_version_num') version,pg_backend_pid() pid`;
  assert.equal(identity.host,'127.0.0.1');assert.equal(identity.port,credentials.port);
  assert.equal(identity.directory,`${directory}/cluster-data`);assert.equal(identity.database,credentials.databases.CLEAN);
  assert.equal(Math.floor(Number(identity.version)/10000),17);
  assert.equal(ownership.clusterOwned,true);evidence.identity=identity;
  const files=await migrationFiles();const history=await sql`select version,statements from supabase_migrations.schema_migrations`;
  evidence.migrationManifest=files.map(({version,path,sha256})=>({version,path,sha256}));
  assert.equal(history.length,files.length);
  for(const file of files)assert.deepEqual(history.find(row=>row.version===file.version)?.statements,[file.raw]);
  check('ALL_EXECUTED_MIGRATION_CONTENT_MATCHES_CANDIDATE',{count:files.length});

  await group('VIEW_COMPARATOR_NATIVE',async()=>{
    const baseline=await readViewCatalog(text=>sql.unsafe(text),plan.targetViews);
    const adapter={begin:callback=>sql.begin(tx=>callback({unsafe:(text,params=[])=>params.length?tx.unsafe(text,params):tx.unsafe(text).simple()}))};
    const reference=await prepareViewReference(adapter,plan.targetViews,baseline);
    assert.equal(compareViewCatalog(baseline,reference).status,'MATCH');check('NATIVE_VIEW_EXACT_MATCH');
    const target=plan.targetViews[0];
    for(const [name,mutation] of [
      ['PREDICATE',`create or replace view public.${target.name} as select * from (${target.definition.replace(/;\s*$/,'')}) q where false`],
      ['SECURITY',`alter view public.${target.name} set (security_invoker=false)`],
      ['GRANTS',`grant select on public.${target.name} to anon`],
    ]){
      await assert.rejects(()=>sql.begin(async tx=>{
        await tx.unsafe(mutation).simple();
        const changed=await readViewCatalog(text=>tx.unsafe(text),plan.targetViews);
        assert.equal(compareViewCatalog(changed,reference).status,'MISMATCH');
        throw disposableRollback;
      }),error=>error===disposableRollback);
      check(`NATIVE_VIEW_${name}_MISMATCH`);
    }
    assert.equal(compareViewCatalog(baseline,[]).status,'UNRESOLVED');check('NATIVE_VIEW_MISSING_REFERENCE_UNRESOLVED');
    await sql.begin(async tx=>{
      await tx.unsafe('create temporary view hx_qa_column_probe as select 1::bigint as amount,2::integer as position').simple();
      const [{schema}]=await tx.unsafe('select nspname as schema from pg_namespace where oid=pg_my_temp_schema()');
      const names=[{schema,name:'hx_qa_column_probe'}];
      const expected=await readViewCatalog(text=>tx.unsafe(text),names);
      for(const [name,select] of [['TYPE','select 1::numeric as amount,2::integer as position'],['ORDER','select 2::integer as position,1::bigint as amount']]){
        await tx.unsafe(`drop view hx_qa_column_probe;create temporary view hx_qa_column_probe as ${select}`).simple();
        assert.equal(compareViewCatalog(await readViewCatalog(text=>tx.unsafe(text),names),expected).status,'MISMATCH');
        check(`NATIVE_VIEW_COLUMN_${name}_MISMATCH`);
      }
      await tx.unsafe('drop view hx_qa_column_probe');
    });
    evidence.nativeViewReference=reference;
  });

  await sql.begin(async tx=>{
    await tx`insert into auth.users(id) values(${f.actor})`;
    await tx`insert into public.branches(id,code,name) values(${f.branch},${fixtureCode},'Isolated QA'),(${f.otherBranch},${fixtureCode+'B'},'Isolated other branch')`;
    await tx`insert into public.employees(id,auth_user_id,code,display_name) values(${f.employee},${f.actor},${fixtureCode},'Isolated QA Owner')`;
    await tx`insert into public.roles(id,code,name) values(${f.role},${fixtureCode.toLowerCase()},'Isolated workflow permissions')`;
    const permissions=['quotation.create','quotation.send','quotation.accept','orders.create','orders.confirm','orders.cancel','orders.read','purchasing.create','purchasing.confirm','purchasing.read','purchasing.price.read','inventory.receive','inventory.count','inventory.adjust','inventory.read','inventory.cost.read','inventory.reserve','delivery.create','delivery.assign','delivery.handoff','delivery.submit','delivery.verify','delivery.read','finance.payment.post','finance.payment.reverse','finance.ar.read','finance.ap.read','finance.payment_notice.review'];
    await tx`insert into public.role_permissions(role_id,permission_code) select ${f.role},code from public.permissions where code=any(${permissions})`;
    await tx`insert into public.employee_branch_access(employee_id,branch_id,role_id) values(${f.employee},${f.branch},${f.role})`;
    await tx`insert into public.customers(id,branch_id,code,display_name,credit_limit_vnd) values(${f.customer},${f.branch},${fixtureCode},'Isolated customer',100000000),(${f.otherCustomer},${f.otherBranch},${fixtureCode+'B'},'Other scoped customer',100000000)`;
    await tx`insert into public.customer_sites(id,customer_id,code,name,address_text,receiver_name,receiver_phone) values(${f.site},${f.customer},${fixtureCode},'Isolated site','Synthetic address','Synthetic receiver','0900000000'),(${f.otherSite},${f.otherCustomer},${fixtureCode+'B'},'Other site','Synthetic other address','Other receiver','0900000001')`;
    await tx`insert into public.suppliers(id,branch_id,code,name) values(${f.supplier},${f.branch},${fixtureCode},'Isolated supplier')`;
    await tx`insert into public.warehouses(id,branch_id,code,name,address_text) values(${f.warehouse},${f.branch},${fixtureCode},'Isolated warehouse','Synthetic warehouse address')`;
    await tx`insert into public.warehouses(id,branch_id,code,name,address_text) values(${f.raceWarehouse},${f.branch},${fixtureCode+'R'},'Isolated race warehouse','Synthetic race warehouse address')`;
    await tx`insert into public.vehicles(id,branch_id,code,plate_number) values(${f.vehicle},${f.branch},${fixtureCode},${fixtureCode})`;
    await tx`insert into public.material_groups(id,code,name) values(${f.group},${fixtureCode},'Synthetic materials')`;
    await tx`insert into public.units_of_measure(id,code,name,symbol) values(${f.kg},${fixtureCode.toLowerCase()+'k'},'Synthetic kilogram','kg'),(${f.bag},${fixtureCode.toLowerCase()+'p'},'Synthetic package','bag')`;
    await tx`insert into public.materials(id,group_id,code,name,base_uom_id) values(${f.materialA},${f.group},${fixtureCode+'A'},'Synthetic material A',${f.kg}),(${f.materialB},${f.group},${fixtureCode+'B'},'Synthetic material B',${f.kg})`;
    await tx`insert into public.material_uom_conversions(material_id,from_uom_id,to_uom_id,numerator,denominator,conversion_type,settlement_allowed,source_note) values(${f.materialA},${f.bag},${f.kg},50,1,'PACKAGING',true,'Fixture-only exact package, not a production conversion')`;
    await tx`insert into public.pricing_rules(id,branch_id,scope_type,material_id,price_uom_id,unit_price_vnd,version,source_type,effective_from,created_by) values(${f.priceA},${f.branch},'DEFAULT',${f.materialA},${f.bag},5000,1,'LIST','2020-01-01',${f.actor}),(${f.priceB},${f.branch},'DEFAULT',${f.materialB},${f.kg},700,1,'LIST','2020-01-01',${f.actor})`;
    await tx`insert into public.purchase_price_rules(id,branch_id,supplier_id,material_id,purchase_uom_id,unit_cost_vnd,version,source_type,effective_from,created_by) values(${f.costA},${f.branch},${f.supplier},${f.materialA},${f.bag},3000,1,'CONTRACT','2020-01-01',${f.actor}),(${f.costB},${f.branch},${f.supplier},${f.materialB},${f.kg},400,1,'CONTRACT','2020-01-01',${f.actor})`;
    await tx`insert into public.finance_accounts(id,branch_id,code,name,account_kind,created_by) values(${f.account},${f.branch},${fixtureCode},'Isolated cash','CASH',${f.actor})`;
  });
  evidence.fixture={code:fixtureCode,conversion:'Synthetic package = 50 kg; material B base kg',expected:{saleTotal:'12100',editedQuoteTotal:'17100',purchaseTotal:'7200',firstReceipt:'3400',secondReceipt:'3800'}};

  await group('QUOTE_SALES',async()=>{
    const create=[f.branch,f.customer,f.site,when,'Synthetic terms',saleLines(),id()];
    const quote=await rpc('create_quote_draft',create);assert.equal(await rpc('create_quote_draft',create),quote);
    const [revision]=await sql`select r.* from public.quotation_revisions r where r.quotation_id=${quote}`;
    assert.equal(String(revision.total_vnd),'12100');
    const edit=[revision.id,1,when,'Edited synthetic terms',saleLines(['3','3']),id()];
    await rpc('update_quote_draft',edit);
    const [edited]=await sql`select total_vnd,draft_version from public.quotation_revisions where id=${revision.id}`;
    assert.equal(String(edited.total_vnd),'17100');
    await rpc('send_quote_revision',[revision.id,id()]);
    await rejects('update_quote_draft',[revision.id,edited.draft_version,when,'Forbidden past edit',saleLines(),id()],'23514','quote_revision_not_editable');
    await rpc('accept_quote_revision',[revision.id,'PHONE','Synthetic QA acceptance',null,id()]);
    const order=await rpc('create_sales_order_from_quote',[revision.id,when,id()]);
    const [{count:before}]=await sql`select count(*)::int count from public.receivable_obligations where branch_id=${f.branch}`;
    await rpc('confirm_sales_order',[order,id()]);
    const [{count:after}]=await sql`select count(*)::int count from public.receivable_obligations where branch_id=${f.branch}`;assert.equal(after,before);
    const linesBefore=await sql`select line_number,quantity::text,conversion_numerator::text,unit_price_vnd::text,line_total_vnd::text,pricing_rule_version from public.sales_order_lines where sales_order_id=${order} order by line_number`;
    assert.equal(linesBefore.length,2);assert.equal(linesBefore[0].line_total_vnd,'15000');assert.equal(linesBefore[1].line_total_vnd,'2100');
    await sql`update public.pricing_rules set unit_price_vnd=9000,version=2 where id=${f.priceA}`;
    assert.deepEqual(await sql`select line_number,quantity::text,conversion_numerator::text,unit_price_vnd::text,line_total_vnd::text,pricing_rule_version from public.sales_order_lines where sales_order_id=${order} order by line_number`,linesBefore);
    await sql`update public.pricing_rules set unit_price_vnd=5000,version=1 where id=${f.priceA}`;
    await rejects('create_sales_order_draft',[f.branch,f.customer,f.otherSite,when,'Scope check',saleLines(),id()],'23503','customer_or_site_invalid');
    for(const quantity of ['0','-1'])await rejects('create_sales_order_draft',[f.branch,f.customer,f.site,when,'Invalid quantity',saleLines([quantity,'3']),id()],'22023');
    await rejects('create_sales_order_draft',[f.branch,f.customer,f.site,when,'Invalid quantity',saleLines(['NaN','3']),id()],'0A000','cannot convert NaN to bigint');
    evidence.quoteSales={quote,revision:revision.id,order,expectedTotal:'17100',confirmNewAR:0,snapshotUnchanged:true};
  });

  await group('PURCHASE_RECEIPT',async()=>{
    const purchase=await rpc('create_purchase_order_draft',[f.branch,f.supplier,f.warehouse,when,'Synthetic purchasing',buyLines(),id()]);
    await rpc('confirm_purchase_order',[purchase,id()]);
    const lines=await sql`select id,line_number from public.purchase_order_lines where purchase_order_id=${purchase} order by line_number`;assert.equal(lines.length,2);
    const first=[purchase,[{purchase_order_line_id:lines[0].id,received_quantity:'1'},{purchase_order_line_id:lines[1].id,received_quantity:'1'}],null,receivedAt,id()];
    const receipt1=await rpc('receive_purchase_order',first);assert.equal(await rpc('receive_purchase_order',first),receipt1);
    const receipt2=await rpc('receive_purchase_order',[purchase,[{purchase_order_line_id:lines[0].id,received_quantity:'1'},{purchase_order_line_id:lines[1].id,received_quantity:'2'}],null,receivedAt,id()]);
    const obligations=await sql`select purchase_receipt_id,original_amount_vnd::text amount from public.payable_obligations where purchase_receipt_id in (${receipt1},${receipt2}) order by original_amount_vnd`;
    assert.deepEqual(obligations.map(row=>row.amount),['3400','3800']);
    const movements=await sql`select material_id,sum(base_quantity_delta)::text quantity,sum(inventory_value_delta_vnd)::text value from public.inventory_movements where warehouse_id=${f.warehouse} group by material_id`;
    assert.equal(movements.length,2);
    assert.equal(BigInt(movements.find(row=>row.material_id===f.materialA).value),6000n);assert.equal(BigInt(movements.find(row=>row.material_id===f.materialB).value),1200n);
    const [quantities]=await sql`select sum(base_quantity_delta) filter(where material_id=${f.materialA})=100 as a,sum(base_quantity_delta) filter(where material_id=${f.materialB})=3 as b from public.inventory_movements where warehouse_id=${f.warehouse}`;assert.equal(quantities.a,true);assert.equal(quantities.b,true);
    const [closed]=await sql`select state from public.purchase_orders where id=${purchase}`;assert.equal(closed.state,'CLOSED');
    evidence.purchaseReceipt={purchase,receipts:[receipt1,receipt2],AP:['3400','3800'],stockBase:['100','3'],stockValue:['6000','1200'],retryDuplicateEffects:0};
  });

  await group('STOCK_COUNT_RPC_GUARDS',async()=>{
    const count=await rpc('open_stock_count',[f.branch,f.warehouse,receivedAt,id()]);
    for(const quantity of ['NaN','Infinity','-Infinity','-1'])await rejects('record_stock_count_line',[count,f.materialA,quantity,null,'Synthetic finite check',null,1,id()],'22023');
    await rpc('record_stock_count_line',[count,f.materialA,'0',null,'Synthetic zero count',null,1,id()]);
    const [line]=await sql`select counted_base_quantity=0 as zero from public.stock_count_lines where stock_count_id=${count} and material_id=${f.materialA}`;assert.equal(line.zero,true);
    check('COUNT_RPC_VALID_ZERO_AND_NONFINITE_REJECTIONS',{noApprovalOrInventoryAdjustment:true});
  });

  await group('SUPPLIER_DIRECT',async()=>{
    const order=await rpc('create_sales_order_draft',[f.branch,f.customer,f.site,when,'Synthetic direct sale',saleLines(),id()]);
    await rpc('confirm_sales_order',[order,id()]);
    const lines=await sql`select id,line_number from public.sales_order_lines where sales_order_id=${order} order by line_number`;
    const payload=buyLines().map((line,index)=>({...line,linked_sales_order_line_id:lines[index].id}));
    const args=[order,f.supplier,payload,when,id()];
    const purchase=await rpc('create_direct_purchase_from_sales_order',args);assert.equal(await rpc('create_direct_purchase_from_sales_order',args),purchase);
    await rpc('confirm_purchase_order',[purchase,id()]);
    const purchaseLines=await sql`select id,line_number from public.purchase_order_lines where purchase_order_id=${purchase} order by line_number`;
    const [{movementsBefore}]=await sql`select count(*)::int "movementsBefore" from public.inventory_movements where branch_id=${f.branch}`;
    const fulfillmentArgs=[purchase,purchaseLines.map((line,index)=>({purchase_order_line_id:line.id,supplier_quantity:index===0?'2':'3'})),null,'Synthetic supplier verification',id()];
    const fulfillment=await rpc('verify_supplier_fulfillment',fulfillmentArgs);assert.equal(await rpc('verify_supplier_fulfillment',fulfillmentArgs),fulfillment);
    const [ap]=await sql`select original_amount_vnd::text amount from public.payable_obligations where supplier_fulfillment_id=${fulfillment}`;assert.equal(ap.amount,'7200');
    const [cost]=await sql`select count(*)::int count,sum(amount_delta_vnd)::text amount from public.direct_cost_entries where supplier_fulfillment_id=${fulfillment}`;assert.equal(cost.count,1);assert.equal(cost.amount,'7200');
    const [{movementsAfter}]=await sql`select count(*)::int "movementsAfter" from public.inventory_movements where branch_id=${f.branch}`;assert.equal(movementsAfter,movementsBefore);
    const [{ar}]=await sql`select count(*)::int ar from public.receivable_obligations where branch_id=${f.branch}`;assert.equal(ar,0);
    const allocations=await sql`select id,allocated_base_quantity::text quantity from public.supply_allocations where sales_order_line_id=any(${lines.map(line=>line.id)})`;
    const delivery=await rpc('create_delivery_from_allocations',[order,allocations.map(line=>({supply_allocation_id:line.id,planned_base_quantity:line.quantity})),receivedAt,id()]);
    await rpc('assign_delivery',[delivery,f.employee,f.vehicle,null,null,1,id()]);
    const version=async()=>(await sql`select version from public.deliveries where id=${delivery}`)[0].version;
    await rpc('handoff_delivery',[delivery,await version(),receivedAt,id()]);
    await rpc('mark_delivery_arrived',[delivery,await version(),id()]);
    const deliveryLines=await sql`select id,planned_base_quantity::text quantity from public.delivery_lines where delivery_id=${delivery}`;
    const result=await rpc('submit_delivery_result',[delivery,'FULL',deliveryLines.map(line=>({delivery_line_id:line.id,actual_base_quantity:line.quantity})),'Synthetic receiver','Synthetic direct delivery',null,null,await version(),id()]);
    const verifyArgs=[result,deliveryLines.map(line=>({delivery_line_id:line.id,accepted_base_quantity:line.quantity,billable_base_quantity:line.quantity})),await version(),id()];
    const verification=await rpc('verify_delivery',verifyArgs);assert.equal(await rpc('verify_delivery',verifyArgs),verification);
    const [customerAR]=await sql`select count(*)::int count,sum(original_amount_vnd)::text amount from public.receivable_obligations where delivery_verification_id=${verification}`;assert.equal(customerAR.count,1);assert.equal(customerAR.amount,'12100');
    const [directCost]=await sql`select sum(amount_delta_vnd)::text amount,count(*)::int count from public.direct_cost_entries where sales_order_id=${order}`;assert.equal(directCost.amount,'7200');assert.equal(directCost.count,1);
    const [warehouseUnchanged]=await sql`select count(*)::int count from public.inventory_movements where branch_id=${f.branch}`;assert.equal(warehouseUnchanged.count,movementsBefore);
    evidence.supplierDirect={order,purchase,fulfillment,delivery,verification,AP:'7200',cost:'7200',warehouseEffects:0,customerARBeforeVerification:0,customerARAfterVerification:'12100',retryDuplicateEffects:0};
  });

  await group('PAYMENT_ALLOCATION',async()=>{
    const debts=[];
    for(const amount of [1000,2000]){
      const source=id(),obligation=id();await sql`insert into public.opening_balance_sources(id,branch_id,side,source_ref,note) values(${source},${f.branch},'RECEIVABLE',${fixtureCode+'-'+amount},'Synthetic opening debt fixture')`;
      await sql`insert into public.receivable_obligations(id,branch_id,customer_id,site_id,opening_source_id,original_amount_vnd,due_date,recorded_by) values(${obligation},${f.branch},${f.customer},${f.site},${source},${amount},current_date,${f.actor})`;debts.push(obligation);
    }
    const args=[f.branch,'RECEIPT',f.customer,null,f.account,3000,receivedAt,'CASH','Synthetic allocation',[],0,id(),null];
    const payment=await rpc('post_payment',args);assert.equal(await rpc('post_payment',args),payment);
    const allocate=[payment,[{obligation_id:debts[0],amount_vnd:1000},{obligation_id:debts[1],amount_vnd:2000}],id()];
    assert.equal(await rpc('allocate_payment',allocate),payment);assert.equal(await rpc('allocate_payment',allocate),payment);
    const [settled]=await sql`select sum(amount_delta_vnd)::text amount,count(*)::int count from public.payment_allocations where payment_id=${payment}`;assert.equal(settled.amount,'3000');assert.equal(settled.count,2);
    await rejects('allocate_payment',[payment,[{obligation_id:debts[0],amount_vnd:1}],id()],'23514');
    const badSite=[f.branch,'RECEIPT',f.otherCustomer,null,f.account,1,receivedAt,'CASH','Other customer guard',[],0,id(),null];await rejects('post_payment',badSite,'23503','invalid_payment_party');
    const reverse=[payment,'Synthetic reversal QA',id()];const reversal=await rpc('reverse_payment',reverse);assert.equal(await rpc('reverse_payment',reverse),reversal);
    const rows=await sql`select id,reversal_of_payment_id,amount_vnd::text amount from public.payments where id=${payment} or reversal_of_payment_id=${payment}`;assert.equal(rows.length,2);assert.ok(rows.some(row=>row.id===payment));assert.ok(rows.some(row=>row.reversal_of_payment_id===payment));
    const [net]=await sql`select sum(amount_delta_vnd)::text value from public.payment_allocations where receivable_obligation_id=any(${debts})`;assert.equal(net.value,'0');
    evidence.paymentAllocation={payment,reversal,debts,allocated:'3000',allocationCount:2,reversalNet:'0',originalPaymentRetained:true,noticeRuntime:'NOT_EXECUTED'};
  });
  await group('TRUE_TWO_SESSION_DIRECT_PO',async()=>{
    const order=await rpc('create_sales_order_draft',[f.branch,f.customer,f.site,when,'Synthetic race sale',saleLines(),id()]);
    await rpc('confirm_sales_order',[order,id()]);
    const lines=await sql`select id from public.sales_order_lines where sales_order_id=${order} order by line_number`;
    const payload=buyLines().map((line,index)=>({...line,linked_sales_order_line_id:lines[index].id}));
    const purchase=await raceSameIntent('create_direct_purchase_from_sales_order',[order,f.supplier,payload,when,id()]);
    const [orders]=await sql`select count(*)::int count from public.purchase_orders where source_sales_order_id=${order}`;assert.equal(orders.count,1);
    const [allocations]=await sql`select count(*)::int count from public.supply_allocations where sales_order_line_id=any(${lines.map(line=>line.id)})`;assert.equal(allocations.count,2);
    check('RACE_DIRECT_PO_ONE_DOCUMENT_AND_EXACT_LINE_CAPACITY',{purchase,allocations:2});
  });
  await group('PAYMENT_NOTICE_NO_SETTLEMENT',async()=>{
    const source=id(),obligation=id();
    await sql`insert into public.opening_balance_sources(id,branch_id,side,source_ref,note) values(${source},${f.branch},'RECEIVABLE',${fixtureCode+'-NOTICE'},'Synthetic debt remains outstanding after notice')`;
    await sql`insert into public.receivable_obligations(id,branch_id,customer_id,site_id,opening_source_id,original_amount_vnd,due_date,recorded_by) values(${obligation},${f.branch},${f.customer},${f.site},${source},1000,current_date,${f.actor})`;
    const [before]=await sql`select (select count(*) from public.payments where branch_id=${f.branch})::int payments,
      (select count(*) from public.payment_allocations a join public.payments p on p.id=a.payment_id where p.branch_id=${f.branch})::int allocations,
      (select coalesce(sum(original_amount_vnd),0)::text from public.receivable_obligations where branch_id=${f.branch}) debt`;
    await sql`insert into public.customer_portal_memberships(auth_user_id,customer_id,membership_role) values(${f.actor},${f.customer},'OWNER')`;
    // SQL evidence metadata is solely a business-rule fixture, never Storage proof.
    await sql`insert into public.portal_evidence_objects(id,bucket_id,object_path,context_type,customer_id,uploaded_by,mime_type,declared_byte_size,final_byte_size,checksum_sha256,object_state,finalized_at) values(${f.evidence},'portal-evidence',${fixtureCode+'/synthetic.png'},'PAYMENT_NOTICE',${f.customer},${f.actor},'image/png',16,16,${'0'.repeat(64)},'READY',now())`;
    const args=[f.customer,f.evidence,3000,new Date().toISOString().slice(0,10),'Synthetic notice','Not a real transfer',id()];
    const notice=await rpc('submit_payment_notice',args);assert.equal(await rpc('submit_payment_notice',args),notice);
    const review=[notice,'ACCEPTED','Synthetic reviewed notice',1,id()];assert.equal(await rpc('review_payment_notice',review),notice);assert.equal(await rpc('review_payment_notice',review),notice);
    const [after]=await sql`select (select count(*) from public.payments where branch_id=${f.branch})::int payments,
      (select count(*) from public.payment_allocations a join public.payments p on p.id=a.payment_id where p.branch_id=${f.branch})::int allocations,
      (select coalesce(sum(original_amount_vnd),0)::text from public.receivable_obligations where branch_id=${f.branch}) debt`;
    assert.deepEqual(after,before);
    const [outstanding]=await sql`select private.current_receivable_outstanding(${obligation})::text amount`;assert.equal(outstanding.amount,'1000');
    const [reviews]=await sql`select count(*)::int count from public.payment_notice_review_events where payment_notice_id=${notice}`;assert.equal(reviews.count,1);
    evidence.notice={notice,obligation,expectedOutstanding:'1000',paymentDelta:0,allocationDelta:0,ARDelta:0,reviewEvents:1,storage:'METADATA_FIXTURE_ONLY'};
  });
  await group('PAYMENT_BOUNDS_AND_AP',async()=>{
    const debt=id(),source=id();
    await sql`insert into public.opening_balance_sources(id,branch_id,side,source_ref,note) values(${source},${f.branch},'RECEIVABLE',${fixtureCode+'-LIMIT'},'Synthetic independent bounds')`;
    await sql`insert into public.receivable_obligations(id,branch_id,customer_id,site_id,opening_source_id,original_amount_vnd,due_date,recorded_by) values(${debt},${f.branch},${f.customer},${f.site},${source},1000,current_date,${f.actor})`;
    const small=await rpc('post_payment',[f.branch,'RECEIPT',f.customer,null,f.account,500,receivedAt,'CASH','Synthetic available limit',[],0,id(),null]);
    await rejects('allocate_payment',[small,[{obligation_id:debt,amount_vnd:600}],id()],'23514');
    const large=await rpc('post_payment',[f.branch,'RECEIPT',f.customer,null,f.account,2000,receivedAt,'CASH','Synthetic debt limit',[],0,id(),null]);
    await rejects('allocate_payment',[large,[{obligation_id:debt,amount_vnd:1001}],id()],'23514');
    const foreignSource=id(),foreignDebt=id();
    await sql`insert into public.opening_balance_sources(id,branch_id,side,source_ref,note) values(${foreignSource},${f.otherBranch},'RECEIVABLE',${fixtureCode+'-FOREIGN'},'Synthetic other branch')`;
    await sql`insert into public.receivable_obligations(id,branch_id,customer_id,site_id,opening_source_id,original_amount_vnd,due_date,recorded_by) values(${foreignDebt},${f.otherBranch},${f.otherCustomer},${f.otherSite},${foreignSource},1000,current_date,${f.actor})`;
    await rejects('allocate_payment',[large,[{obligation_id:foreignDebt,amount_vnd:1}],id()],'42501','allocation_scope_mismatch');
    const payables=[];
    for(const amount of [1000,2000]){
      const apSource=id(),ap=id();await sql`insert into public.opening_balance_sources(id,branch_id,side,source_ref,note) values(${apSource},${f.branch},'PAYABLE',${fixtureCode+'-AP-'+amount},'Synthetic AP')`;
      await sql`insert into public.payable_obligations(id,branch_id,supplier_id,opening_source_id,original_amount_vnd,due_date,recorded_by) values(${ap},${f.branch},${f.supplier},${apSource},${amount},current_date,${f.actor})`;payables.push(ap);
    }
    const disburse=[f.branch,'DISBURSEMENT',null,f.supplier,f.account,3000,receivedAt,'CASH','Synthetic supplier payment',payables.map((obligation,index)=>({obligation_id:obligation,amount_vnd:index===0?1000:2000})),0,id(),null];
    const payment=await rpc('post_payment',disburse);assert.equal(await rpc('post_payment',disburse),payment);
    const [allocated]=await sql`select count(*)::int count,sum(amount_delta_vnd)::text amount from public.payment_allocations where payment_id=${payment}`;assert.equal(allocated.count,2);assert.equal(allocated.amount,'3000');
    const reversal=await rpc('reverse_payment',[payment,'Synthetic supplier payment reversal',id()]);
    const [net]=await sql`select sum(amount_delta_vnd)::text amount from public.payment_allocations where payable_obligation_id=any(${payables})`;assert.equal(net.amount,'0');
    const [invalidEffects]=await sql`select count(*)::int count from public.payment_allocations where payment_id in (${small},${large})`;assert.equal(invalidEffects.count,0);
    evidence.paymentBounds={availableLimitRejected:true,debtLimitRejected:true,foreignBranchCustomerSiteRejected:true,failedAllocationEffects:0,APPayment:payment,reversal,allocated:'3000',reversalNet:'0'};
  });
  await group('PO_ADDRESS_CONTRACT_DIAGNOSTICS',async()=>{
    // Characterize existing behavior without approving an address policy.
    await sql`insert into public.role_permissions(role_id,permission_code) values(${f.role},'roles.manage')`;
    await sql`update public.suppliers set address_text='Synthetic supplier contact ONLY' where id=${f.supplier}`;
    const facts=async operation=>{
      const [row]=await sql`select
        (select count(*)::int from public.purchase_orders where branch_id=${f.branch}) documents,
        (select count(*)::int from public.purchase_order_lines l join public.purchase_orders p on p.id=l.purchase_order_id where p.branch_id=${f.branch}) lines,
        (select count(*)::int from public.payable_obligations where branch_id=${f.branch}) ap,
        (select count(*)::int from public.receivable_obligations where branch_id=${f.branch}) ar,
        (select count(*)::int from public.inventory_movements where branch_id=${f.branch}) inventory,
        (select count(*)::int from public.command_receipts where operation_id=${operation}) command`;
      return row;
    };
    const updateWarehouse=(warehouse,from,to)=>rpc('save_catalog_record',['warehouses',warehouse,f.branch,{address_text:to},{address_text:from},'Synthetic address diagnostic update',id()]);
    const observations=[];
    for(const [label,formText] of [['MISSING',null],['EMPTY',''],['WHITESPACE','   ']]){
      const warehouse=id(),operation=id();
      // Source saveCatalogAction trims optional text to NULL; this is not a browser execution.
      const normalized=formText===null?null:formText.trim()||null;assert.equal(normalized,null);
      await rpc('save_catalog_record',['warehouses',warehouse,f.branch,{code:fixtureCode+'-'+label,name:'Synthetic receiving warehouse '+label,address_text:normalized,active:true},null,'Synthetic warehouse via catalog RPC',id()]);
      const [source]=await sql`select address_text,active from public.warehouses where id=${warehouse}`;assert.equal(source.address_text,null);assert.equal(source.active,true);
      const args=[f.branch,f.supplier,warehouse,when,'Synthetic PO address diagnostic',buyLines(),operation];
      const before=await facts(operation);let failure;
      try{await rpc('create_purchase_order_draft',args);}catch(error){failure=error;}
      assert.ok(failure);assert.equal(failure.code,'23502');assert.equal(failure.schema_name,'public');assert.equal(failure.table_name,'purchase_orders');assert.equal(failure.column_name,'destination_address_snapshot');
      assert.deepEqual(await facts(operation),before,'No partial PO/lines/AR/AP/inventory/receipt after failure');
      check('PO_ADDRESS_'+label+'_EXACT_COLUMN_REPRODUCED',{code:failure.code,column:'public.purchase_orders.destination_address_snapshot',businessEffects:0,classification:'POLICY_UNRESOLVED_NOT_FRIENDLY_VALIDATION_PASS'});
      const receivingAddress='Synthetic receiving address '+label;await updateWarehouse(warehouse,null,receivingAddress);
      const purchase=await rpc('create_purchase_order_draft',args);assert.equal(await rpc('create_purchase_order_draft',args),purchase);
      const [saved]=await sql`select p.destination_type,p.destination_address_snapshot,p.supplier_address_snapshot,count(l.id)::int lines,sum(l.line_total_cost_vnd)::text total from public.purchase_orders p join public.purchase_order_lines l on l.purchase_order_id=p.id where p.id=${purchase} group by p.id`;
      assert.equal(saved.destination_type,'WAREHOUSE');assert.equal(saved.destination_address_snapshot,receivingAddress);assert.equal(saved.supplier_address_snapshot,'Synthetic supplier contact ONLY');assert.equal(saved.lines,2);assert.equal(saved.total,'7200');
      const created=await facts(operation);assert.equal(created.documents,before.documents+1);assert.equal(created.lines,before.lines+2);assert.equal(created.command,1);
      const confirm=[purchase,id()];await rpc('confirm_purchase_order',confirm);await rpc('confirm_purchase_order',confirm);
      const confirmed=await facts(operation);assert.equal(confirmed.ap,before.ap);assert.equal(confirmed.ar,before.ar);assert.equal(confirmed.inventory,before.inventory);
      await updateWarehouse(warehouse,receivingAddress,'Changed warehouse address AFTER CONFIRM');
      const [snapshot]=await sql`select destination_address_snapshot,state from public.purchase_orders where id=${purchase}`;assert.equal(snapshot.destination_address_snapshot,receivingAddress);assert.equal(snapshot.state,'CONFIRMED');
      check('PO_ADDRESS_'+label+'_CORRECTED_SAME_INTENT_RETRY_SNAPSHOT',{purchase,lineCount:2,total:'7200',extraEffects:0});
      observations.push({label,formText,normalized,catalogSource:source.address_text,error:{code:failure.code,schema:failure.schema_name,table:failure.table_name,column:failure.column_name},purchase,receivingAddress,snapshot,confirmed});
    }
    for(const [label,address] of [['RAW_EMPTY',''],['RAW_WHITESPACE','   ']]){
      const warehouse=id();await rpc('save_catalog_record',['warehouses',warehouse,f.branch,{code:fixtureCode+'-'+label,name:'Synthetic raw text warehouse '+label,address_text:address,active:true},null,'Synthetic raw API diagnostic',id()]);
      const args=[f.branch,f.supplier,warehouse,when,'Synthetic raw text PO',buyLines(),id()];const purchase=await rpc('create_purchase_order_draft',args);assert.equal(await rpc('create_purchase_order_draft',args),purchase);await rpc('confirm_purchase_order',[purchase,id()]);
      const [saved]=await sql`select state,destination_address_snapshot from public.purchase_orders where id=${purchase}`;assert.equal(saved.destination_address_snapshot,address);assert.equal(saved.state,'CONFIRMED');
      observations.push({label,rawApiSource:address,purchase,observed:'EMPTY_TEXT_CREATE_AND_CONFIRM_ACCEPTED_POLICY_NOT_APPROVED'});
      check('PO_ADDRESS_'+label+'_API_DIAGNOSTIC',{observed:'ACCEPTED',classification:'POLICY_UNRESOLVED_NOT_VALID_INPUT_CERTIFICATION'});
    }
    const order=await rpc('create_sales_order_draft',[f.branch,f.customer,f.site,when,'Synthetic direct address distinction',saleLines(),id()]);await rpc('confirm_sales_order',[order,id()]);
    const [sale]=await sql`select delivery_address_snapshot from public.sales_orders where id=${order}`;const lines=await sql`select id from public.sales_order_lines where sales_order_id=${order} order by line_number`;
    const payload=buyLines().map((line,index)=>({...line,linked_sales_order_line_id:lines[index].id}));await sql`update public.warehouses set address_text=null where id=${f.warehouse}`;
    const args=[order,f.supplier,payload,when,id()],purchase=await rpc('create_direct_purchase_from_sales_order',args);assert.equal(await rpc('create_direct_purchase_from_sales_order',args),purchase);await rpc('confirm_purchase_order',[purchase,id()]);
    const [direct]=await sql`select p.destination_type,p.warehouse_id,p.site_id,p.destination_address_snapshot,p.supplier_address_snapshot,count(l.id)::int lines,sum(l.line_total_cost_vnd)::text total from public.purchase_orders p join public.purchase_order_lines l on l.purchase_order_id=p.id where p.id=${purchase} group by p.id`;
    assert.equal(direct.destination_type,'CUSTOMER_SITE');assert.equal(direct.warehouse_id,null);assert.equal(direct.site_id,f.site);assert.equal(direct.destination_address_snapshot,sale.delivery_address_snapshot);assert.notEqual(direct.destination_address_snapshot,direct.supplier_address_snapshot);assert.equal(direct.lines,2);assert.equal(direct.total,'7200');
    await sql`update public.customer_sites set address_text='Changed site AFTER CONFIRM' where id=${f.site}`;await sql`update public.suppliers set address_text='Changed supplier AFTER CONFIRM' where id=${f.supplier}`;
    const [frozen]=await sql`select destination_address_snapshot,supplier_address_snapshot from public.purchase_orders where id=${purchase}`;assert.equal(frozen.destination_address_snapshot,sale.delivery_address_snapshot);assert.equal(frozen.supplier_address_snapshot,'Synthetic supplier contact ONLY');
    check('PO_ADDRESS_VALID_CUSTOMER_SITE_TWO_LINES_FROZEN_SNAPSHOT',{purchase,lineCount:2,total:'7200',warehouseAddressRequired:false});
    evidence.poAddress={operation:'CREATE_DRAFT',destinationMode:'WAREHOUSE',column:'public.purchase_orders.destination_address_snapshot',addressSource:'public.warehouses.address_text',insertTrigger:false,mapperDropsAddress:false,callerAddressArgument:false,uiNormalizationSource:'src/modules/catalog/actions.ts::saveCatalogAction',userReachability:'AUTHORIZED_CATALOG_RPC_EXECUTED_UI_SOURCE_ACCEPTS_NOT_BROWSER_VERIFIED',resolution:'BLOCKED_EXACT_POLICY',observations,direct,frozen};
  });
  await group('COMMERCIAL_DRAFT_EDIT_NATIVE',async()=>{
    const create=[f.branch,f.customer,f.site,when,'Synthetic editable SO',saleLines(),id()];
    const order=await rpc('create_sales_order_draft',create);assert.equal(await rpc('create_sales_order_draft',create),order);
    await rejects('create_sales_order_draft',[...create.slice(0,4),'Different intent',...create.slice(5)],'23505','operation_payload_conflict');
    const edit=[order,1,when,'Edited synthetic SO',saleLines(['3','3']),id()];
    assert.equal(await rpc('update_sales_order_draft',edit),order);assert.equal(await rpc('update_sales_order_draft',edit),order);
    const [saved]=await sql`select (select sum(l.line_total_vnd)::text from public.sales_order_lines l where l.sales_order_id=s.id) total,s.draft_version from public.sales_orders s where s.id=${order}`;assert.equal(saved.total,'17100');assert.equal(saved.draft_version,2);
    const [uom]=await sql`select quantity*conversion_numerator/conversion_denominator=150 as base_valid,ordered_uom_id=${f.bag} as uom_valid,price_source_type='LIST' as price_valid from public.sales_order_lines where sales_order_id=${order} and line_number=1`;assert.ok(uom.base_valid&&uom.uom_valid&&uom.price_valid);
    await rpc('confirm_sales_order',[order,id()]);
    await rejects('update_sales_order_draft',[order,2,when,'Forbidden confirmed edit',saleLines(),id()],'23514','sales_order_not_editable');
    const purchase=await rpc('create_purchase_order_draft',[f.branch,f.supplier,f.warehouse,when,'Synthetic editable PO',buyLines(),id()]);
    const lines=buyLines();lines[0].quantity='3';
    const poEdit=[purchase,1,when,'Edited purchasing terms',lines,id()];await rpc('update_purchase_order_draft',poEdit);assert.equal(await rpc('update_purchase_order_draft',poEdit),purchase);
    const [purchaseLine]=await sql`select quantity=3 as quantity_valid,line_total_cost_vnd::text amount from public.purchase_order_lines where purchase_order_id=${purchase} and line_number=1`;assert.equal(purchaseLine.quantity_valid,true);assert.equal(purchaseLine.amount,'9000');
    await rpc('confirm_purchase_order',[purchase,id()]);
    await rejects('update_purchase_order_draft',[purchase,2,when,'Forbidden confirmed edit',buyLines(),id()],'23514','purchase_order_not_editable');
    evidence.draftEditing={order,purchase,SOExpected:'17100',POFirstLineExpected:'9000',retryDuplicateEffects:0,confirmedDocumentsEditable:false};
  });
  await group('TRUE_TWO_SESSION_COUNT_RPC',async()=>{
    const count=await rpc('open_stock_count',[f.branch,f.raceWarehouse,receivedAt,id()]);
    const record=await raceSameIntent('record_stock_count_line',[count,f.materialA,'0',null,'Synthetic same-intent finite count',null,1,id()]);
    const [lines]=await sql`select count(*)::int count,bool_and(counted_base_quantity=0) zero from public.stock_count_lines where stock_count_id=${count} and material_id=${f.materialA}`;assert.equal(lines.count,1);assert.equal(lines.zero,true);
    const [movements]=await sql`select count(*)::int count from public.inventory_movements where source_stock_count_line_id=${record}`;assert.equal(movements.count,0);
    check('RACE_COUNT_ONE_RECORD_NO_UNAPPROVED_EFFECTS',{record});
  });
}catch(error){evidence.failures.push({group:'SETUP',code:error.code??null,message:error.message,stack:error.stack?.split('\n').slice(0,4).join('\n')});}
finally{
  await sql.end({timeout:3});evidence.status=evidence.failures.length?'FAIL':'PASS_NATIVE_FOCUSED';
  const output=process.env.HX_OWNED_NATIVE_OUTPUT;assert.ok(output);await fs.writeFile(output,JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({status:evidence.status,checks:evidence.checks,failures:evidence.failures,artifact:output}));if(evidence.failures.length)process.exitCode=1;
}
