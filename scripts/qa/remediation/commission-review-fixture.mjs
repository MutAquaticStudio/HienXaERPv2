import { randomUUID } from "node:crypto";
import { paidReturnScenario, nextReceivableFromReturnedStock } from "./package4-return-fixture.mjs";

export async function commissionReviewScenario(tx, qa, finance, future = true) {
 const { rpc, fixtures: f } = qa;
 const d = await paidReturnScenario(tx, qa, finance, { configureCommission: true });
 const [original] = await tx`select * from public.earning_events where rule_id=${d.commissionRule}`;
 await rpc(tx, "post_payment", [f.branch, "DISBURSEMENT", null, null, d.account, "161000", new Date().toISOString(), "CASH", "Đã trả hoa hồng giả QA",
  [{ obligation_id: original.payable_obligation_id, amount_vnd: "161000" }], "0", randomUUID(), d.commissionEmployee], finance);
 await rpc(tx, "adjust_return_receivable", [d.returnCase, "230000", "Trả1 đơn vị nguồn230k QA", randomUUID()], finance);
 await tx.unsafe("set local role postgres");
 const [review] = await tx`select id,reduction_amount_vnd::text amount from public.commission_reconciliation_cases where original_earning_event_id=${original.id}`;
 const [hash] = await tx`select md5(to_jsonb(e)::text) hash from public.earning_events e where id=${original.id}`;
 const result = { ...d, review: review.id, reduction: review.amount, originalEarning: original.id, originalPayable: original.payable_obligation_id, originalHash: hash.hash };
 if (!future) return result;
 const preferred = randomUUID();
 await tx`insert into public.pricing_rules(id,branch_id,scope_type,customer_id,material_id,price_uom_id,unit_price_vnd,version,source_type,effective_from,created_by)
  values(${preferred},${f.branch},'CUSTOMER_MATERIAL',${d.stock.customer},${d.stock.material},${d.stock.uom},400000,1,'LIST','2020-01-01',${f.owner})`;
 const [employee] = await tx`select auth_user_id from public.employees where id=${d.commissionEmployee}`;
 const ar = await nextReceivableFromReturnedStock(tx, qa, { ...d, stock: { ...d.stock, price: preferred, unitPriceVnd: "400000" } }, employee.auth_user_id);
 await rpc(tx, "post_payment", [f.branch, "RECEIPT", d.stock.customer, null, d.account, "400000", new Date().toISOString(), "CASH", "Nguồn thu400k hoa hồng20k QA",
  [{ obligation_id: ar, amount_vnd: "400000" }], "0", randomUUID()], finance);
 await tx.unsafe("set local role postgres");
 const [target] = await tx`select id,version,payable_obligation_id from public.earning_events where rule_id=${d.commissionRule} and id<>${original.id}`;
 const rule = await rpc(tx, "create_compensation_rule", [f.branch, d.stock.prefix + "_ADJ", "Điều chỉnh nguồn hoa hồng QA", d.commissionEmployee,
  "ADJUSTMENT", "FIXED_PER_BASIS", "1", null, "OPEX", "2020-01-01", null, randomUUID()]);
 return { ...result, target: target.id, targetVersion: target.version, targetPayable: target.payable_obligation_id, adjustmentRule: rule };
}
