import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';

// Deparse both sides on the same engine with the same name-resolution context.
// No SQL text is stripped, rewritten, or treated as semantically interchangeable.
export async function readViewCatalog(query, names) {
  const [session] = await query(`select current_setting('server_version_num') as version,
    current_setting('search_path') as search_path`);
  try {
    await query("select set_config('search_path','pg_catalog',false)");
    const condition = names.map(({ schema, name }) =>
      `(n.nspname=${literal(schema)} and c.relname=${literal(name)})`).join(' or ') || 'false';
    return await query(`select n.nspname as schema,c.relname as name,
      pg_get_viewdef(c.oid,true) as definition,
      pg_get_viewdef(c.oid,false) as canonical_definition,
      pg_get_userbyid(c.relowner) as owner,
      coalesce((select jsonb_agg(option order by option)
        from unnest(c.reloptions) option),'[]'::jsonb) as options,
      c.relacl::text as acl,
      (select jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),
        'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
        'privilege',a.privilege_type,'grantable',a.is_grantable)
        order by a.grantor,a.grantee,a.privilege_type,a.is_grantable)
        from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) as grants,
      (select jsonb_agg(jsonb_build_object('position',a.attnum,'name',a.attname,
        'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
        'collation',case when a.attcollation=0 then null else
          (select cn.nspname||'.'||co.collname from pg_collation co
            join pg_namespace cn on cn.oid=co.collnamespace where co.oid=a.attcollation) end)
        order by a.attnum)
        from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
      coalesce((select jsonb_agg(item order by item) from (
        select distinct pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) as item
        from pg_rewrite r join pg_depend d on d.classid='pg_rewrite'::regclass and d.objid=r.oid
        where r.ev_class=c.oid and d.deptype='n'
          and not(d.refclassid='pg_class'::regclass and d.refobjid=c.oid)
      ) dependencies),'[]'::jsonb) as dependencies,
      ${literal(session.version)} as server_version_num,'pg_catalog' as deparse_search_path
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.relkind='v' and (${condition}) order by n.nspname,c.relname`);
  } finally {
    await query(`select set_config('search_path',${literal(session.search_path)},false)`);
  }
}

// Local fixture preparation only. The baseline supplies owner/access/options;
// parsing the candidate SELECT supplies columns/dependencies/definition.
// This must never be used to infer expected permissions from a diverged target.
export async function prepareViewReference(sql, targets, canonicalBaseline) {
  const reference = [];
  await sql.begin(async (tx) => {
    await tx.unsafe("select set_config('search_path','pg_catalog,public',true)");
    for (const target of targets) {
      const baseline = canonicalBaseline.find((view) => view.schema === target.schema && view.name === target.name);
      assert.ok(baseline, `Missing canonical baseline view: ${target.schema}.${target.name}`);
      const name = 'hx_expected_' + randomUUID().replaceAll('-', '');
      await tx.unsafe(`create temporary view ${identifier(name)} as ${target.definition}`);
      const [namespace] = await tx.unsafe('select nspname from pg_namespace where oid=pg_my_temp_schema()');
      const [parsed] = await readViewCatalog((text) => tx.unsafe(text), [{ schema: namespace.nspname, name }]);
      reference.push({ ...parsed, schema: target.schema, name: target.name,
        owner: baseline.owner, options: baseline.options, grants: baseline.grants,
        provenance: 'CANDIDATE_CANONICAL_LOCAL_BASELINE' });
      await tx.unsafe(`drop view ${identifier(name)}`);
    }
  });
  return reference;
}

const comparedFields = ['schema', 'name', 'canonical_definition', 'columns', 'dependencies', 'owner', 'options', 'grants'];
export function compareViewCatalog(actual, expected) {
  if (!Array.isArray(expected) || expected.length === 0) {
    return { status: 'UNRESOLVED', differences: ['VERIFIED_SAME_ENGINE_VIEW_REFERENCE_REQUIRED'] };
  }
  const differences = [];
  for (const reference of expected) {
    const view = actual.find((item) => item.schema === reference.schema && item.name === reference.name);
    const label = `${reference.schema}.${reference.name}`;
    if (!view) { differences.push(`${label}:missing`); continue; }
    // Do not silently normalize an old PG17 definition against a PG18 engine.
    if (view.server_version_num !== reference.server_version_num
      || view.deparse_search_path !== reference.deparse_search_path) {
      return { status: 'UNRESOLVED', differences: [`${label}:engine_or_session_differs`] };
    }
    for (const field of comparedFields) {
      if (view[field] === undefined || reference[field] === undefined) {
        return { status: 'UNRESOLVED', differences: [`${label}:missing_${field}`] };
      }
      if (JSON.stringify(view[field]) !== JSON.stringify(reference[field])) differences.push(`${label}:${field}`);
    }
  }
  return { status: differences.length ? 'MISMATCH' : 'MATCH', differences };
}
