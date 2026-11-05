// Layer 1: every screen for each role — no error screen, no console error, Vietnamese only, mobile for portals.
import { openBrowser, session, record, save, shot, pageProblems } from './kit.mjs';

const ADMIN = ['/admin', '/admin/orders', '/admin/orders/new', '/admin/quotations', '/admin/customers', '/admin/products', '/admin/products/pricing',
  '/admin/suppliers', '/admin/purchase-orders', '/admin/purchase-orders/new', '/admin/purchases/returns', '/admin/inventory', '/admin/inventory/transfers',
  '/admin/inventory/warehouses', '/admin/stock-counts', '/admin/deliveries', '/admin/dispatch', '/admin/dispatch/resources', '/admin/routes',
  '/admin/service-jobs', '/admin/service-jobs/types', '/admin/receivables', '/admin/payables', '/admin/debts', '/admin/cashbook', '/admin/expenses',
  '/admin/payment-notices', '/admin/invoices', '/admin/reports', '/admin/workforce', '/admin/attendance', '/admin/payroll', '/admin/compensation',
  '/admin/access', '/admin/settings', '/admin/settings/automation', '/admin/settings/branches', '/admin/settings/pricing', '/admin/notifications',
  '/admin/messages', '/admin/audit', '/admin/settings/ai', '/admin/operations', '/admin/catalog', '/admin/orders/import', '/admin/dashboard/obligations'];
const WORK = ['/work', '/work/pool', '/work/attendance', '/work/earnings', '/work/messages', '/work/profile', '/work/tracking'];
const CUSTOMER = ['/customer', '/customer/orders', '/customer/orders/new', '/customer/debts', '/customer/quotations', '/customer/messages', '/customer/profile'];

const browser = await openBrowser();
async function visit(role, paths, mobile) {
  const { context, page } = await session(browser, role, { mobile });
  record('Đăng nhập', `${role}${mobile ? ' (điện thoại)' : ''}`, 'PASS', page.url());
  for (const path of paths) {
    page.qaErrors.length = 0;
    const started = Date.now();
    let status = 0;
    try { const response = await page.goto(path, { waitUntil: 'load', timeout: 90000 }); status = response?.status() ?? 0; }
    catch (error) { record(`Màn hình ${role}`, path, 'FAIL', error.message); continue; }
    const ms = Date.now() - started;
    const problems = await pageProblems(page);
    const final = new URL(page.url()).pathname;
    const issues = [...problems, ...page.qaErrors.map((e) => 'console: ' + e)];
    if (status >= 400) issues.unshift(`HTTP ${status}`);
    const name = `${path}${final !== path ? ` → ${final}` : ''} (${ms} ms)`;
    record(`Màn hình ${role}${mobile ? ' (ĐT)' : ''}`, name, issues.length ? 'FAIL' : 'PASS', issues.join(' | '));
    if (issues.length) await shot(page, `${role}${mobile ? '-m' : ''}${path.replaceAll('/', '_')}`);
  }
  await context.close();
}
await visit('owner', ADMIN, false);
await visit('worker', WORK, true);
await visit('customer', CUSTOMER, true);
await visit('customer', CUSTOMER.slice(0, 4), false);
await browser.close();
save('smoke.json');
