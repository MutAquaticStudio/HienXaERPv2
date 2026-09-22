import { id } from './core.mjs';
import { seedBusinessFixtures } from './business-fixtures.mjs';
export const seedName = 'hienxa-qa-v1';
export async function seedFixtures(query, users, batches = 1, checkCapacity = async () => {}) {
  for (const branch of ['A','B']) await query('insert into public.branches(id,code,name) values($1,$2,$3) on conflict(id) do nothing', [id(`branch-${branch}`), `HXQA-${branch}`, `HXQA Branch ${branch}`]);
  const roles = {
    owner: null,
    sales: ['dashboard.read','orders.read','orders.create','customers.read','catalog.read','pricing.read','quotation.read'],
    worker: ['work.read','work.claim','compensation.read'],
  };
  for (const [role, permissions] of Object.entries(roles)) {
    await query('insert into public.roles(id,code,name) values($1,$2,$3) on conflict(id) do nothing', [id(`role-${role}`), `hxqa_${role}`, `HXQA ${role}`]);
    await query('insert into public.role_permissions(role_id,permission_code) select $1,code from public.permissions where ($2::text[] is null or code=any($2::text[])) on conflict do nothing', [id(`role-${role}`), permissions]);
    await query('insert into public.employees(id,auth_user_id,code,display_name) values($1,$2,$3,$4) on conflict(id) do nothing', [id(`employee-${role}`), users[role], `HXQA-${role.toUpperCase()}`, `HXQA ${role}`]);
    for (const branch of role === 'owner' ? ['A','B'] : ['A']) await query('insert into public.employee_branch_access(id,employee_id,branch_id,role_id) values($1,$2,$3,$4) on conflict(id) do nothing', [id(`access-${role}-${branch}`), id(`employee-${role}`), id(`branch-${branch}`), id(`role-${role}`)]);
  }
  await query("insert into public.units_of_measure(id,code,name,symbol) values($1,'hxqa_unit','HXQA Unit','unit') on conflict(id) do nothing", [id('uom')]);
  await query("insert into public.material_groups(id,code,name) values($1,'HXQA-GROUP','HXQA Group') on conflict(id) do nothing", [id('group')]);
  await query("insert into public.materials(id,group_id,code,name,base_uom_id) values($1,$2,'HXQA-MATERIAL','HXQA Material',$3) on conflict(id) do nothing", [id('material'),id('group'),id('uom')]);
  // Each complete batch preserves customer/site/order/line ratios from SPEC-PERF-004.
  // Business-domain fixtures are added below; lifecycle limitations remain explicit.
  for (let batch = 0; batch < batches; batch++) {
    await checkCapacity();
    for (let offset = 0; offset < 10; offset++) {
      const n = batch * 10 + offset;
      const branch = n % 2 ? 'B' : 'A';
      await query('insert into public.customers(id,branch_id,code,display_name,sales_owner_employee_id,internal_note) values($1,$2,$3,$4,$5,$6) on conflict(id) do nothing', [id(`customer-${n}`), id(`branch-${branch}`), `HXQA-C${n}`, `HXQA Customer ${n}`, id('employee-sales'), 'HXQA-INTERNAL-SECRET']);
      for (let site = 0; site < 2; site++) await query('insert into public.customer_sites(id,customer_id,code,name,address_text) values($1,$2,$3,$4,$5) on conflict(id) do nothing', [id(`site-${n}-${site}`), id(`customer-${n}`), `HXQA-S${site}`, `HXQA Site ${n}-${site}`, 'Synthetic QA address']);
      for (let order = 0; order < 10; order++) {
        const label = `order-${n}-${order}`;
        await query('insert into public.sales_orders(id,branch_id,order_number,customer_id,site_id,sales_owner_employee_id,customer_name_snapshot,site_name_snapshot,delivery_address_snapshot,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(id) do nothing', [id(label),id(`branch-${branch}`),`HXQA-O${n}-${order}`,id(`customer-${n}`),id(`site-${n}-${order%2}`),id('employee-sales'),`HXQA Customer ${n}`,`HXQA Site ${n}-${order%2}`,'Synthetic QA address',users.owner]);
        for (let line = 1; line <= 5; line++) await query("insert into public.sales_order_lines(id,sales_order_id,line_number,material_id,material_name_snapshot,ordered_uom_id,base_uom_id,quantity,conversion_numerator,conversion_denominator,rounding_mode,unit_price_vnd,line_total_vnd,price_source_type,override_by,override_reason) values($1,$2,$3,$4,'HXQA Material',$5,$5,10,1,1,'HALF_UP',100000,1000000,'MANUAL_APPROVED',$6,'Synthetic QA fixture') on conflict(id) do nothing", [id(`${label}-line-${line}`),id(label),line,id('material'),id('uom'),users.owner]);
      }
    }
    await checkCapacity();
  }
  for (const [role, membership, customer] of [['finance','FINANCE_CONTACT',0],['receiver','RECEIVER',0],['other_customer','OWNER',1]]) await query('insert into public.customer_portal_memberships(id,auth_user_id,customer_id,membership_role) values($1,$2,$3,$4) on conflict(id) do nothing', [id(`membership-${role}`),users[role],id(`customer-${customer}`),membership]);
  await query("insert into public.service_jobs(id,branch_id,job_number,customer_id,site_id,service_type,description,scheduled_start,scheduled_end,planned_quantity,unit_label,created_by) values($1,$2,'HXQA-SERVICE',$3,$4,'QA service','Synthetic QA service',now(),now()+interval '1 day',10,'unit',$5) on conflict(id) do nothing", [id('service'),id('branch-A'),id('customer-0'),id('site-0-0'),users.owner]);
  await query("insert into public.work_items(id,branch_id,work_number,service_job_id,title,assignment_mode,execution_state,scheduled_start,scheduled_end,created_by) values($1,$2,'HXQA-WORK',$3,'HXQA assigned work','DIRECT','CLAIMED',now(),now()+interval '1 day',$4) on conflict(id) do nothing", [id('work'),id('branch-A'),id('service'),users.owner]);
  await query("insert into public.work_item_assignments(id,work_item_id,assignment_version,employee_id,assignment_kind,assigned_by) values($1,$2,1,$3,'DIRECT',$4) on conflict(id) do nothing", [id('assignment'),id('work'),id('employee-worker'),users.owner]);
  await checkCapacity();
  await seedBusinessFixtures(query, users);
  await checkCapacity();
  return { seed: seedName, batches, customers: batches*10, sites: batches*20, orders: batches*100, lines: batches*500, deliveries: batches*150, obligations: batches*200, payments: batches*200, expenses: batches*100, earnings: batches*200, uncoveredDomains: ['messages'], lifecycleLimits: ['draft-orders-expenses-earnings','planned-deliveries-without-supply-lines','opening-balances-not-revenue'], status: 'PARTIAL_DATASET' };
}
