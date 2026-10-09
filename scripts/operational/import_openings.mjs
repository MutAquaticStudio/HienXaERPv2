// Operator-only import. No connection strings, Auth provisioning, invitations or retries.
import {createHash} from 'node:crypto';
import Decimal from 'decimal.js';
import {canonicalTemporal,isTemporalType,masterValuesEqual} from './temporal_compare.mjs';
const D=Decimal.clone({precision:60,rounding:Decimal.ROUND_HALF_UP});
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const q=async(db,text,args=[]) => (await db.query(text,args)).rows;
const one=async(db,text,args=[]) => (await q(db,text,args))[0];
const required=(v,name)=>{if(v===null||v===undefined||v==='')throw Error('IMPORT_REQUIRED:'+name);return v;};
const num=(v,name)=>{const n=new D(required(v,name));if(!n.isFinite()||n.isNegative())throw Error('IMPORT_INVALID_NUMBER:'+name);return n;};
const temporalCatalog=new WeakMap();

async function master(tx,table,data,keyColumns){
 const cols=Object.keys(data);
 let catalog=temporalCatalog.get(tx);
 if(!catalog){catalog=new Map();temporalCatalog.set(tx,catalog);}
 if(!catalog.has(table)){
  const types=await q(tx,"select a.attname name,t.typname type from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace join pg_catalog.pg_type t on t.oid=a.atttypid where n.nspname='public' and c.relname=$1 and a.attnum>0 and not a.attisdropped",[table]);
  catalog.set(table,new Map(types.map(x=>[x.name,x.type])));
 }
 const types=catalog.get(table);
 const temporal=cols.filter(c=>isTemporalType(types.get(c)));
 for(const c of temporal)canonicalTemporal(data[c],types.get(c),table+':'+c);
 const exact=temporal.map(c=>', '+c+'::text as __import_exact_'+c).join('');
 const where=keyColumns.map((c,i)=>c+'=$'+(i+1)).join(' and ');
 const rows=await q(tx,'select *'+exact+' from public.'+table+' where '+where,keyColumns.map(k=>data[k]));
 if(rows.length>1)throw Error('IMPORT_AMBIGUOUS_MASTER:'+table);
 if(rows.length){
  const old=rows[0];
  for(const c of cols){
   const a=isTemporalType(types.get(c))?old['__import_exact_'+c]:old[c],b=data[c];
   if(!masterValuesEqual(a,b,types.get(c),table+':'+c))throw Error('IMPORT_MASTER_CONFLICT:'+table+':'+c);
  }
  return old.id;
 }
 return (await one(tx,'insert into public.'+table+' ('+cols.join(',')+') values ('+
   cols.map((_,i)=>'$'+(i+1)).join(',')+') returning id',Object.values(data))).id;
}

