import assert from "node:assert/strict";
import { readFile, writeFile, readdir, access } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import ts from "typescript";

// Source inventory is a coverage map, never runtime acceptance evidence.
const root = process.cwd(), reportDir = path.join(root, "reports/go-live-acceptance");
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (/\.tsx?$/.test(file) && !/\.(test|spec)\./.test(file)) files.push(path.relative(root, file));
  }
}
await walk(path.join(root, "src")); files.sort();
const source = new Map(), imports = new Map(), bindings = new Map(), declarations = new Map(), symbols = new Map(), exports = [];
function strings(node, predicate, argumentsForCall = call => call.arguments) {
  const found = [];
  function visit(n) {
    if (ts.isCallExpression(n) && predicate(n)) {
      found.push(argumentsForCall(n).map(a => ts.isStringLiteralLike(a) ? a.text : a.getText()).join(" | "));
    }
    ts.forEachChild(n, visit);
  }
  visit(node); return [...new Set(found)];
}
async function resolve(file, ref) {
  const base = ref.startsWith("@/") ? path.join(root, "src", ref.slice(2)) : ref.startsWith(".") ? path.resolve(root, path.dirname(file), ref) : null;
  if (!base) return null;
  for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    try { await access(base + suffix); return path.relative(root, base + suffix); } catch {}
  }
  return null;
}
for (const file of files) {
  const text = await readFile(path.join(root, file), "utf8");
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const references = [], localBindings = new Map(), localDeclarations = new Map(), exportedSymbols = new Map();
  const isExported = node => node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
  const isDefault = node => node.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
  for (const statement of ast.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const resolved = await resolve(file, statement.moduleSpecifier.text);
      if (resolved) {
        references.push(resolved);
        const clause = statement.importClause;
        if (clause && !clause.isTypeOnly) {
          if (clause.name) localBindings.set(clause.name.text, { file: resolved, symbol: "default" });
          if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) localBindings.set(clause.namedBindings.name.text, { file: resolved, symbol: "*" });
          else for (const item of clause.namedBindings?.elements ?? []) {
            if (!item.isTypeOnly) localBindings.set(item.name.text, { file: resolved, symbol: item.propertyName?.text ?? item.name.text });
          }
        }
      }
    }
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
      localDeclarations.set(statement.name.text, statement);
      if (isExported(statement)) exportedSymbols.set(isDefault(statement) ? "default" : statement.name.text, { node: statement });
    } else if (ts.isFunctionDeclaration(statement) && isDefault(statement)) {
      exportedSymbols.set("default", { node: statement });
    } else if (ts.isVariableStatement(statement)) {
      for (const item of statement.declarationList.declarations) if (ts.isIdentifier(item.name)) {
        localDeclarations.set(item.name.text, item.initializer ?? item);
        if (isExported(statement)) exportedSymbols.set(item.name.text, { node: item.initializer ?? item });
      }
    } else if (ts.isExportAssignment(statement)) {
      exportedSymbols.set("default", { node: statement.expression });
    } else if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause) && !statement.isTypeOnly) {
      const dependency = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? await resolve(file, statement.moduleSpecifier.text) : null;
      for (const item of statement.exportClause.elements) if (!item.isTypeOnly) {
        exportedSymbols.set(item.name.text, dependency ? { file: dependency, symbol: item.propertyName?.text ?? item.name.text } : { local: item.propertyName?.text ?? item.name.text });
      }
    }
  }
  imports.set(file, references); bindings.set(file, localBindings); declarations.set(file, localDeclarations); symbols.set(file, exportedSymbols); source.set(file, { text, ast });
  if (!ast.statements.some(s => ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && s.expression.text === "use server")) continue;
  for (const statement of ast.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const rpcCalls = strings(statement, n => ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "rpc" || ts.isIdentifier(n.expression) && n.expression.text === "portalRpc",
      n => ts.isIdentifier(n.expression) && n.expression.text === "portalRpc" ? n.arguments.slice(1) : n.arguments);
    const permissions = strings(statement, n => ts.isIdentifier(n.expression) && /^(requireInternalPermission|requireCustomerAccess|requireWorkerAccess)$/.test(n.expression.text));
    const tables = strings(statement, n => ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "from");
    const textBody = statement.getText(ast);
    const readOnly = /^(get|search|preview|lookup|inspect|checkSavedCommandFields)/i.test(statement.name.text);
    exports.push({ id: "ACT-" + file.replace(/^src\//, "").replace(/\.ts$/, "").replaceAll("/", "-") + "-" + statement.name.text,
      file, line: ast.getLineAndCharacterOfPosition(statement.getStart()).line + 1, action: statement.name.text,
      kind: readOnly ? "READ_OR_PREVIEW" : "WRITE_OR_AUTH_COMMAND", rpcCalls, permissions, tables,
      delegated: !rpcCalls.length && !/\.auth\./.test(textBody), status: "CHUA_DU_BANG_CHUNG_TUNG_THAO_TAC" });
  }
}
function family(file) {
  if (/auth|access|login|recovery|select-branch/.test(file)) return "AUTH";
  if (/compensation|earning|recognition|commission/.test(file)) return "PAYROLL";
  if (/quotation/.test(file)) return "QUOTE";
  if (/supplier-return|purchases\/returns/.test(file)) return "SUPPLIER_RETURN";
  if (/transfer/.test(file)) return "TRANSFER";
  if (/stock-count/.test(file)) return "STOCK_COUNT";
  if (/invoice|supplier-document/.test(file)) return "INTERNAL_DOCUMENT";
  if (/payment-notice|notice-action/.test(file)) return "NOTICE";
  if (/evidence/.test(file)) return "EVIDENCE";
  if (/reports|audit/.test(file)) return "REPORT_AUDIT";
  if (/gps|tracking/.test(file)) return "GPS_DEFERRED";
  if (/messag/.test(file)) return "MESSAGE";
  if (/routes|routing/.test(file)) return "ROUTE";
  if (/pricing/.test(file)) return "PRICE";
  if (/customers|suppliers|products|catalog|warehouses|settings|resources/.test(file)) return "MASTER";
  if (/credit-action|receivables|payables|finance|cashbook|debts|expenses/.test(file)) return "FINANCE";
  if (/operations/.test(file)) return "NO_OPENING_COMPLETION";
  if (/purchas/.test(file)) return "PURCHASE";
  if (/sales|orders/.test(file)) return "SALES";
  if (/deliver/.test(file)) return "DELIVERY";
  if (/inventory/.test(file)) return "INVENTORY";
  if (/work|service-job|portal/.test(file)) return "WORK_PORTAL";
  return "READ_SHARED";
}
const definitions = {
  AUTH: ["Quản lý; nhân viên/thợ/khách đúng tài khoản", "Đăng nhập/chọn chi nhánh; cấp/thu hồi/cấp lại quyền; JWT cũ khi ban; khôi phục có token hợp lệ và sai token", "employee_branch_access, explicit_permissions, memberships, Auth; không thay kho/tiền", "Quyền hiện hành ở RPC/RLS; người cũ và sai phạm vi bị chặn; quyền được cấp lại đọc đúng; không gửi email cho người thật khi thử", "ROLE_LIFECYCLE177; AUTH_DISABLED_FINAL178", "T05/T06: quyền explicit/invite và token recovery hợp lệ chưa có proof riêng"],
  PAYROLL: ["Quản lý compensation.manage/approve; kế toán payment.post; thợ chỉ xem của mình", "Tạo quy tắc; căn cứ thủ công; tính/duyệt/chi; tự động theo service/work/SO; đối chiếu hoa hồng đã trả", "rules/bases/earning_events -> AP -> payments/allocations; source snapshots/audit", "Lượng và tiền theo căn cứ nguồn; duyệt mới tạo AP; chi không đổi nguồn; retry một effect; trả hàng không sửa khoản đã trả", "BROWSER_SERVICE177; PACKAGE8 commission proofs", "T37: FIXED_MONTHLY/PER_SHIFT/PER_DAY/BONUS/ADJUSTMENT và rule hiện có cần native+browser"],
  QUOTE: ["Bán hàng; khách OWNER/FINANCE_CONTACT; RECEIVER bị cấm chấp nhận", "Tạo/sửa/gửi/chấp nhận/revision/chuyển SO; thiếu trường; hai trang cùng sửa", "quotation/revision/lines -> SO/lines; không AR/AP/stock khi báo giá", "Version cũ bị chặn; snapshot giữ; sai khách/quyền không chấp nhận; revision gửi giữ nguyên; chuyển SO không tự xác nhận", "PACKAGE7 pricing; static reads", "T04/T21: browser amendment và portal quote action chưa có đủ proof"],
  SALES: ["Bán hàng orders.create/confirm/cancel; quản lý override quyền riêng", "Tạo/sửa nháp; xác nhận; override tín dụng; hủy; đóng phần còn; quantities 6digits, missing/null/version/source", "SO/lines/credit reservations -> allocations/delivery -> AR; source giữ theo từng dòng", "Draft edit giữ giá/quy đổi cũ; confirmed không sửa nháp; close không che cargo/credit; dư precision không lưu", "BROWSER_SOURCE_FLOW176; BROWSER_MULTI_DELIVERY_RESUME177; QUANTITY_VERSION_AUDIT_SEAMS178", "T04/T21 browser sửa nháp/stale/từ chối và override cần ca riêng"],
  PURCHASE: ["Mua hàng; kho nhận; quyền duyệt mua; thợ không sửa giá", "Tạo/sửa/xác nhận/hủy PO; đổi đích; PO kho và giao thẳng; nhận từng phần/NCC verify; quick supplier", "PO/lines -> receipts/inventory hoặc direct_fulfillments/AP -> SO supply", "Mua/bán giá lượng độc lập; nhận mới tạo stock/AP; direct không kho giả; source/version/quantity/cost guards", "BROWSER_SOURCE_FLOW176; BROWSER_MULTI_UOM177; LOCAL_DELTA_SEAMS177; PACKAGE11 direct", "T04/T21 browser PO edit/cancel/quick supplier và retry source cần chứng minh"],
  INVENTORY: ["Kho inventory.receive; mua hàng không mặc nhiên kiểm kê", "Nhận từng phần; threshold; giữ chỗ và thực lấy", "receipts -> inventory_movements/reservations/AP; threshold config/audit", "Chỉ stock có nguồn được giữ/lấy; NULL/scale bị chặn; retry không ledger thứ hai", "MULTI_RECEIPT_RECOVERY177; INVENTORY_RACE177", "Threshold create/edit và scope action riêng"],
  DELIVERY: ["Điều phối/Kho; thợ hiện hành; quản lý delivery.verify", "Allocate/create/assign/publish/handoff/arrived/report/verify; cập nhật receiver; failed/refused/return/loss/redelivery", "delivery/assignment/work/cargo -> verification/inventory/AR/revenue/cost -> return/credit", "Plan15/loaded14/accepted13 còn1; người cũ bị chặn; FULL khác accepted giữ hai sự kiện; cost riêng; source/cap/version/retry", "BROWSER_SOURCE_FLOW176; BOUNDARIES177; G10/G13/G14 old scoped evidence", "T21: các amendment thực sự hiện hữu; receiver update/cancel và return browser đúng source"],
  WORK_PORTAL: ["Quản lý tạo/phát; thợ claim/start/report; khách đọc riêng", "Service create/cancel/publish/assign/claim/start/heartbeat/report/verify; job/pool/earnings/profile", "service/work/assignment/results -> verification/AR/earning; portal projections", "Thợ chỉ current assignee; kết quả không tự ghi khách nhận hoặc cash; lượng exact; trạng thái cũ không cho ghi sai", "BROWSER_SERVICE177; ROLE_LIFECYCLE177; WORKFORCE_READER179", "Poolclaim/heartbeat/cancel và snapshot quyền có ca cụ thể"],
  FINANCE: ["Kế toán AR/AP/payment; sales bị cấm finance/cost", "Account/category/expense approve; thu/chi/phân bổ/đảo/đối chiếu; điều chỉnh/return credit/refund/offset", "payments/allocations/advance/credit/AP/AR/revenue/audit", "Không cash hai lần; giới hạn nguồn/cùng khách/branch; refund+offset cap; WRITE_OFF không return revenue; rollback/retry", "PAYMENT_LITERAL177; PACKAGE4/5 credit; G09/G16; PACKAGE9 expenses", "Account/category và reverse/reconcile browser; filters AP; hai advance races tuyệt đối loại"],
  TRANSFER: ["Kho có quyền chuyển/thực xuất/thực nhận/duyệt hao hụt", "Lập/shipped/received partial/missing/damaged/loss; lỗi/retry/receive concurrency", "transfer source -> warehouse/transit/value -> warehouse destination/loss", "Bảo toàn lượng/giá trị; thiếu vẫn open; mộtSKU/samebranch theo mô hình hiện có", "PACKAGE10_TRANSFER_SEAMS142/AUTH/BROWSER142", "Đối chiếu định nghĩa179 để dùng lại evidence; trang chi tiết đọc trạng thái đúng"],
  STOCK_COUNT: ["Kho kiểm đếm; người có inventory.adjust.approve duyệt", "Open/record/approve; stock đổi sau basis; count zero hữu hạn; version NULL", "count/basis -> adjustment movement/audit", "Stale stock/reservation/transit bị chặn trước ledger; không ghi đè tồn", "PACKAGE1; PACKAGE6 G01; LOCAL_DELTA_SEAMS177", "Đối chiếu source/ACL hiện hành và browser count detail"],
  SUPPLIER_RETURN: ["Mua hàng/kho/Finance theo từng quyền", "Lập từ receipt/direct; thực trả; NCC accept; approve credit; refund/offset sau paid", "source actual -> return event -> approved credit/AP -> settlement", "Cap nhiều lần; không giảm AP lần2 khi note; direct không kho giả; paid settlement có nguồn", "PACKAGE11_PHYSICAL/CREDIT/AUTH/BROWSER148/DIRECT150", "Đối chiếu source mới và toàn trang/role hiện hành"],
  INTERNAL_DOCUMENT: ["Kế toán/mua hàng theo quyền; legal issue hoãn", "Register/match/review/export supplier; create/approve/cancel/adjust internal invoice", "PO/receipt/direct/supplier document -> matching; invoice metadata/source AR/AP", "Lượng/giá/value/source coverage; không tạo AR/AP lần2; internal không issued; legal disabled", "PACKAGE12_DOCUMENT_AUTH/BROWSER158/INVOICE159", "API PDF/CSV đọc đúng quyền/khách/branch và version hiện hành"],
  NOTICE: ["Khách đúng membership báo; kế toán review/reconcile", "Tạo notice real evidence; accept/reject/link/unlink thực receipt", "notice/evidence -> reconciliation/payment coverage; allocations riêng", "Ảnh/accept không giảm nợ; đúng BANKreceipt/customer/branch/cap; concurrent link không tiền2", "PACKAGE13_NOTICE_AUTH/RACE/BROWSER162; STORAGE174", "Đối chiếu179 và account ban không bypass"],
  EVIDENCE: ["Người có quyền nguồn; sai người/khách/branch bị cấm", "Create/upload/verify/finalize/link/download; partial/error/lost-response/retry/replace; reverify legacy", "metadata + actual Storage bytes -> immutable verification -> source link", "Không tin clientmetadata; tồn tại/path/size/hash đúng; chưa complete không proof; không đổi bytes giữ verified cũ", "Storage real174; STORAGE_READ179; legacy/reverify proofs", "Backup byte môi trường đích và owned QA restore; source-specific reads"],
  REPORT_AUDIT: ["Finance theo AR/AP/profit; audit quyền; sales masked", "Filters/date/knowledge-cutoff; PDF/CSV; >1000 restart samejob; audit per command rollback/retry", "source ledgers -> views/report/export job/audit allowlist", "Tổng tiền/ID đối chiếu nguồn; không lộ cost; historyunknown khác0; CSV an toàn; audit success cùngTX", "G09/G16; LARGE_EXPORT177; QUANTITY_VERSION_AUDIT_SEAMS178", "T40 allowlist tất cả command; T41 AP/filter/cutoff và PDF thật"],
  MASTER: ["Quản lý/master quyền riêng; bán hàng quick customer/site; mua quick supplier", "Create/edit active/master/branch/material/uom/conversion/customer/site/supplier/vehicle/machine", "master config/audit -> lookup/snapshots/source eligibility", "Expected JSON stale bị chặn; không đổi snapshot cũ; crossbranch customer/site cấm; capacity locked khi cargo", "G13 vehicle proofs; static reads", "Mỗi kind hiện hữu cần native permission/state+browser representative, không tạo opening"],
  PRICE: ["pricing.manage/purchase pricing; Sales chỉ dùng quy tắc", "Create/version/effective rule; customer/group/tier/default/override", "pricing rules -> immutable SO/PO/quotation snapshots", "Serverpriority; override có reason/right/audit; đổi bảng giá không đổi chứng từ cũ", "PACKAGE7_HIERARCHY/PRICING_BROWSER127; PURCHASE129", "Đối chiếu action edit/version và precision trên179"],
  MESSAGE: ["Người tham gia cuộc hội thoại; người ngoài cấm", "Create/send/read; WS subscribe/update/disconnect/recover query", "conversation/participants/messages/read receipts; no finance", "RLS đúng participant/currentrights; retry/query khôi phục; không lộ nội bộ khách khác", "REALTIME_REGRESSION178; messaging browser174", "Browser create/send/read ở ba surface và revoked participant nếu có đường hiện hữu"],
  ROUTE: ["Điều phối có quyền schedule/resource", "Lập/xem/áp dụng route, không nhân bản chi phí/group unsupported", "route plan/steps -> delivery assignment/schedule; per delivery nguồn", "Đúng branch/vehicle/time/cargo, apply atomic/version/retry; cost không nhân bản", "G13 schedule source evidence", "Browser create/apply route + quyền và stale nguồn"],
  NO_OPENING_COMPLETION: ["Quản lý/role nghiệp vụ", "Nguồn mới tại PENDING/noactivation; completion/cancel residual/returns/money", "operational state history và actual sources -> completion projection", "Không opening gate/zero fake; còn cargo/return/credit không complete; activation legacy tùy chọn không được bắt buộc", "NO_OPENING178; SOURCE_FLOW176; PACKAGE14_OPERATIONS164", "UI toàn entry vận hành không pendingopening blocking; olddoc continuation trên bản sao đích"],
  GPS_DEFERRED: ["Thợ hiện hành", "Đọc trạng thái unavailable; start/ping501; old session stop và reassignee denial", "Không vị trí giả; session quyền hiện hành", "Không báo device thành công; đổi người thu hồi quyền vẫn đúng", "G06 GPS backend; candidate device gate", "Thiết bị hoãn theo user, không chặn phát hành; HTTP guard hiện hành cần mapping"],
  READ_SHARED: ["Tài khoản đúng quyền surface", "List/detail/search/reload; missing ID, wrong branch/customer, logged-out", "Shared scoped query -> displayed exact fields", "Không runtimeoverlay; không leak; dữ liệu cũ không bypass write guard", "STATIC_READ177; ROLE_LIFECYCLE177", "Mọi dynamic detail phải bind nguồn hiện hữu và kiểm scope"],
};
function closure(file, seen = new Set()) { if (seen.has(file)) return seen; seen.add(file); for (const dep of imports.get(file) ?? []) closure(dep, seen); return seen; }
// Follow the imported symbol that is actually referenced, rather than every export
// in its module. This is still a conservative static graph, not a rendered form.
function reachableActions(file, entrySymbols) {
  const actionIds = new Set(), seen = new Set(), unresolved = new Set();
  const bySymbol = new Map(exports.map(action => [action.file + ":" + action.action, action]));
  function symbol(targetFile, name, local = false) {
    const key = targetFile + ":" + (local ? "local:" : "export:") + name;
    if (seen.has(key)) return;
    seen.add(key);
    const action = bySymbol.get(targetFile + ":" + name);
    if (action) actionIds.add(action.id);
    const entry = local ? { node: declarations.get(targetFile)?.get(name) } : symbols.get(targetFile)?.get(name);
    if (!entry) { unresolved.add(targetFile + ":" + name); return; }
    if (entry.file) symbol(entry.file, entry.symbol);
    else if (entry.local) reference(targetFile, entry.local);
    else if (entry.node) visit(targetFile, entry.node);
  }
  function reference(targetFile, name) {
    const binding = bindings.get(targetFile)?.get(name);
    if (binding) {
      if (binding.symbol === "*") unresolved.add(targetFile + ":namespace:" + name);
      else symbol(binding.file, binding.symbol);
    } else if (declarations.get(targetFile)?.has(name)) symbol(targetFile, name, true);
  }
  function visit(targetFile, node) {
    if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isImportDeclaration(node)) return;
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const binding = bindings.get(targetFile)?.get(node.expression.text);
      if (binding?.symbol === "*") { symbol(binding.file, node.name.text); return; }
    }
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const binding = bindings.get(targetFile)?.get(node.expression.text);
      if (binding?.symbol === "*" && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression)) { symbol(binding.file, node.argumentExpression.text); return; }
    }
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const propertyName = (ts.isPropertyAccessExpression(parent) && parent.name === node)
        || (ts.isPropertyAssignment(parent) && parent.name === node)
        || (ts.isJsxAttribute(parent) && parent.name === node);
      const declarationName = (ts.isFunctionDeclaration(parent) || ts.isClassDeclaration(parent) || ts.isVariableDeclaration(parent) || ts.isParameter(parent)) && parent.name === node;
      if (!propertyName && !declarationName) reference(targetFile, node.text);
    }
    ts.forEachChild(node, child => visit(targetFile, child));
  }
  for (const entry of entrySymbols) symbol(file, entry);
  return { actionIds: [...actionIds].sort(), unresolvedSymbolReferences: [...unresolved].sort() };
}
const pages = files.filter(f => /\/page\.tsx$/.test(f)), api = files.filter(f => /\/api\/.*\/route\.ts$/.test(f));
assert.equal(pages.length, 87); assert.equal(api.length, 24);
const surfaces = [...pages, ...api].map(file => {
  const deps = closure(file), group = family(file);
  const entrySymbols = pages.includes(file) ? ["default"] : [...(symbols.get(file)?.keys() ?? [])].filter(name => /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name));
  const reachable = reachableActions(file, entrySymbols);
  return { file, type: pages.includes(file) ? "PAGE" : "API", caseFamily: group,
    ...reachable, importClosureActionIds: exports.filter(a => deps.has(a.file)).map(a => a.id),
    reachability: "REFERENCED_SYMBOL_GRAPH_CONDITIONAL_PATHS_NOT_RENDERED_ACCEPTANCE",
    directRpcCalls: strings(source.get(file).ast, n => ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "rpc"),
    permissions: strings(source.get(file).ast, n => ts.isIdentifier(n.expression) && /^(requireInternalPermission|requireCustomerAccess|requireWorkerAccess)$/.test(n.expression.text)),
    result: "MAP_ONLY_NOT_A_RUNTIME_PASS" };
});
const actions = exports.map(a => ({ ...a, caseFamily: family(a.file + "/" + a.action.toLowerCase()), surfaces: surfaces.filter(s => s.actionIds.includes(a.id)).map(s => s.file),
  surfaceReachability: surfaces.some(s => s.actionIds.includes(a.id)) ? "REFERENCED_BY_ACTIVE_SURFACE_SYMBOL_GRAPH" : "NO_ACTIVE_SURFACE_SYMBOL_REFERENCE",
  requiredChecks: a.kind === "READ_OR_PREVIEW" ? ["authorized positive with independent source", "wrong branch/customer/role denial", "exact quantity/money and reload"] : ["authorized valid command with source readback", "forbidden actor and wrong source scope", "valid/invalid state and stale/NULL version where contract requires", "financial/inventory/next-role effects", "retry original intent and rollback on failure where command supports"] }));
