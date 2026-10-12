import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { argumentsForRun, openQA, rejected, stockFixture } from "./native-fixture.mjs";
import { isolatedBranchFixture } from "./isolated-branch-fixture.mjs";
const args = argumentsForRun(), qa = await openQA(args), { sql, rpc, fixtures: f } = qa;
const rollback = new Error("ROLLBACK_PRICE_HIERARCHY");
const report = { scope: "T17_LITERAL230K_460K_G04_HIERARCHY_G12_PRICE_VERSIONS", database: args.database, productionAccess: "NONE", managedAuthTested: false, checks: [] };
try {
  try {
    await sql.begin(async tx => {
      const s = await stockFixture(tx, qa, "1"); await tx.unsafe("set local role postgres");
      const [material] = await tx`select group_id from public.materials where id=${s.material}`;
      await tx`update public.customers set tier_code='QA_PRICE' where id=${s.customer}`;
      const tier = randomUUID(), group = randomUUID(), customer = randomUUID();
      await tx`insert into public.pricing_rules(id,branch_id,scope_type,customer_tier_code,material_id,price_uom_id,unit_price_vnd,version,source_type,effective_from,created_by)
        values(${tier},${f.branch},'CUSTOMER_TIER','QA_PRICE',${s.material},${s.uom},180000,100,'LIST','2020-01-01',${f.owner})`;
      await tx`insert into public.pricing_rules(id,branch_id,scope_type,customer_id,material_group_id,price_uom_id,unit_price_vnd,version,source_type,effective_from,created_by)
        values(${group},${f.branch},'CUSTOMER_GROUP',${s.customer},${material.group_id},${s.uom},390000,99,'CONTRACT','2020-01-01',${f.owner})`;
      await tx`insert into public.pricing_rules(id,branch_id,scope_type,customer_id,material_id,price_uom_id,unit_price_vnd,version,source_type,effective_from,created_by)
        values(${customer},${f.branch},'CUSTOMER_MATERIAL',${s.customer},${s.material},${s.uom},460000,1,'CONTRACT','2020-01-01',${f.owner})`;
      const line = (id, price, version, source = "CONTRACT") => ({ ...s.common, quantity: "1", unit_price_vnd: price, pricing_rule_id: id, pricing_rule_version: version, price_source_type: source });
      const create = item => rpc(tx, "create_sales_order_draft", [f.branch, s.customer, s.site, null, "Ưu tiên giá theo phạm vi", [item], randomUUID()]);
      await rejected(tx, () => create(line(s.price, "230000", 1, "LIST")), "pricing_rule_priority_mismatch", "22023");
      await rejected(tx, () => create(line(group, "390000", 99)), "pricing_rule_priority_mismatch", "22023");
      const id = await create(line(customer, "460000", 1));
      const [fact] = await tx`select unit_price_vnd::text price from public.sales_order_lines where sales_order_id=${id}`; assert.equal(fact.price, "460000");
      const replacement = randomUUID(), values = { unit_price_vnd: "480000", source_type: "CONTRACT", effective_from: "2020-01-01T00:00:00Z", effective_to: null };
      for (const version of [null, 0, 999]) await rejected(tx, sp => rpc(sp, "save_pricing_rule", [replacement, f.branch, customer, version, values, "Thay bảng giá có phiên bản", randomUUID()]), null, "PT409");
      const replace = [replacement, f.branch, customer, 1, values, "Thay bảng giá có phiên bản", randomUUID()];
      assert.equal(await rpc(tx, "save_pricing_rule", replace), replacement); assert.equal(await rpc(tx, "save_pricing_rule", replace), replacement);
      await rejected(tx, () => create(line(customer, "460000", 1)), "pricing_rule_snapshot_mismatch", "22023");
      assert.ok(await create(line(replacement, "480000", 2)));
      for (const version of [null, 0, 999]) await rejected(tx, sp => rpc(sp, "deactivate_pricing_rule", [replacement, f.branch, version, "Tắt bảng giá đúng phiên bản", randomUUID()]), null, "PT409");
      const deactivate = [replacement, f.branch, 2, "Tắt bảng giá đúng phiên bản", randomUUID()];
      assert.equal(await rpc(tx, "deactivate_pricing_rule", deactivate), replacement); assert.equal(await rpc(tx, "deactivate_pricing_rule", deactivate), replacement);
      const groupOrder = await create(line(group, "390000", 99));
      await rpc(tx, "deactivate_pricing_rule", [group, f.branch, 99, "Tắt nhóm để kiểm tra tier", randomUUID()]);
      const lowerValid = await create(line(tier, "180000", 100, "LIST"));
      const [lower] = await tx`select unit_price_vnd::text price from public.sales_order_lines where sales_order_id=${lowerValid}`; assert.equal(lower.price, "180000");
      await tx.unsafe("set local role postgres");
      const [unchanged] = await tx`select unit_price_vnd::text price from public.sales_order_lines where sales_order_id=${id}`; assert.equal(unchanged.price, "460000");
      report.checks.push({ name: "CUSTOMER_MATERIAL_OVER_GROUP_OVER_TIER_OVER_DEFAULT_VERSION_WITHIN_SCOPE", status: "PASS", literal460: fact, groupOrder, validLowerTier: lower, oldSnapshot: unchanged });
      report.checks.push({ name: "PRICE_REPLACE_DEACTIVATE_NULL_STALE_DENIED_CACHED_RETRY_VALID", status: "PASS" });
      const expired = randomUUID(), ambiguous = randomUUID();
      await tx`insert into public.pricing_rules(id,branch_id,scope_type,customer_id,material_id,price_uom_id,unit_price_vnd,version,source_type,effective_from,effective_to,created_by)
        values(${expired},${f.branch},'CUSTOMER_MATERIAL',${s.customer},${s.material},${s.uom},999000,999,'CONTRACT','2020-01-01',now()-interval '1 second',${f.owner})`;
      await rejected(tx, () => create(line(expired, "999000", 999)), "pricing_rule_snapshot_mismatch", "22023");
      assert.ok(await create(line(tier, "180000", 100, "LIST")));
      await tx.unsafe("set local role postgres");
      await rejected(tx, sp => sp`insert into public.pricing_rules(id,branch_id,scope_type,customer_tier_code,material_id,price_uom_id,unit_price_vnd,version,source_type,effective_from,created_by)
        values(${ambiguous},${f.branch},'CUSTOMER_TIER','QA_PRICE',${s.material},${s.uom},190000,100,'LIST','2020-01-01',${f.owner})`, null, '23505');
      assert.ok(await create({ ...s.common, quantity: "1", unit_price_vnd: "140000", pricing_rule_id: null, pricing_rule_version: null, price_source_type: "MANUAL_APPROVED", override_reason: "Owner duyệt giá giảm rõ ràng" }));
      report.checks.push({ name: "EXPIRED_HIGHER_RULE_IGNORED_DUPLICATE_SCOPE_VERSION_REJECTED_APPROVED_LOWER_OVERRIDE_VALID", status: "PASS" });
      const local = await isolatedBranchFixture(tx, qa);
      const branchRule = randomUUID(), branchValues = { scope_type: "DEFAULT", material_id: s.material, price_uom_id: s.uom,
        unit_price_vnd: "240000", source_type: "LIST", effective_from: "2020-01-01T00:00:00Z", effective_to: null };
      const branchSave = [branchRule, local.fixtures.branch, null, null, branchValues, "Bảng giá chi nhánh riêng có phiên bản hợp lệ", randomUUID()];
      assert.equal(await rpc(tx, "save_pricing_rule", branchSave), branchRule); assert.equal(await rpc(tx, "save_pricing_rule", branchSave), branchRule);
      await tx.unsafe("set local role postgres");
      const [branchFact] = await tx`select branch_id,version from public.pricing_rules where id=${branchRule}`;
      assert.deepEqual(branchFact, { branch_id: local.fixtures.branch, version: 2 });
      report.checks.push({ name: "EXISTING_GLOBAL_VERSION_UNIQUE_NAMESPACE_WITH_BRANCH_SCOPED_AUTHORIZATION", status: "PASS", branchFact, cloudRolesChanged: false });
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  report.status = "PASS_PRICE_HIERARCHY_AND_VERSION_CONTRACTS"; report.rolledBack = true;
  await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, checks: report.checks.length }));
} finally { await sql.end({ timeout: 3 }); }