export async function importOpenings(db,pkg,options){
 const {operationId,actorId,bindings,mode='FULL'}=options;
 if(!/^[a-f0-9]{64}$/.test(pkg.source_sha256??''))throw Error('IMPORT_SOURCE_HASH_REQUIRED');
 required(operationId,'operationId');required(actorId,'actorId');
 const cutover=required(pkg.meta.test_cutover??pkg.meta.cutover_at,'cutover');
 if(!/[+-]\d{2}:\d{2}$|Z$/.test(cutover)||!Number.isFinite(Date.parse(cutover)))throw Error('IMPORT_CUTOVER_INVALID');
 if(pkg.meta.rounding!==undefined&&!pkg.meta.rounding.includes('ROUND_HALF_UP'))throw Error('IMPORT_ROUNDING_UNSUPPORTED');
 const t=pkg.tables;
 if(mode==='FULL'&&['M','N','O'].some(s=>t[s].length))throw Error('IMPORT_OPEN_DOCUMENT_MAPPING_UNRESOLVED');
 if(!['FULL','OPENINGS_AND_TRANSIT_ONLY'].includes(mode))throw Error('IMPORT_MODE_INVALID');
 for(const s of 'KLMNO'){
  const scope=pkg.meta.scopes?.[s];
  if(!['IN_SCOPE','NOT_IN_SCOPE'].includes(scope)||scope==='NOT_IN_SCOPE'&&t[s].length)throw Error('IMPORT_SCOPE:'+s);
 }
 const payloadHash=hash({tables:t,meta:pkg.meta,provenance:pkg.provenance,bindings,mode,actorId});
 return db.transaction(async tx=>{
  await tx.exec("set local statement_timeout='30s';set local lock_timeout='5s';");
  await q(tx,'select pg_advisory_xact_lock(hashtextextended($1,0))',['operational-import:'+operationId]);
  const prior=await one(tx,'select * from private.operational_import_receipts where operation_id=$1',[operationId]);
  if(prior){
   if(prior.payload_hash!==payloadHash||prior.source_sha256!==pkg.source_sha256)throw Error('IMPORT_OPERATION_CONFLICT');
   return {...prior.result,replayed:true};
  }
  const identity=await one(tx,'select current_user actor,version() version');
  if(identity.actor!=='postgres')throw Error('IMPORT_PRIVILEGED_OPERATOR_REQUIRED');
  if(options.rehearsalAfterSection&&!identity.version.includes('PGlite'))throw Error('IMPORT_TEST_HOOK_FORBIDDEN');
  const maps={A:new Map(),B:new Map(),C:new Map(),D:new Map(),E:new Map(),F:new Map(),G:new Map(),K:new Map(),uom:new Map(),group:new Map()};
  const sources=[]; const created=[];
  const key=(...x)=>JSON.stringify(x);
  const id=(s,...x)=>required(maps[s].get(key(...x)),s+':'+x.join('/'));
  async function add(s,table,data,keys,natural){
   const value=await master(tx,table,data,keys);
   if(maps[s].has(key(...natural)))throw Error('IMPORT_DUPLICATE_SOURCE_KEY:'+s);
   maps[s].set(key(...natural),value);created.push({section:s,table,id:value,natural});return value;
  }
  async function stage(s){if(options.rehearsalAfterSection===s)await tx.exec('select 1/0;');}
  for(const r of t.A)await add('A','branches',{code:r.branch_code,name:r.branch_name,active:r.active},['code'],[r.branch_code]);
  await stage('A');
  for(const r of t.B){
   const bind=required(bindings.employees[r.employee_code],'employee binding');
   const employee=await add('B','employees',{auth_user_id:bind.authUserId,code:r.employee_code,display_name:r.display_name,
     active:false,deactivated_at:cutover},['code'],[r.employee_code]);
   const exists=await one(tx,'select id from public.employee_branch_access where employee_id=$1 and branch_id=$2 and role_id=$3',
     [employee,id('A',r.branch_code),bind.roleId]);
   if(!exists)await q(tx,'insert into public.employee_branch_access(employee_id,branch_id,role_id,active,revoked_at) values($1,$2,$3,false,$4)',
     [employee,id('A',r.branch_code),bind.roleId,cutover]);
  }
  await stage('B');
  for(const r of t.C)await add('C','customers',{branch_id:id('A',r.branch_code),code:r.customer_code,display_name:r.display_name,
   customer_type:r.customer_type,phone:r.phone,email:r.email,address_text:r.address,tax_code:r.tax_code,
   sales_owner_employee_id:r.sales_employee_code?id('B',r.sales_employee_code):null,payment_terms_days:r.payment_terms_days,
   credit_limit_vnd:r.credit_limit_vnd,active:r.active},['code'],[r.customer_code]);
  for(const r of t.D)await add('D','customer_sites',{customer_id:id('C',r.customer_code),code:r.site_code,name:r.site_name,
   address_text:r.address,receiver_name:r.receiver_name,receiver_phone:r.receiver_phone,
   sales_owner_employee_id:r.sales_employee_code?id('B',r.sales_employee_code):null,active:r.active},
   ['customer_id','code'],[r.customer_code,r.site_code]);
  for(const r of t.E)await add('E','suppliers',{branch_id:id('A',r.branch_code),code:r.supplier_code,name:r.supplier_name,
   phone:r.phone,email:r.email,tax_code:r.tax_code,address_text:r.address,payment_terms_days:r.payment_terms_days,active:r.active},
   ['branch_id','code'],[r.branch_code,r.supplier_code]);
  await stage('E');
  for(const r of t.F){
   if(!maps.uom.has(key(r.base_uom_code)))await add('uom','units_of_measure',{code:r.base_uom_code,name:r.base_uom_name,
    symbol:r.base_uom_symbol,decimal_scale:r.decimal_scale},['code'],[r.base_uom_code]);
   if(!maps.group.has(key(r.group_code)))await add('group','material_groups',{code:r.group_code,name:r.group_name},['code'],[r.group_code]);
  }
  for(const r of t.F)await add('F','materials',{group_id:id('group',r.group_code),code:r.material_code,name:r.material_name,
   base_uom_id:id('uom',r.base_uom_code),specification:r.specification,sale_enabled:r.sale_enabled,purchase_enabled:r.purchase_enabled},['code'],[r.material_code]);
  for(const r of t.F)if(r.alternate_uom_code){
   if(r.conversion_kind!=='EXACT'&&r.conversion_kind!=='PACKAGING')throw Error('IMPORT_CONVERSION_SOURCE_REVIEW_REQUIRED');
   const n=num(r.conversion_numerator,'numerator'),d=num(r.conversion_denominator,'denominator');
   if(n.isZero()||d.isZero())throw Error('IMPORT_CONVERSION_NONPOSITIVE');
   await master(tx,'material_uom_conversions',{material_id:id('F',r.material_code),from_uom_id:id('uom',r.alternate_uom_code),
    to_uom_id:id('uom',r.base_uom_code),numerator:n.toFixed(),denominator:d.toFixed(),conversion_type:r.conversion_kind,
    rounding_scale:r.decimal_scale,rounding_mode:'HALF_UP',source_note:r.source_ref,effective_from:cutover},
    ['material_id','from_uom_id','to_uom_id','effective_from']);
  }
  await stage('F');
  for(const r of t.G)await add('G','warehouses',{branch_id:id('A',r.branch_code),code:r.warehouse_code,name:r.warehouse_name,
   address_text:r.address,active:r.active},['branch_id','code'],[r.branch_code,r.warehouse_code]);
  async function write(command,payload){
   const result=await one(tx,'select private.'+command+'($1::jsonb,$2::uuid,$3::uuid) id',[JSON.stringify(payload),actorId,operationId]);
   sources.push({command,id:result.id,source_ref:payload.source_ref,branch_id:payload.branch_id});
  }
  function base(r,quantity){
   const mat=required(t.F.find(x=>x.material_code===r.material_code),'material mapping');let value=num(quantity,'quantity');
   if(r.uom_code!==mat.base_uom_code){
    if(r.uom_code!==mat.alternate_uom_code)throw Error('IMPORT_UOM_UNMAPPED');
    const n=num(mat.conversion_numerator,'numerator'),d=num(mat.conversion_denominator,'denominator');
    if(d.isZero())throw Error('IMPORT_CONVERSION_NONPOSITIVE');value=value.mul(n).div(d);
   }
   if(value.decimalPlaces()>6)throw Error('IMPORT_QUANTITY_PRECISION');return {mat,value};
  }
  for(const r of t.H){
   if(r.lot_ref)throw Error('IMPORT_LOT_MAPPING_UNRESOLVED');
   const {mat,value}=base(r,r.quantity);
   if(!value.eq(num(r.base_quantity,'base quantity')))throw Error('IMPORT_BASE_QUANTITY_MISMATCH');
   const cost=num(r.unit_cost_vnd_per_base,'unit cost');
   if(!value.mul(cost).toDecimalPlaces(0).eq(num(r.inventory_value_vnd,'inventory value')))throw Error('IMPORT_INVENTORY_VALUE_MISMATCH');
   await write('post_inventory_opening',{branch_id:id('A',r.branch_code),warehouse_id:id('G',r.branch_code,r.warehouse_code),
    material_id:id('F',r.material_code),base_uom_id:id('uom',mat.base_uom_code),location_kind:'WAREHOUSE',
    source_ref:r.source_ref,base_quantity:value.toFixed(),unit_cost:cost.toFixed(),value_vnd:r.inventory_value_vnd,
    cutover_at:cutover,source_date:r.source_date,source_row:r});
  }
  await stage('H');
  for(const s of ['I','J','L'])for(const r of t[s]){
   const original=num(r.original_amount_vnd,'original'),outstanding=num(r.outstanding_amount_vnd,'outstanding');
   if(!original.isInteger()||!outstanding.isInteger()||outstanding.gt(original))throw Error('IMPORT_DEBT_AMOUNTS');
   await write('post_finance_opening',{branch_id:id('A',r.branch_code),
    party_kind:s==='I'?'CUSTOMER':s==='J'?'SUPPLIER':'EMPLOYEE',
    party_id:s==='I'?id('C',r.customer_code):s==='J'?id('E',r.branch_code,r.supplier_code):id('B',r.employee_code),
    site_id:s==='I'&&r.site_code?id('D',r.customer_code,r.site_code):null,
    source_ref:r.source_ref,document_ref:r.document_ref??r.source_ref,original_vnd:original.toFixed(),outstanding_vnd:outstanding.toFixed(),
    due_date:r.due_date,cutover_at:cutover,source_date:r.source_date,source_row:r});await stage(s);
  }
  for(const r of t.K){
   const account=await add('K','finance_accounts',{branch_id:id('A',r.branch_code),code:r.account_code,name:r.account_name,
    account_kind:r.account_kind,created_by:actorId},['branch_id','code'],[r.branch_code,r.account_code]);
   const cash=new D(r.opening_balance_vnd);
   if(!cash.isFinite()||!cash.isInteger())throw Error('IMPORT_CASH_AMOUNT');
   await write('post_cash_opening',{branch_id:id('A',r.branch_code),account_id:account,source_ref:r.source_ref,
    amount_vnd:cash.toFixed(),cutover_at:cutover,source_date:r.source_date,statement_ref:r.statement_ref});
  }
  await stage('K');
  const workHeld=[];
  for(const r of t.O){
   workHeld.push(r.legacy_work_ref);const qty=num(r.transit_quantity,'transit quantity');if(qty.isZero())continue;
   const {mat,value}=base(r,r.transit_quantity);
   if(pkg.provenance.on_hand_excludes_transit!==true)throw Error('IMPORT_TRANSIT_DOUBLE_COUNT');
   const custody=required(pkg.provenance.work?.[r.legacy_work_ref]?.custody_ref,'custody source');
   required(r.already_posted_refs,'posted custody reference');
   const cost=num(required(bindings.transitUnitCosts?.[r.source_ref],'transit unit cost'),'transit unit cost');
   if(!value.mul(cost).toDecimalPlaces(0).eq(num(r.transit_value_vnd,'transit value')))throw Error('IMPORT_TRANSIT_VALUE_MISMATCH');
   await write('post_inventory_opening',{branch_id:id('A',r.branch_code),warehouse_id:null,
    material_id:id('F',r.material_code),base_uom_id:id('uom',mat.base_uom_code),location_kind:'IN_TRANSIT',
    custody_reference:custody,source_ref:r.source_ref,base_quantity:value.toFixed(),unit_cost:cost.toFixed(),
    value_vnd:r.transit_value_vnd,cutover_at:cutover,source_date:r.source_date,source_row:r});
  }
  await stage('O');
  const result={status:workHeld.length||t.M.length||t.N.length?'OPENINGS_POSTED_DOCUMENTS_HELD':'POSTED',
    sourceRows:pkg.source_rows,acceptedMasterOpeningRows:'ABCDEFGHIJKL'.split('').reduce((n,s)=>n+t[s].length,0),
    openDocumentRowsHeld:t.M.length+t.N.length,workRowsCustodyOnly:workHeld,
    sources,entities:created,activation:'NOT_EXECUTED',replayed:false};
  await q(tx,'insert into private.operational_import_receipts(operation_id,source_sha256,payload_hash,actor_id,source_payload,result) values($1,$2,$3,$4,$5::jsonb,$6::jsonb)',
   [operationId,pkg.source_sha256,payloadHash,actorId,JSON.stringify(pkg),JSON.stringify(result)]);
  return result;
 });
}