const families = Object.entries(definitions).map(([id, [roles, operations, dataEffects, expected, existingEvidence, missingEvidence]]) => ({ id, roles, operations, dataEffects, expected, existingEvidence, missingEvidence, status: "LEGACY_FAMILY_REQUIREMENTS_EVIDENCE_ATTACHMENT_REQUIRES_CURRENT_REVIEW" }));
const canonicalMigrations = (await readdir(path.join(root, "supabase/migrations"))).filter(file => /^\d+.*\.sql$/.test(file)).sort();
const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sourceFingerprint = createHash("sha256");
for (const file of files) sourceFingerprint.update(file + "\0" + source.get(file).text + "\0");
const output = { generatedAt: new Date().toISOString(), baselineCommit: currentHead, schema: canonicalMigrations.length,
  schemaMeaning: "SOURCE_CANONICAL_MIGRATION_COUNT_NOT_RUNTIME_DATABASE_OBSERVATION", latestCanonicalMigration: canonicalMigrations.at(-1),
  currentSourceSha256: sourceFingerprint.digest("hex"), sourceHasUncommittedChanges: Boolean(execFileSync("git", ["status", "--porcelain", "--", "src", "supabase/migrations"], { cwd: root, encoding: "utf8" }).trim()),
  inventoryOnly: true, excludedAdvanceRaces: ["package4-advance-race.mjs --mode different-intents", "package4-advance-race.mjs --mode same-intent"],
  sourceFiles: files.length, pages: pages.length, api: api.length, exportedServerFunctions: actions.length,
  familyEvidenceReview: "reports/go-live-acceptance/ACCEPTANCE_COVERAGE_REVIEW.md", familyDefinitionBaselineCanonical: 179,
  referencedServerExports: actions.filter(action => action.surfaces.length).length, unreferencedServerExports: actions.filter(action => !action.surfaces.length).map(action => action.id),
  limitation: "Action mapping follows referenced import symbols and local helpers. Conditional paths, lexical shadowing, computed/namespace references, runtime-generated delegates and dynamic RPC names still require manual resolution. importClosureActionIds is retained only as an over-approximation. A referenced export is not proof that a form is rendered, a distinct business writer exists or a runtime case passed.", families, surfaces, actions };
