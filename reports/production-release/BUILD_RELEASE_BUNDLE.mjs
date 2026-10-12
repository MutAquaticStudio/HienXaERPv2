import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {migrationManifest,migrationBody} from '../../scripts/qa/migration-manifest.mjs';
process.umask(0o077);
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
const sqlPath=process.argv[2];
if(!sqlPath||!path.isAbsolute(sqlPath)||sqlPath.startsWith(root+path.sep))throw Error('Provide a new absolute artifact path outside the repository.');
const manifest=await migrationManifest();
const tail=manifest.migrations.filter(m=>m.version>'20261009224842');
if(manifest.migrations.length!==187||tail.length!==101)throw Error('Source changed; review again.');
const before=`do $preserve_before$
declare r record; data jsonb; snapshot jsonb:='{}';
begin
 perform set_config('lock_timeout','5s',true);perform set_config('statement_timeout','180s',true);
 for r in select schemaname,tablename from pg_tables where schemaname in ('public','private') order by 1,2 loop
  execute format('lock table %I.%I in share row exclusive mode',r.schemaname,r.tablename);
  execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from %I.%I x',r.schemaname,r.tablename) into data;
  snapshot:=snapshot||jsonb_build_object(r.schemaname||'.'||r.tablename,data);
 end loop;
 perform set_config('hx.release_retained_rows',snapshot::text,true);
end $preserve_before$;\n`;
const after=`do $preserve_after$
declare r record; missing bigint; actual jsonb; old_rows jsonb; preserved bigint:=0;
begin
 for r in select key,value from jsonb_each(current_setting('hx.release_retained_rows')::jsonb) loop
  old_rows:=r.value;
  execute format('select count(*) from jsonb_array_elements($1) old_row where not exists(select 1 from %I.%I new_row where to_jsonb(new_row) @> old_row)',split_part(r.key,'.',1),split_part(r.key,'.',2)) into missing using old_rows;
  if missing<>0 then raise exception 'existing_row_changed_or_missing: %',r.key;end if;
  preserved:=preserved+jsonb_array_length(old_rows);
 end loop;
 if exists(select 1 from public.inventory_movements) or exists(select 1 from public.payments)
 or exists(select 1 from public.receivable_obligations) or exists(select 1 from public.payable_obligations)
 or exists(select 1 from public.inventory_opening_sources) or exists(select 1 from public.cash_opening_balances)
 or exists(select 1 from public.opening_balance_sources)
 then raise exception 'new_financial_inventory_or_opening_fact_created';end if;
 if exists(select 1 from pg_trigger where tgrelid='public.branches'::regclass and tgname='operational_branch_initial_state')
 then raise exception 'opening_pending_initialization_not_retired';end if;
 perform private.assert_operational_opening_writers_protected();
 raise notice 'all retained business row values and keys preserved: %; no financial, inventory or opening fact created',preserved;
end $preserve_after$;\nnotify pgrst,'reload schema';\n`;
const forward=await readFile(root+'/reports/production-release/TARGET78_COMPATIBLE_FORWARD.sql','utf8');
let output=before+migrationBody(forward)+'\n';
const esc=v=>"'"+v.replaceAll("'","''")+"'";
for(const m of tail){
 output+='\n-- Applied canonical source '+m.path+'; SHA256 '+m.sha256+'\n'+migrationBody(m.sql)+'\n';
 output+='insert into supabase_migrations.schema_migrations(version,name,statements) values('+esc(m.version)+','+esc(m.path.split('/').at(-1).slice(15,-4))+',array['+"convert_from(decode('"+Buffer.from(m.sql).toString('base64')+"','base64'),'UTF8')"+']);\n';
}
output+=after;
const expected=JSON.parse(await readFile(root+'/reports/production-release/UPGRADE_BUNDLE_MANIFEST.json','utf8'));
const actual=createHash('sha256').update(output).digest('hex');
if(actual!==expected.bundleSha256)throw Error('Source differs from the rehearsed artifact; do not deploy.');
await writeFile(sqlPath,output,{mode:0o600,flag:'wx'});
console.log(JSON.stringify({status:'REPRODUCED_EXACT_REHEARSED_ARTIFACT',sha256:actual,canonicalTail:tail.length}));
