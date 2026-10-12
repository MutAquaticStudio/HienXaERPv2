import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {argumentsForRun,openQA,stockFixture} from '../remediation/native-fixture.mjs';
const a=argumentsForRun(),q=await openQA(a),d=JSON.parse(await readFile(a.documents,'utf8')).documents;
try {
 const docs=await q.sql.begin(async tx=> {
  const stock=await stockFixture(tx,{...q,fixtures:d.fixtures},'30',{prepareOnly:true});
  await tx.unsafe('set local role postgres');
  const kg=randomUUID(),bag=randomUUID(),mat=randomUUID(),saleRule=randomUUID(),buyRule=randomUUID();
  const [group]=await tx`select group_id from public.materials where id=${stock.material}`;
  await tx`insert into public.units_of_measure(id,code,name,symbol,decimal_scale) values
   (${kg},${'kg'+stock.prefix.toLowerCase()},'Kilogram QA','kg',6),(${bag},${'bag'+stock.prefix.toLowerCase()},'Bao25kg QA','bao25kg',0)`;
  await tx`insert into public.materials(id,group_id,code,name,base_uom_id) values (${mat},${group.group_id},${stock.prefix+'_KG'},'QA vật tư bán theo bao25kg',${kg})`;
  await tx`insert into public.material_uom_conversions(material_id,from_uom_id,to_uom_id,numerator,denominator,conversion_type,rounding_mode,settlement_allowed,effective_from)
   values (${mat},${bag},${kg},25,1,'PACKAGING','HALF_UP',true,'2020-01-01')`;
  await tx`insert into public.pricing_rules(id,branch_id,scope_type,material_id,price_uom_id,unit_price_vnd,version,source_type,effective_from,created_by)
   values (${saleRule},${d.branch},'DEFAULT',${mat},${bag},25000,1,'LIST','2020-01-01',${d.fixtures.owner})`;
  await tx`insert into public.purchase_price_rules(id,branch_id,supplier_id,material_id,purchase_uom_id,unit_cost_vnd,version,source_type,effective_from,created_by)
   values (${buyRule},${d.branch},${d.fixtures.supplier},${mat},${kg},1000,1,'CONTRACT','2020-01-01',${d.fixtures.owner})`;
  return {...stock,branch:d.branch,kg,bag,secondMaterial:mat,saleRule,buyRule};
 });
 await writeFile(a.out,JSON.stringify({documents:docs,scope:'QA_MASTER_ONLY_MULTIMATERIAL_M3_KG_BAG25',productionAccess:'NONE'},null,2));
 console.log({status:'READY',materials:2,uoms:3});
} finally {await q.sql.end({timeout:3});}
