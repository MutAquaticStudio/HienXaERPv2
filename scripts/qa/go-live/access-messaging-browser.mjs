import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { browserQA } from "./browser-kit.mjs";

// Run serially on the owned browser clone. Only QA permission configuration and
// two QA conversations/messages are written; there are no operational fixtures.
const scope = "QA_EXPLICIT_PERMISSION_EXISTING_SESSION_AND_ADMIN_WORK_CUSTOMER_MESSAGES";
const b = await browserQA(scope), { qa, d, origin, report: r } = b;
assert.equal(r.scope, scope);
const env = parseEnv(await readFile(b.args["auth-env"], "utf8"));
assert.equal(env.HX_QA_PROJECT_REF, "ffrwiglcrlumfvhubaxg");
assert.equal(env.HX_QA_RUNTIME_APPROVED, "true");
const gateway = "http://127.0.0.1:3113";
const permission = "catalog.read";
const clients = [];
let failure;
let attemptLedgerCounts;
const done = name => r.checks.some(check => check.name === name && check.status === "PASS");
const safeError = error => {
  const first = String(error?.message ?? "QA acceptance failed").split("\n")[0];
  return /access_token|refresh_token|authorization|auth-token|eyJ[A-Za-z0-9_-]{30}|sb_secret_/i.test(first) ? "QA acceptance failed; sensitive diagnostic omitted" : first;
};

async function grants() {
  return (await qa.sql`select permission_code from public.employee_permission_grants where employee_id=${d.personas.worker.employee} and branch_id=${d.branch} order by permission_code`).map(row => row.permission_code);
}
async function ledgerCounts() {
  const [row] = await qa.sql`select
    (select count(*)::int from public.payments where branch_id=${d.branch}) payments,
    (select count(*)::int from public.inventory_movements where branch_id=${d.branch}) inventory,
    (select count(*)::int from public.receivable_obligations where branch_id=${d.branch}) ar,
    (select count(*)::int from public.payable_obligations where branch_id=${d.branch}) ap,
    (select count(*)::int from public.revenue_entries where branch_id=${d.branch}) revenue`;
  return row;
}
async function authClient(role, expectedSubject) {
  const client = createClient(gateway, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email: "hxqa-" + role + "@example.test", password: env.HX_QA_PASSWORD });
  assert.equal(login.error, null, "Real QA login failed; credentials are not logged");
  assert.equal(login.data.user.id, expectedSubject);
  clients.push(client);
  return client;
}
async function workerContext(page) {
  const response = await page.request.get(origin + "/api/access/context");
  assert.equal(response.status(), 200);
  const context = await response.json();
  assert.equal(context.employeeId, d.personas.worker.employee);
  assert.equal(context.branchId, d.branch);
  return context;
}
async function setPermissionsInUI(owner, requested, reason) {
  const [employee] = await qa.sql`select code from public.employees where id=${d.personas.worker.employee} and auth_user_id=${d.personas.worker.subject}`;
  assert.ok(employee?.code);
  await owner.goto(origin + "/admin/access?q=" + encodeURIComponent(employee.code));
  const form = owner.locator("form").filter({ has: owner.locator(`input[name=employeeId][value="${d.personas.worker.employee}"]`) })
    .filter({ has: owner.locator(`input[name=branchId][value="${d.branch}"]`) });
  await form.locator('input[name=reason]').waitFor({ state: "attached" });
  assert.equal(await form.count(), 1);
  if (!await form.getByRole("button", { name: "Lưu quyền bổ sung", exact: true }).isVisible()) await form.locator("xpath=..").locator("summary").click();
  const inputs = await form.locator('input[name=permissionCode]').all();
  const available = await Promise.all(inputs.map(input => input.getAttribute("value")));
  assert.ok(requested.every(code => available.includes(code)), "Original/requested QA grants must be expressible by the real form");
  for (const input of inputs) await input.setChecked(requested.includes(await input.getAttribute("value")));
  await form.locator('input[name=reason]').fill(reason);
  r.pendingMutation = { kind: "permissions", requested, reason }; await b.save();
  await form.getByRole("button", { name: "Lưu quyền bổ sung", exact: true }).click();
  await b.wait(async () => JSON.stringify(await grants()) === JSON.stringify([...requested].sort()));
  delete r.pendingMutation; await b.save();
}

