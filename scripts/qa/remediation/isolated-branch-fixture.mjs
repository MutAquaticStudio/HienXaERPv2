import { randomUUID } from "node:crypto";

export async function isolatedBranchFixture(tx, qa, subjects = []) {
  await tx.unsafe("set local role postgres");
  const branch = randomUUID(), warehouse = randomUUID(), supplier = randomUUID(), customer = randomUUID();
  const code = "G11" + randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  await tx`insert into public.branches(id,code,name) values(${branch},${code},${"QA không đầu kỳ " + code})`;
  await tx`insert into public.warehouses(id,branch_id,code,name,address_text) values(${warehouse},${branch},${code},'Kho QA mới không tồn đầu kỳ','Cục bộ QA')`;
  await tx`insert into public.suppliers(id,branch_id,code,name) values(${supplier},${branch},${code},'NCC QA chi nhánh mới')`;
  await tx`insert into public.customers(id,branch_id,code,display_name,sales_owner_employee_id,payment_terms_days,credit_limit_vnd,tier_code)
    select ${customer},${branch},${code},'Khách QA chi nhánh mới',sales_owner_employee_id,payment_terms_days,100000000,tier_code
    from public.customers where id=${qa.fixtures.customer}`;
  const uids = [...new Set([qa.fixtures.owner, ...subjects])];
  await tx`insert into public.employee_branch_access(employee_id,branch_id,role_id,active)
    select a.employee_id,${branch},a.role_id,true from public.employee_branch_access a join public.employees e on e.id=a.employee_id
    where a.branch_id=${qa.fixtures.branch} and a.active and e.auth_user_id=any(${uids}::uuid[])`;
  return { ...qa, fixtures: { ...qa.fixtures, branch, warehouse, supplier, customer }, originalBranch: qa.fixtures.branch,
    syntheticLocalMemberships: true, cloudRolesChanged: false };
}
