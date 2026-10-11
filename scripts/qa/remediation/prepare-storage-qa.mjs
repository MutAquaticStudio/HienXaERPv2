// The already approved, isolated QA project only. No Production deployment path.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs, parseEnv } from 'node:util';
import { database, guard, capacity } from '../core.mjs';

const {values:args}=parseArgs({options:{env:{type:'string'},backup:{type:'string'},out:{type:'string'}}});
for(const key of ['env','backup','out'])assert.ok(args[key]);
Object.assign(process.env,parseEnv(await readFile(args.env,'utf8')));
assert.equal(guard().ref,'ffrwiglcrlumfvhubaxg');
const backup=await stat(args.backup);assert.ok(backup.size>10000);assert.equal(backup.mode&0o777,0o600);
const sql=await database();
const report={scope:'APPROVED_ISOLATED_QA_SCHEMA_FOR_REAL_STORAGE',projectRef:guard().ref,
  productionAccess:'NONE',dataRewritesAllowed:false,backupSha256:createHash('sha256').update(await readFile(args.backup)).digest('hex'),migrations:[]};
const quote=value=>'"'+value.replaceAll('"','""')+'"';
try{
  await capacity(sql);
  const [{valid}]=await sql`select bool_and(name ilike '%QA%' or name ilike '%synthetic%' or name ilike '%kiểm thử%') valid from public.branches`;
  assert.equal(valid,true,'QA business isolation is not established');
  const history=await sql`select version from supabase_migrations.schema_migrations order by version`;
  report.beforeMigrations=history.length;
  assert.equal(history.length,85,'This setup must not replay an already completed upgrade');
  const known=new Set(history.map(r=>r.version));
  const missing=(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&!known.has(f.split('_')[0])).sort();
  const [{version}]=await sql`select max(version) version from supabase_migrations.schema_migrations`;
  const olderMissing=missing.filter(f=>f.split('_')[0]<=version);
  assert.deepEqual(olderMissing,[
    '20260923162705_revoke_uat_worker_compensation_read.sql',
    '20261002071813_index_quotation_and_customer_credit_lookups.sql',
  ],'Unexpected migration drift');
  const [{n}]=await sql`select count(*)::int n from public.role_permissions rp join public.roles r on r.id=rp.role_id
    where r.code in('uat_worker','hxqa_worker') and rp.permission_code='compensation.read'`;
  assert.equal(n,0,'The old revocation would change current rights; stop instead of changing accounts');
  // QA has an original acceptance hotfix later reconciled by the immutable
  // 20261003161428 forward migration. Keep its history; never delete/rename it.
  const localVersions=new Set((await readdir('supabase/migrations')).map(f=>f.split('_')[0]));
  const extra=history.filter(row=>!localVersions.has(row.version)).map(row=>row.version);
  assert.deepEqual(extra,['20261002114730'],'Unexpected remote-only migration');
  report.historyDrift={olderMissing,extraPreserved:extra,revocationChanges:0};
  const tables=await sql`select c.table_schema,c.table_name,array_agg(c.column_name order by c.ordinal_position) columns
    from information_schema.columns c join information_schema.tables t using(table_schema,table_name)
    where t.table_type='BASE TABLE' and (c.table_schema in('public','private') or(c.table_schema='storage' and c.table_name in('objects','buckets')))
    group by c.table_schema,c.table_name order by c.table_schema,c.table_name`;
  async function snapshot(tx){const rows=[];for(const table of tables){
    const [row]=await tx.unsafe(`select count(*)::int n,md5(coalesce(string_agg(md5(to_jsonb(x)::text),',' order by to_jsonb(x)::text),'')) hash
      from(select ${table.columns.map(quote).join(',')} from ${quote(table.table_schema)}.${quote(table.table_name)}) x`);
    rows.push({schema:table.table_schema,table:table.table_name,...row});
  }return rows;}
  await sql.begin(async tx=>{
    await tx.unsafe("set local lock_timeout='5s';set local statement_timeout='120s'").simple();
    // Bound maintenance to the QA business/asset tables; no Auth lifecycle writes.
    await tx.unsafe('lock table '+tables.map(t=>quote(t.table_schema)+'.'+quote(t.table_name)).join(',')+' in share mode');
    const before=await snapshot(tx);
    for(const file of missing){
      const original=await readFile('supabase/migrations/'+file,'utf8');
      let migration=original.replace(/^(?:\s|--[^\n]*(?:\n|$))*/,'');
      if(/^begin;/i.test(migration)){
        assert.match(migration,/commit;\s*$/i,'Migration transaction cannot be safely wrapped');
        migration=migration.replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,'');
      }
      report.activeMigration=file;
      await tx.unsafe(migration).simple();
      await tx`insert into supabase_migrations.schema_migrations(version)values(${file.split('_')[0]})`;
      report.migrations.push({file,sha256:createHash('sha256').update(original).digest('hex')});
    }
    const after=await snapshot(tx);
    assert.deepEqual(after,before,'Existing business or Storage values changed: roll back the whole QA setup');
    report.oldTableChecks=before;report.existingValuesUnchanged=true;
  });
  report.afterMigrations=(await sql`select count(*)::int n from supabase_migrations.schema_migrations`)[0].n;
  report.status='PASS';delete report.activeMigration;
}catch(error){
  report.status='ROLLED_BACK';report.errorCode=error.code??'ASSERTION';
  report.safeReason=error instanceof assert.AssertionError?error.message:'QA upgrade rejected; inspect diagnostics privately';
  // Only store the DB diagnostic privately; it can include source/business values.
  await writeFile(args.out+'.private-diagnostic',String(error.stack??error),{mode:0o600});
  process.exitCode=1;
}finally{await writeFile(args.out,JSON.stringify(report,null,2),{mode:0o600});await sql.end({timeout:3});}
console.log(JSON.stringify({status:report.status,before:report.beforeMigrations,after:report.afterMigrations,activeMigration:report.activeMigration,errorCode:report.errorCode}));
