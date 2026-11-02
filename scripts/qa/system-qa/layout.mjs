// Main menu bar must not overlap at common desktop widths (with the contacts panel open, as by default).
import { openBrowser, session, record, save, shot } from './kit.mjs';
const browser = await openBrowser();
const { context, page } = await session(browser, 'owner');
for (const width of [1280, 1366, 1440, 1600, 1920]) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/admin/orders', { waitUntil: 'load' }); await page.waitForTimeout(1200);
  const overlaps = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#app-menu .nav-list > *')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    let count = 0; for (let i = 1; i < items.length; i++) if (items[i].left < items[i - 1].right - 1 && Math.abs(items[i].top - items[i - 1].top) < 10) count++;
    const bar = document.querySelector('#app-menu .main-menu-inner') ?? document.querySelector('#app-menu');
    return { count, scroll: bar ? bar.scrollWidth - bar.clientWidth : 0, dock: !!document.querySelector('.chat-dock, [aria-label="Người liên hệ"]') };
  });
  const bad = overlaps.count > 0 || overlaps.scroll > 2;
  record('Bố cục', `Thanh menu ở ${width}px`, bad ? 'FAIL' : 'PASS', `${overlaps.count} mục chồng nhau, tràn ${overlaps.scroll}px${overlaps.dock ? ', khung liên hệ mở' : ''}`);
  if (bad) await shot(page, `menu-${width}`);
}
await context.close(); await browser.close(); save('layout.json');