async function existingConversation(item) {
  const rows = await qa.sql`select id,operation_id,audience,customer_id,branch_id,created_by,subject from public.conversations
    where branch_id=${d.branch} and created_by=${d.fixtures.owner} and subject=${item.subject}`;
  assert.ok(rows.length <= 1, "A QA UI conversation marker must identify one source");
  if (rows.length) {
    const row = rows[0];
    assert.equal(row.audience, item.audience); assert.equal(row.customer_id, item.customerId ?? null);
    if (item.id) assert.equal(row.id, item.id);
    return row;
  }
  return null;
}
async function conversationFromUI(owner, item, key) {
  let source = await existingConversation(item);
  const resumed = Boolean(source);
  if (!source) {
    assert.notEqual(r.pendingMutation?.kind, "conversation", "Resolve an unobserved original conversation request before any replay");
    await owner.goto(origin + "/admin/messages");
    const form = owner.locator("form").filter({ has: owner.getByRole("button", { name: "Tạo hội thoại", exact: true }) });
    await form.locator('select[name=participant_id]').waitFor();
    await form.locator('input[name=subject]').fill(item.subject);
    const option = form.locator(`option[value="${item.participant}"][data-kind="${item.audience === "CUSTOMER" ? "CUSTOMER" : "EMPLOYEE"}"]`)
      .filter({ hasText: /./ });
    assert.ok(await option.count() >= 1, "QA participant must appear in the real branch-scoped options");
    if (item.audience === "CUSTOMER") assert.equal(await option.first().getAttribute("data-customer-id"), item.customerId);
    await form.locator('select[name=participant_id]').selectOption(item.participant);
    assert.equal(await form.locator('input[name=audience]').inputValue(), item.audience);
    if (item.customerId) assert.equal(await form.locator('input[name=customer_id]').inputValue(), item.customerId);
    r.pendingMutation = { kind: "conversation", key, subject: item.subject }; await b.save();
    await form.getByRole("button", { name: "Tạo hội thoại", exact: true }).click();
    await b.wait(async () => Boolean(await existingConversation(item)));
    source = await existingConversation(item);
  }
  item.id = source.id; item.operationId = source.operation_id;
  if (r.pendingMutation?.kind === "conversation" && r.pendingMutation.key === key) delete r.pendingMutation;
  await b.save();
  const members = await qa.sql`select auth_user_id,active from public.conversation_participants where conversation_id=${source.id} order by auth_user_id`;
  assert.equal(members.length, 2); assert.ok(members.every(member => member.active));
  assert.deepEqual(members.map(member => member.auth_user_id).sort(), [d.fixtures.owner, item.participant].sort());
  const [counts] = await qa.sql`select
    (select count(*)::int from public.command_receipts where operation_id=${source.operation_id} and command_name='create_conversation' and result_entity_id=${source.id}) receipts,
    (select count(*)::int from public.audit_events where trace_id=${source.operation_id} and action='conversation.created' and entity_id=${source.id} and branch_id=${d.branch} and actor_auth_user_id=${d.fixtures.owner}) audits`;
  assert.deepEqual(counts, { receipts: 1, audits: 1 });
  const check = "ADMIN_UI_CREATE_" + key.toUpperCase() + "_CONVERSATION_ONE_SOURCE_RECEIPT_AUDIT";
  if (!done(check)) await b.record(check, { id: source.id, audience: source.audience, members: 2, ...counts, resumedFromIndependentSource: resumed });
  return item;
}
async function openConversation(page, surface, item) {
  await page.goto(origin + `/${surface}/messages?conversation=${item.id}`);
  await page.getByRole("heading", { name: item.subject, exact: true }).waitFor();
}
async function sendInUI(page, surface, item, sender, messageKey) {
  const message = r.documents.messages[messageKey];
  const lookup = async () => {
    const rows = await qa.sql`select id,operation_id from public.messages where conversation_id=${item.id} and sender_auth_user_id=${sender} and body=${message.body}`;
    assert.ok(rows.length <= 1, "A QA message marker must identify one message, including resumed attempts");
    return rows[0] ?? null;
  };
  let source = await lookup();
  if (!source) {
    assert.notEqual(r.pendingMutation?.kind, "message", "Resolve an unobserved original message request before any replay");
    await openConversation(page, surface, item);
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Gửi tin nhắn", exact: true }) });
    assert.equal(await form.locator('input[name=conversation_id]').inputValue(), item.id);
    assert.equal(await form.locator('input[name=surface]').inputValue(), surface);
    await form.locator('textarea[name=body]').fill(message.body);
    r.pendingMutation = { kind: "message", key: messageKey, conversation: item.id }; await b.save();
    await form.getByRole("button", { name: "Gửi tin nhắn", exact: true }).click();
    await b.wait(async () => Boolean(await lookup()));
    source = await lookup();
  }
  message.id = source.id; message.operationId = source.operation_id;
  if (r.pendingMutation?.kind === "message" && r.pendingMutation.key === messageKey) delete r.pendingMutation;
  await b.save();
  const [receipt] = await qa.sql`select count(*)::int n from public.command_receipts where operation_id=${source.operation_id} and command_name='send_message' and result_entity_id=${source.id}`;
  assert.equal(receipt.n, 1);
  await openConversation(page, surface, item); await page.getByText(message.body, { exact: true }).waitFor();
  await page.reload(); await page.getByText(message.body, { exact: true }).waitFor();
  const check = surface.toUpperCase() + "_UI_SEND_RELOAD_ONE_MESSAGE_" + messageKey.toUpperCase();
  if (!done(check)) await b.record(check, { conversation: item.id, message: source.id, sender, receipts: receipt.n });
}
async function readInUI(page, surface, item, reader, check) {
  if (done(check)) return;
  await openConversation(page, surface, item);
  const [before] = await qa.sql`select unread_count,last_read_at from public.conversation_participants where conversation_id=${item.id} and auth_user_id=${reader} and active`;
  assert.ok(before);
  if (r.pendingMutation?.kind === "mark_read" && r.pendingMutation.key === check) {
    assert.equal(before.unread_count, 0, "Resolve an unobserved mark-read request before any replay");
    assert.ok(before.last_read_at);
    if (r.pendingMutation.beforeLastRead) assert.ok(new Date(before.last_read_at) > new Date(r.pendingMutation.beforeLastRead));
    const priorUnread = r.pendingMutation.priorUnread; delete r.pendingMutation;
    await b.record(check, { conversation: item.id, reader, priorUnread, unread: 0, lastReadStored: true, resumedFromIndependentSource: true });
    return;
  }
  assert.ok(before.unread_count > 0, "The read action must actually clear a newly unread QA message");
  r.pendingMutation = { kind: "mark_read", key: check, conversation: item.id, reader, priorUnread: before.unread_count, beforeLastRead: before.last_read_at }; await b.save();
  await page.getByRole("button", { name: "Đánh dấu đã đọc", exact: true }).click();
  await b.wait(async () => (await qa.sql`select unread_count from public.conversation_participants where conversation_id=${item.id} and auth_user_id=${reader}`)[0].unread_count === 0);
  const [after] = await qa.sql`select unread_count,last_read_at from public.conversation_participants where conversation_id=${item.id} and auth_user_id=${reader} and active`;
  assert.equal(after.unread_count, 0); assert.ok(after.last_read_at);
  delete r.pendingMutation;
  await page.reload(); await page.getByRole("heading", { name: item.subject, exact: true }).waitFor();
  await b.record(check, { conversation: item.id, reader, priorUnread: before.unread_count, unread: after.unread_count, lastReadStored: true });
}

