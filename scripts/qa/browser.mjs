import { chromium } from '@playwright/test';
import { preflight, email, required, id } from './core.mjs';
export async function browserSession(role) {
  const base = await preflight();
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1080 } });
  await context.addCookies([{ name: 'hx_branch_id', value: id('branch-A'), url: base }]);
  const page = await context.newPage();
  try {
  const login = ['finance','receiver','other_customer'].includes(role) ? '/customer/login' : role === 'worker' ? '/work/login' : '/login';
  await page.goto(login);
  await page.locator('input[name=email]').fill(email(role));
  await page.locator('input[name=password]').fill(required('HX_QA_PASSWORD'));
  await page.locator('button[type=submit]').click();
  await page.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 30000 });
  return { browser, context, page };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
