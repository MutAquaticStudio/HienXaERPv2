import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { argumentsForRun, openQA } from "../remediation/native-fixture.mjs";
import { realQAAuth } from "../remediation/auth.mjs";
import { parseEnv } from "node:util";
const a=argumentsForRun(),q=await openQA(a),e=parseEnv(await readFile(a["auth-env"],"utf8"));
const auth=await realQAAuth(a["auth-env"],{finance:"hxqa-finance-employee@example.test",sales:"hxqa-sales@example.test"});
const old=JSON.parse(await readFile("reports/business-flow-remediation/evidence/PACKAGE5_G09_AUTH_REVENUE_AFTER119.json","utf8")),fee=JSON.parse(await readFile("reports/business-flow-remediation/evidence/PACKAGE9_G16_FEE_AUTH142.json","utf8"));
const report={scope:"READ_ONLY_EXISTING_G09_G16_WITH_REAL_AUTH_CURRENT_NATIVE_API",productionAccess:"NONE",checks:[],businessWrites:0};
async function snapshot(customer,cutoff="2030-01-01",role="finance"){
 const [row]=await q.sql`select branch_id from public.customers where id=${customer}`;assert.ok(row);
 const response=await fetch("http://127.0.0.1:3113/rest/v1/rpc/finance_dashboard_snapshot",{method:"POST",headers:{apikey:e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,authorization:"Bearer "+auth.accounts[role].token,"content-type":"application/json"},body:JSON.stringify({target_branch_id:row.branch_id,from_inclusive:"2000-01-01",to_exclusive:"2030-01-01",knowledge_cutoff:cutoff,target_customer_id:customer,target_activity_kind:"DELIVERY"})});
 assert.equal(response.status,200);return response.json();
}
try{
 const gold=await snapshot(old.docs.paid.stock.customer);assert.equal(gold.gross_profit.value_vnd,"1040000");assert.equal(gold.gross_profit.quality,"READY");
 report.checks.push({name:"GROSS1040000_EXISTING_SOURCE_NOT_RECREATED",status:"PASS",snapshot:gold});
 const historical=await snapshot(fee.documents.customer,fee.checks[0].feeOnly.scope.as_of),current=await snapshot(fee.documents.customer);
 assert.equal(historical.gross_profit.quality,"INCOMPLETE");assert.equal(historical.gross_profit.value_vnd,null);
 assert.equal(current.gross_profit.quality,"READY");assert.equal(current.direct_cost.value_vnd,"1520000");assert.equal(current.gross_profit.value_vnd,"780000");
 report.checks.push({name:"ALL_COST_SOURCES_REQUIRED_FEE_DOES_NOT_REPLACE_MISSING_SOURCE",status:"PASS",historical,current});
 const masked=await snapshot(fee.documents.customer,"2030-01-01","sales");assert.equal(masked.direct_cost.quality,"FORBIDDEN");assert.equal(masked.direct_cost.value_vnd,null);assert.equal(masked.gross_profit.value_vnd,null);
 report.checks.push({name:"SALES_PROFIT_AND_COST_STILL_MASKED",status:"PASS",snapshot:masked});report.status="PASS";report.checkedAt=new Date().toISOString();await writeFile(a.out,JSON.stringify(report,null,2));console.log(JSON.stringify({status:"PASS",checks:3,businessWrites:0}));
}catch(err){report.status="FAIL";report.error=err.message.split("\n")[0];await writeFile(a.out,JSON.stringify(report,null,2));throw err;}finally{await q.sql.end({timeout:3});}
