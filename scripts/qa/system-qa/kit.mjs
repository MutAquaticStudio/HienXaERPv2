// System QA kit (01/11/2026): Playwright against a running app (HX_QA_BASE_URL) wired to the QA project.
// Credentials come from the environment (HX_QA_PASSWORD); nothing secret is stored in the repo.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

export const BASE = process.env.HX_QA_BASE_URL ?? 'http://localhost:3100';
export const OUT = process.env.HX_QA_OUT ?? 'qa-out';
export const ACCOUNTS = {
  owner: { email: 'hxqa-owner@example.test', login: '/', tab: 'Vận hành' },
  worker: { email: 'hxqa-worker@example.test', login: '/', tab: 'Thợ & tài xế' },
  customer: { email: 'hxqa-finance@example.test', login: '/', tab: 'Khách hàng' },
};
mkdirSync(`${OUT}/shots`, { recursive: true });

export const results = [];
export function record(area, name, status, detail = '') {
  results.push({ area, name, status, detail: String(detail).slice(0, 400) });
  console.log(`${status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '•'} [${area}] ${name}${detail ? ' — ' + String(detail).slice(0, 200) : ''}`);
}
export function save(file) { writeFileSync(`${OUT}/${file}`, JSON.stringify(results, null, 2)); }

export async function openBrowser() { try { return await chromium.launch(); } catch { return chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); } }

/** Signed-in page for a role; watches console errors and failed requests. */
export async function session(browser, role, { mobile = false } = {}) {
  const context = await browser.newContext({ baseURL: BASE, viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh',
    geolocation: { latitude: 20.9935, longitude: 105.7575, accuracy: 20 }, permissions: ['geolocation'] });
  context.setDefaultTimeout(60000); context.setDefaultNavigationTimeout(90000);
  const page = await context.newPage();
  page.qaErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error' && !/favicon|Download the React DevTools|vietqr|tile\.openstreetmap|Failed to load resource: the server responded with a status of 404/.test(msg.text())) page.qaErrors.push(msg.text()); });
  page.on('pageerror', (err) => page.qaErrors.push(`pageerror: ${err.message}`));
  const account = ACCOUNTS[role];
  // Protected Vercel preview: the share link sets the access cookie for this browser context.
  if (process.env.HX_QA_SHARE) await page.goto(`/?_vercel_share=${process.env.HX_QA_SHARE}`);
  await page.goto(account.login);
  if (account.tab) await page.getByRole('tab', { name: account.tab }).click();
  await page.locator('input[name=email]:visible').fill(account.email);
  await page.locator('input[name=password]:visible').fill(process.env.HX_QA_PASSWORD);
  await page.locator('form:has(input[name=password]:visible) button[type=submit]').first().click();
  await page.waitForURL((url) => !/\/login$/.test(url.pathname) && url.pathname !== '/', { timeout: 30000 });
  return { context, page };
}

export async function shot(page, name) { await page.screenshot({ path: `${OUT}/shots/${name}.png`, fullPage: true }).catch(() => {}); }

/** Visible text problems: error screens and leftover English UI words. */
export async function pageProblems(page) {
  const text = await page.locator('body').innerText().catch(() => '');
  const problems = [];
  if (/Application error|Unhandled Runtime Error|Internal Server Error|This page could not be found|Đã xảy ra lỗi|Không thể tải/i.test(text)) problems.push('error screen: ' + (text.match(/(Application error|Unhandled Runtime Error|Internal Server Error|This page could not be found|Đã xảy ra lỗi[^\n]*|Không thể tải[^\n]*)/i)?.[0] ?? ''));
  const english = text.match(/\b(undefined|null|NaN|Loading\.\.\.|Submit|Cancel|Delete|Save|Error)\b/g);
  if (english) problems.push('english/raw: ' + [...new Set(english)].join(', '));
  return problems;
}