await writeFile(path.join(reportDir, "SYSTEM_ACCEPTANCE_INVENTORY.json"), JSON.stringify(output, null, 2));
let md = "# Danh mục nghiệm thu hệ thống\n\nCHƯA HOÀN TẤT. Ánh xạ nguồn hiện hành:87 trang/24API. Mỗi dòng bên dưới chỉ là ánh xạ; kết quả đọc trang hoặc CI không thay bằng chứng thao tác.\n\n";
md += "## Ca nghiệp vụ cụ thể\n\n| Mã | Vai trò/thao tác | Tác động dữ liệu | Kỳ vọng | Bằng chứng đã có/phần còn thiếu |\n|---|---|---|---|---|\n";
for (const f of families) md += `| ${f.id} | ${f.roles}. ${f.operations} | ${f.dataEffects} | ${f.expected} | ${f.existingEvidence}. **Còn thiếu:** ${f.missingEvidence} |\n`;
md += "\n## Ánh xạ87 trang và24API\n\n| Tệp thực tế | Ca | Thao tác server có thể đi tới | Trạng thái |\n|---|---|---|---|\n";
for (const s of surfaces) md += `| \`${s.file}\` | ${s.caseFamily} | ${s.actionIds.map(id => id.split("-").at(-1)).join(", ") || "Đường đọc/API trực tiếp; xem JSON permissions/RPC"} | ĐÃ ÁNH XẠ; kết quả thực xem ca/bằng chứng, chưa tự PASS |\n`;
md += "\n## Từng thao tác server\n\nMỗi action có mã riêng, source/line, quyền, RPC literal hoặc biểu thức động, bảng và các ca bắt buộc trong SYSTEM_ACCEPTANCE_INVENTORY.json. Helper dùng chung có thể đòi hỏi đối chiếu bổ sung; không coi thiếu literal là không có ghi.\n\n| Action/file | Ca | RPC/quyền đọc được từ thân hàm | Kiểm chứng còn cần gắn |\n|---|---|---|---|\n";
for (const a of actions) md += `| ${a.action} · \`${a.file}:${a.line}\` | ${a.caseFamily} | ${[...a.rpcCalls, ...a.permissions].join("; ").replaceAll("|", " / ") || "Delegate/helper: truy tiếp nguồn"} | ${a.requiredChecks.join("; ")} |\n`;
md += "\nBằng chứng cũ có hiệu lực chỉ sau đối chiếu định nghĩa hiệu lực và phạm vi; không ghi các ca mới thành đạt. Hai advance races bị loại, giữ600.000đ/400.000đ/một phiếu tiền. GPS thiết bị và phát hành pháp lý hoãn theo người dùng; backend quyền/chức năng nội bộ vẫn cần đạt.\n";
const matrixWritten = process.argv.includes("--write-matrix");
if (matrixWritten) await writeFile(path.join(reportDir, "SYSTEM_ACCEPTANCE_MATRIX.md"), md);
console.log(JSON.stringify({ pages: pages.length, api: api.length, serverFunctions: actions.length, referencedServerExports: output.referencedServerExports, canonicalMigrationCount: output.schema,
  families: families.length, matrixWritten, dynamicOrDelegated: actions.filter(a => a.delegated || a.rpcCalls.some(r => !/^[a-z_]+ \|/.test(r))).length, status: "MAPPED_NOT_ACCEPTED" }));
