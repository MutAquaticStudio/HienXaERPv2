import { openBrowser, session } from './kit.mjs';
import { readFileSync } from 'node:fs';
const extra = process.env.EXTRA_CSS ? readFileSync(process.env.EXTRA_CSS, 'utf8') : '';
const browser = await openBrowser();
const { page } = await session(browser, 'owner');
await page.goto('/admin/orders'); await page.waitForSelector('#app-menu .nav-list');
if (extra) await page.addStyleTag({ content: extra });
for (const w of (process.env.WIDTHS ?? "1180,1280,1366,1440,1536,1600,1920").split(",").map(Number)) {
  await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const els = [...document.querySelectorAll('#app-menu .nav-list > *, #app-menu .menu-cta')];
    const rects = els.map((e) => { const t = e.matches('.nav-group') ? e.querySelector('.nav-group-toggle') : e; const b = t.getBoundingClientRect(); return { n: t.textContent.trim(), t: Math.round(b.top), l: Math.round(b.left), r: Math.round(b.right), sw: t.scrollWidth, cw: t.clientWidth }; });
    const overlaps = []; for (let i = 1; i < rects.length; i++) if (rects[i].t === rects[i - 1].t && rects[i].l < rects[i - 1].r - 1) overlaps.push(rects[i - 1].n + '|' + rects[i].n);
    const clipped = rects.filter((x) => x.sw > x.cw + 1).map((x) => x.n);
    const inner = document.querySelector('.main-menu-inner').getBoundingClientRect();
    return { rows: new Set(rects.map((x) => x.t)).size, dock: !!document.querySelector('.chat-dock:not(.collapsed)'), innerR: Math.round(inner.right), last: rects.at(-1)?.r, overlaps, clipped, doc: document.documentElement.scrollWidth };
  });
  console.log(w, JSON.stringify(r));
}
await page.screenshot({ path: '/tmp/claude-0/-home-user-HienXaERPv2/0417063b-9bc4-5e99-84c5-f3bdd3fd0a9e/scratchpad/menu.png', clip: { x: 0, y: 0, width: 1920, height: 140 } });
await browser.close();