try {
  const [schema] = await qa.sql`select count(*)::int count,max(version) latest from supabase_migrations.schema_migrations`;
  assert.ok(schema.count >= 185, "Current owned QA clone must include work assignment audit forward185");
  r.schema = schema.count; r.actualInitialSchema = schema; r.runtimeGateway = gateway; r.automatedOutOfAppMessagesSent = 0; r.excludedAdvanceRacesRun = false;
  attemptLedgerCounts = await ledgerCounts(); r.currentAttemptLedgerCounts = attemptLedgerCounts;
  const [workerSource] = await qa.sql`select e.auth_user_id,a.id access_id,a.role_id,a.active from public.employees e join public.employee_branch_access a on a.employee_id=e.id where e.id=${d.personas.worker.employee} and a.branch_id=${d.branch}`;
  assert.equal(workerSource.auth_user_id, d.personas.worker.subject); assert.equal(workerSource.active, true);
  if (!r.documents.access) {
    const [baseline] = await qa.sql`select exists(select 1 from public.role_permissions where role_id=${workerSource.role_id} and permission_code=${permission}) allowed`;
    assert.equal(baseline.allowed, false, "This case needs a permission absent from the QA worker role");
    const originalPermissions = await grants(); assert.equal(originalPermissions.includes(permission), false);
    const prefix = "QA-UI-MSG-" + randomUUID().slice(0, 12);
    r.documents.access = { employee: d.personas.worker.employee, branch: d.branch, accessId: workerSource.access_id, originalPermissions, permission,
      grantReason: "QA cấp quyền đọc danh mục phiên thợ đang mở " + prefix, restoreReason: "QA khôi phục quyền gốc sau kiểm tường minh " + prefix };
    r.documents.initialLedgerCounts = attemptLedgerCounts;
    r.documents.conversations = {
      internal: { subject: prefix + " nội bộ", audience: "INTERNAL", participant: d.personas.worker.subject },
      customer: { subject: prefix + " khách hàng", audience: "CUSTOMER", participant: d.portalSubjects.customerFinance, customerId: d.customer },
    };
    r.documents.messages = Object.fromEntries(["adminInternal", "workerInternal", "adminCustomer", "customerReply"].map(key => [key, { body: prefix + " " + key + " — tin QA riêng, không thay đổi kho hoặc tiền" }]));
    await b.save();
  }
  const owner = await b.login("owner"), worker = await b.login("worker", "work"), customer = await b.login("finance", "customer"), other = await b.login("other_customer", "customer");
  // Both the browser and direct Auth token exist before permission changes.
  const workerAuth = await authClient("worker", d.personas.worker.subject);
  const otherAuth = await authClient("other_customer", d.portalSubjects.otherCustomer);
  const access = r.documents.access;
  if (!done("EXPLICIT_PERMISSION_UI_GRANT_EXISTING_WORKER_SESSION_OBSERVES_CURRENT_RIGHT")) {
    assert.deepEqual(await grants(), access.originalPermissions, "Resolve/restore an interrupted original grant before repeating UI grant");
    assert.equal((await workerContext(worker)).permissions.includes(permission), false);
    const requested = [...new Set([...access.originalPermissions, permission])].sort();
    await setPermissionsInUI(owner, requested, access.grantReason);
    assert.equal((await workerContext(worker)).permissions.includes(permission), true);
    await worker.goto(origin + "/admin/products"); await worker.getByRole("heading", { name: "Vật tư & quy cách", exact: true }).waitFor();
    const [audit] = await qa.sql`select count(*)::int n from public.audit_events where entity_id=${access.accessId} and action='employee.permission.set' and reason=${access.grantReason} and actor_auth_user_id=${d.fixtures.owner} and branch_id=${d.branch}`;
    assert.equal(audit.n, 1);
    await b.record("EXPLICIT_PERMISSION_UI_GRANT_EXISTING_WORKER_SESSION_OBSERVES_CURRENT_RIGHT", { employee: access.employee, branch: access.branch, permission, originalGrantsPreserved: true, audit: audit.n, realOldBrowserSession: true });
  }
  if (!done("EXPLICIT_PERMISSION_FORBIDDEN_REAL_AUTH_WRITER_HAS_NO_EFFECT")) {
    const before = await grants();
    const denied = await workerAuth.rpc("set_employee_explicit_permissions", { target_employee_id: access.employee, target_branch_id: access.branch,
      permission_codes: [...before, "roles.manage"], change_reason: "QA thợ không tự cấp quyền quản trị", operation_id: randomUUID() });
    assert.equal(denied.error?.code, "42501"); assert.deepEqual(await grants(), before);
    await b.record("EXPLICIT_PERMISSION_FORBIDDEN_REAL_AUTH_WRITER_HAS_NO_EFFECT", { errorCode: denied.error.code, actor: d.personas.worker.subject, grantsUnchanged: true });
  }
  if (!done("EXPLICIT_PERMISSION_UI_REVOKE_EXISTING_SESSION_RIGHT_REMOVED_AND_ORIGINAL_GRANTS_RESTORED")) {
    assert.equal((await workerContext(worker)).permissions.includes(permission), true, "A resumed revoke needs the original grant still present; native cleanup is not UI revoke evidence");
    await setPermissionsInUI(owner, access.originalPermissions, access.restoreReason);
    assert.equal((await workerContext(worker)).permissions.includes(permission), false);
    assert.deepEqual(await grants(), access.originalPermissions);
    const [audit] = await qa.sql`select count(*)::int n from public.audit_events where entity_id=${access.accessId} and action='employee.permission.set' and reason=${access.restoreReason} and actor_auth_user_id=${d.fixtures.owner} and branch_id=${d.branch}`;
    assert.equal(audit.n, 1);
    await b.record("EXPLICIT_PERMISSION_UI_REVOKE_EXISTING_SESSION_RIGHT_REMOVED_AND_ORIGINAL_GRANTS_RESTORED", { permission, audit: audit.n, realOldBrowserSession: true, originalGrantsRestored: true });
  }
  const internal = await conversationFromUI(owner, r.documents.conversations.internal, "internal");
  await sendInUI(owner, "admin", internal, d.fixtures.owner, "adminInternal");
  await readInUI(worker, "work", internal, d.personas.worker.subject, "WORK_UI_MARK_ADMIN_MESSAGE_READ_CURRENT_PARTICIPANT");
  await sendInUI(worker, "work", internal, d.personas.worker.subject, "workerInternal");
  await readInUI(owner, "admin", internal, d.fixtures.owner, "ADMIN_UI_MARK_WORKER_MESSAGE_READ_CURRENT_PARTICIPANT");
  const customerConversation = await conversationFromUI(owner, r.documents.conversations.customer, "customer");
  await sendInUI(owner, "admin", customerConversation, d.fixtures.owner, "adminCustomer");
  await readInUI(customer, "customer", customerConversation, d.portalSubjects.customerFinance, "CUSTOMER_UI_MARK_ADMIN_MESSAGE_READ_CURRENT_MEMBERSHIP");
  await sendInUI(customer, "customer", customerConversation, d.portalSubjects.customerFinance, "customerReply");
  await readInUI(owner, "admin", customerConversation, d.fixtures.owner, "ADMIN_UI_MARK_CUSTOMER_REPLY_READ_CURRENT_PARTICIPANT");
  if (!done("OTHER_CUSTOMER_UI_AND_REAL_AUTH_SEND_READ_DENIED_NO_MESSAGE_OR_RECEIPT")) {
    const deniedIntent = randomUUID();
    await other.goto(origin + "/customer/messages?conversation=" + customerConversation.id); await other.getByRole("heading", { name: "Tin nhắn", exact: true }).waitFor();
    assert.equal(await other.getByRole("heading", { name: customerConversation.subject, exact: true }).count(), 0);
    assert.equal(await other.locator(`input[name=conversation_id][value="${customerConversation.id}"]`).count(), 0);
    const deniedSend = await otherAuth.rpc("send_message", { target_conversation_id: customerConversation.id, target_body: "QA sai khách không gửi vào hội thoại", operation_id: deniedIntent });
    const deniedRead = await otherAuth.rpc("mark_conversation_read", { target_conversation_id: customerConversation.id });
    assert.equal(deniedSend.error?.code, "42501"); assert.equal(deniedRead.error?.code, "42501");
    const [effect] = await qa.sql`select (select count(*)::int from public.messages where operation_id=${deniedIntent}) messages,(select count(*)::int from public.command_receipts where operation_id=${deniedIntent}) receipts`;
    assert.deepEqual(effect, { messages: 0, receipts: 0 });
    await b.record("OTHER_CUSTOMER_UI_AND_REAL_AUTH_SEND_READ_DENIED_NO_MESSAGE_OR_RECEIPT", { conversation: customerConversation.id, sendCode: deniedSend.error.code, readCode: deniedRead.error.code, ...effect });
  }
  const totals = await qa.sql`select conversation_id,count(*)::int n from public.messages where conversation_id in ${qa.sql([internal.id, customerConversation.id])} group by conversation_id order by conversation_id`;
  assert.equal(totals.length, 2); assert.ok(totals.every(row => row.n === 2));
  assert.deepEqual(await ledgerCounts(), attemptLedgerCounts);
  assert.deepEqual(await grants(), access.originalPermissions);
  await b.record("QA_CONFIG_AND_TWO_CONVERSATIONS_FOUR_MESSAGES_NO_CASH_STOCK_AR_AP_REVENUE_EFFECT", { conversations: 2, messages: 4, originalWorkerGrantsRestored: true, businessLedgersUnchanged: true });
  await b.shot(owner, "qa-admin-customer-conversation-read"); await b.shot(worker, "qa-work-conversation-reply"); await b.shot(customer, "qa-customer-conversation-reply");
  await b.finish();
} catch (error) {
  failure = safeError(error); r.status = "FAIL"; r.error = failure; await b.save();
} finally {
  // Restore only the owned worker's exact initial explicit-grant set. A native
  // cleanup is recorded as cleanup and never accepted as the missing UI step.
  if (r.documents.access) {
    try {
      const original = r.documents.access.originalPermissions;
      if (JSON.stringify(await grants()) !== JSON.stringify(original)) {
        await qa.sql.begin(tx => qa.rpc(tx, "set_employee_explicit_permissions", [d.personas.worker.employee, d.branch, original, "QA phục hồi quyền gốc sau lỗi bộ chạy access/messages", randomUUID()], d.fixtures.owner));
        r.cleanup = { originalExplicitGrantsRestored: true, throughCanonicalRpc: true, isUIAcceptanceEvidence: false };
        await b.save();
      }
    } catch (error) {
      failure ??= "QA original-grant cleanup needs attention"; r.status = "FAIL"; r.cleanupError = safeError(error); await b.save();
    }
  }
  for (const client of clients) client.auth.stopAutoRefresh();
  await b.close();
}
if (failure) throw new Error(failure);
