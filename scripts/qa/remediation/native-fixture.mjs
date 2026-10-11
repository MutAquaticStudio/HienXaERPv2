import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

export function argumentsForRun() {
  return Object.fromEntries(process.argv.slice(2).reduce((rows, value, index, all) => {
    if (index % 2 === 0) rows.push([value.replace(/^--/, ""), all[index + 1]]);
    return rows;
  }, []));
}

export async function openQA(args) {
  for (const key of ["credentials", "database", "fixtures", "out"]) assert.ok(args[key], `Missing --${key}`);
  const config = JSON.parse(await readFile(args.credentials, "utf8"));
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 49760);
  assert.match(args.database, /^hx_remediation_[a-z0-9_]+$/);
  const sql = postgres({ ...config, database: args.database, max: 1, prepare: false, onnotice() {} });
  const [identity] = await sql`select current_database() db,current_setting('data_directory') directory`;
  assert.equal(identity.db, args.database);
  assert.equal(identity.directory, path.join(path.dirname(args.credentials), "cluster-data"));
  const fixtures = JSON.parse(await readFile(args.fixtures, "utf8")).fixtures;
  const signatures = await sql`select p.proname name,p.proargnames names,p.pronargdefaults defaults,
    array(select format_type(t,null) from unnest(p.proargtypes) t) types
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'`;
  async function actor(tx, uid) {
    await tx.unsafe("set local role authenticated");
    await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
    await tx.unsafe("set local statement_timeout='30s'").simple();
  }
  async function rpc(tx, name, args, uid = fixtures.owner) {
    assert.match(name, /^[a-z_]+$/);
    const matches = signatures.filter((value) => value.name === name && args.length <= value.types.length
      && args.length >= value.types.length - value.defaults);
    assert.equal(matches.length, 1, `Ambiguous/missing RPC ${name}`);
    const signature = matches[0];
    await actor(tx, uid);
    const values = args.map((value, index) => signature.types[index] === "jsonb" && value !== null
      ? tx.typed(JSON.stringify(value), 25) : typeof value === "string" ? tx.typed(value, 25) : value);
    const query = `select public.${name}(${args.map((_, index) => `${signature.names[index]}=>$${index + 1}::${signature.types[index]}`).join(",")}) value`;
    return (await tx.unsafe(query, values))[0].value;
  }
  return { sql, fixtures, actor, rpc, identity };
}

export async function stockFixture(tx, qa, quantity = "45", options = {}) {
  const { fixtures: f, rpc } = qa;
  await tx.unsafe("set local role postgres");
  const prefix = "RM" + randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const uom = randomUUID(), material = randomUUID(), price = randomUUID(), cost = randomUUID();
  const customer = randomUUID(), site = randomUUID();
  await tx`insert into public.customers(id,branch_id,code,display_name,sales_owner_employee_id,payment_terms_days,credit_limit_vnd,tier_code)
    select ${customer},branch_id,${prefix + "_CUSTOMER"},'Khách kiểm thử khắc phục',sales_owner_employee_id,payment_terms_days,100000000,tier_code
    from public.customers where id=${f.customer}`;
  await tx`insert into public.customer_sites(id,customer_id,code,name,address_text,receiver_name,receiver_phone)
    values(${site},${customer},${prefix + "_SITE"},'Công trình kiểm thử','Địa chỉ QA độc lập','Người nhận QA','0000000000')`;
  const [group] = await tx`select group_id from public.materials where id=${f.material}`;
  await tx`insert into public.units_of_measure(id,code,name,symbol,decimal_scale)
    values(${uom},${prefix.toLowerCase()},'m³ kiểm thử','m³',6)`;
  await tx`insert into public.materials(id,group_id,code,name,base_uom_id)
    values(${material},${group.group_id},${prefix},'Cát kiểm thử khắc phục',${uom})`;
  await tx`insert into public.pricing_rules(id,branch_id,scope_type,material_id,price_uom_id,unit_price_vnd,version,source_type,effective_from,created_by)
    values(${price},${f.branch},'DEFAULT',${material},${uom},${options.unitPriceVnd ?? "230000"},1,'LIST','2020-01-01',${f.owner})`;
  await tx`insert into public.purchase_price_rules(id,branch_id,supplier_id,material_id,purchase_uom_id,unit_cost_vnd,version,source_type,effective_from,created_by)
    values(${cost},${f.branch},${f.supplier},${material},${uom},150000,1,'CONTRACT','2020-01-01',${f.owner})`;
  const common = { material_id: material, ordered_uom_id: uom, quantity,
    conversion_numerator: "1", conversion_denominator: "1", rounding_mode: "HALF_UP" };
  const [clock] = await tx`select current_timestamp::text now`;
  const receivedAt = new Date(Date.parse(clock.now) - 1000).toISOString();
  const po = await rpc(tx, "create_purchase_order_draft", [f.branch, f.supplier, f.warehouse, null, "QA độc lập",
    [{ ...common, unit_cost_vnd: "150000", purchase_price_rule_id: cost, purchase_price_rule_version: 1, price_source_type: "CONTRACT" }], randomUUID()]);
  await rpc(tx, "confirm_purchase_order", [po, randomUUID()]);
  const [purchaseLine] = await tx`select id from public.purchase_order_lines where purchase_order_id=${po}`;
  await rpc(tx, "receive_purchase_order", [po, [{ purchase_order_line_id: purchaseLine.id, received_quantity: quantity }], null, receivedAt, randomUUID()]);
  return { prefix, uom, material, price, cost, po, common, cutoff: clock.now, customer, site, unitPriceVnd: options.unitPriceVnd ?? "230000" };
}

export async function salesFixture(tx, qa, stock, uid = qa.fixtures.owner) {
  const { fixtures: f, rpc } = qa;
  const so = await rpc(tx, "create_sales_order_draft", [f.branch, stock.customer, stock.site, null, "QA khắc phục",
    [{ ...stock.common, unit_price_vnd: stock.unitPriceVnd, pricing_rule_id: stock.price, pricing_rule_version: 1, price_source_type: "LIST" }], randomUUID()], uid);
  await rpc(tx, "confirm_sales_order", [so, randomUUID()], uid);
  const [line] = await tx`select id from public.sales_order_lines where sales_order_id=${so}`;
  return { so, line: line.id };
}

export async function rejected(tx, fn, message, code) {
  let error;
  try { await tx.savepoint(fn); } catch (value) { error = value; }
  assert.ok(error, "Expected business rejection");
  if (message) assert.equal(error.message, message);
  if (code) assert.equal(error.code, code);
  return { code: error.code, message: error.message };
}
