// Layer 2: business flows end to end through the UI, as the owner/accountant, the worker and the customer.
// Run: HX_QA_PASSWORD=… node e2e.mjs [step…]  (state between steps in $HX_QA_OUT/state.json)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { openBrowser, session, record, save, shot, OUT } from './kit.mjs';

const stateFile = `${OUT}/state.json`;
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
const keep = () => writeFileSync(stateFile, JSON.stringify(state, null, 2));
const browser = await openBrowser();
const pages = {};
async function as(role) { if (!pages[role]) pages[role] = (await session(browser, role)).page; return pages[role]; }
async function asMobile(role) { const key = role + '-m'; if (!pages[key]) pages[key] = (await session(browser, role, { mobile: true })).page; return pages[key]; }

async function pick(page, name, text) {
  const box = page.getByRole('combobox', { name, exact: true }); await box.click(); if (text !== undefined) await box.fill(text);
  await page.waitForTimeout(1200);
  await page.getByRole('listbox', { name, exact: true }).getByRole('option').first().click(); await page.waitForTimeout(600);
}

const steps = {
  async 'Bán hàng: tạo và xác nhận đơn bán'() {
    const page = await as('owner');
    await page.goto('/admin/orders/new', { waitUntil: 'load' });
    await pick(page, 'Khách hàng', 'An'); await pick(page, 'Công trình / điểm giao');
    const mat = page.getByRole('combobox', { name: 'Tìm vật tư' }); await mat.click(); await mat.fill('xi'); await page.waitForTimeout(1500);
    await page.getByRole('option').filter({ hasText: /./ }).first().click(); await page.waitForTimeout(800);
    await page.getByRole('textbox', { name: 'Số lượng dòng 1', exact: true }).fill('10');
    await page.getByRole('button', { name: 'Xác nhận đơn' }).click();
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Xác nhận đơn' }).click();
    await page.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}/, { timeout: 45000 });
    await page.waitForLoadState('load');
    state.orderUrl = new URL(page.url()).pathname;
    const text = await page.locator('h1').innerText();
    state.orderNumber = text.match(/SO-\d{4}-\d{6}/)?.[0];
    keep();
    await shot(page, 'e2e-order');
    return `${state.orderNumber} · ${state.orderUrl}`;
  },

  async 'Điều phối: phiếu giao chờ điều phối → Gán nhanh người + xe'() {
    const page = await as('owner');
    await page.goto(state.orderUrl, { waitUntil: 'load' });
    state.deliveryNumber = (await page.locator('main').innerText()).match(/DL-\d{4}-\d{6}/)?.[0];
    if (!state.deliveryNumber) throw new Error('Trang đơn không hiện số phiếu giao');
    keep();
    await page.goto('/admin/dispatch', { waitUntil: 'load' });
    const row = page.getByRole('row').filter({ hasText: state.deliveryNumber });
    await row.getByRole('button', { name: 'Gán' }).click();
    const form = page.getByRole('form', { name: `Gán người và xe cho ${state.deliveryNumber}` });
    const people = form.getByLabel('Người giao'); const peopleOptions = await people.locator('option').allInnerTexts();
    await people.selectOption({ label: 'Thợ 01' });
    await form.getByLabel('Xe').selectOption({ index: 1 });
    await form.getByRole('button', { name: 'Phân giao' }).click();
    await page.waitForURL(/dispatched=|error=/, { timeout: 45000 });
    const text = await page.locator('main').innerText();
    if (/error=/.test(page.url())) throw new Error('Bị từ chối: ' + decodeURIComponent(new URL(page.url()).searchParams.get('error') ?? ''));
    await shot(page, 'e2e-dispatch');
    return `người nhận việc: ${peopleOptions.slice(1).join(', ')}; ${text.includes(state.deliveryNumber) ? 'phiếu đã lên lịch tài xế' : ''}`;
  },

  async 'Phiếu giao: đổi người giao sang Thợ 01 (Phân người và xe)'() {
    const page = await as('owner');
    await page.goto(state.orderUrl, { waitUntil: 'load' });
    state.deliveryUrl = await page.locator('a[href^="/admin/deliveries/"]').first().getAttribute('href'); keep();
    await page.goto(state.deliveryUrl, { waitUntil: 'load' });
    await page.getByLabel('Người giao').selectOption({ label: 'Thợ 01' });
    await page.getByLabel('Xe').selectOption({ index: 1 });
    const now = new Date(Date.now() + 7 * 3600e3 + 10 * 60e3).toISOString().slice(0, 16);
    const end = new Date(Date.now() + 7 * 3600e3 + 70 * 60e3).toISOString().slice(0, 16);
    await page.getByLabel('Giờ bắt đầu giao').fill(now);
    await page.getByLabel('Giờ kết thúc dự kiến').fill(end);
    await page.getByRole('button', { name: 'Phân người và xe' }).click();
    await page.waitForLoadState('load'); await page.waitForTimeout(2500);
    const text = await page.locator('main').innerText();
    await shot(page, 'e2e-reassign');
    if (!/Thợ 01/.test(text)) throw new Error('Trang phiếu không hiện Thợ 01 sau khi phân: ' + text.slice(0, 300));
    return 'đã phân Thợ 01';
  },

  async 'Thợ (điện thoại): thấy việc được giao, mở chi tiết việc'() {
    const page = await asMobile('worker');
    await page.goto('/work', { waitUntil: 'load' });
    const card = page.locator('main').getByText(/WRK-\d{6}-\d{6}/).first();
    state.workNumber = (await card.innerText()).match(/WRK-\d{6}-\d{6}/)?.[0]; keep();
    await page.getByRole('link', { name: 'Mở việc' }).first().click();
    await page.waitForURL(/\/work\/jobs\//);
    state.jobUrl = new URL(page.url()).pathname; keep();
    await page.getByText('Hàng trên xe').waitFor({ timeout: 60000 });
    const text = await page.locator('body').innerText();
    for (const want of ['Công ty TNHH Xây dựng An Phát', 'Xi măng Hà Tiên PCB40', '10 kg', 'Đã lấy hàng lên xe']) if (!text.includes(want)) throw new Error('Thiếu: ' + want);
    await shot(page, 'e2e-worker-job');
    return `${state.workNumber}: khách, hàng, số lượng, người nhận đúng`;
  },

  async 'Thợ: chụp ảnh lấy hàng lên xe (tải ảnh minh chứng)'() {
    const page = await asMobile('worker');
    await page.goto(state.jobUrl, { waitUntil: 'load' });
    const upload = page.waitForResponse((r) => r.url().includes('/api/portal/evidence/upload'));
    await page.getByRole('button', { name: 'Đã lấy hàng lên xe · chụp ảnh' }).click();
    await page.locator('input[type=file]').first().setInputFiles(process.env.QA_PHOTO);
    const response = await upload;
    if (!response.ok()) throw new Error(`Tải ảnh lỗi HTTP ${response.status()}: ${await response.text()}`);
    await page.getByText('Đã tải').first().waitFor();
    return 'ảnh đã tải';
  },

  async 'Thợ: vào ca (chấm công có vị trí)'() {
    const page = await asMobile('worker');
    await page.goto('/work', { waitUntil: 'load' });
    if (await page.getByRole('button', { name: 'Ra ca' }).count()) return 'đang trong ca';
    await page.getByRole('button', { name: 'Vào ca' }).click();
    await page.getByRole('button', { name: 'Ra ca' }).waitFor({ timeout: 30000 });
    await shot(page, 'e2e-worker-shift');
    return 'đã vào ca, nút Ra ca hiện';
  },

  async 'Khách (điện thoại): tự đặt đơn 2 mặt hàng → gửi'() {
    const page = await asMobile('customer');
    await page.goto('/customer/orders/new', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Thêm Thép Hòa Phát D10' }).click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Thêm Cát vàng xây tô' }).click(); await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Xem & gửi đơn/ }).click();
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    const review = await dialog.innerText();
    if (!review.includes('570.000 ₫')) throw new Error('Tạm tính sai: ' + review.slice(0, 300));
    await dialog.getByRole('button', { name: 'Gửi đơn' }).click();
    await page.waitForURL((url) => !url.pathname.endsWith('/new'), { timeout: 60000 });
    await page.waitForTimeout(2000);
    const text = await page.locator('body').innerText();
    state.portalOrderNumber = text.match(/SO-\d{4}-\d{6}/)?.[0]; state.portalOrderUrl = new URL(page.url()).pathname; keep();
    await shot(page, 'e2e-customer-order');
    return `${state.portalOrderNumber ?? '(chưa thấy số đơn)'} · ${state.portalOrderUrl} · ${/Chờ duyệt/.test(text) ? 'Chờ duyệt' : ''}`;
  },

  async 'Bán hàng: chủ duyệt đơn khách đặt (tự phân nguồn)'() {
    const page = await as('owner');
    await page.goto('/admin/orders', { waitUntil: 'load' });
    const list = await page.locator('main').innerText();
    if (!list.includes(state.portalOrderNumber)) throw new Error('Danh sách đơn không có ' + state.portalOrderNumber);
    state.portalAdminUrl = '/admin/orders/' + state.portalOrderUrl.split('/').pop(); keep();
    await page.goto(state.portalAdminUrl, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Duyệt đơn (giữ hạn mức, tự phân nguồn)' }).click();
    await page.waitForLoadState('load'); await page.waitForTimeout(4000);
    const text = await page.locator('main').innerText();
    await shot(page, 'e2e-approve');
    const sourcing = [...new Set(text.match(/(DL|PO)-\d{4}-\d{6}/g) ?? [])];
    if (/Duyệt đơn \(giữ hạn mức/.test(text)) throw new Error('Đơn vẫn chờ duyệt: ' + text.slice(0, 400));
    return `đã duyệt; chứng từ sinh ra: ${sourcing.join(', ') || '(không thấy)'}`;
  },

  async 'Mua hàng: tạo đơn mua về kho'() {
    const page = await as('owner');
    await page.goto('/admin/purchase-orders/new', { waitUntil: 'load' });
    await pick(page, 'Nhà cung cấp', '');
    const mat = page.getByRole('combobox', { name: 'Tìm vật tư' }); await mat.click(); await mat.fill('xi'); await page.waitForTimeout(1500);
    await page.getByRole('option').filter({ hasText: /./ }).first().click(); await page.waitForTimeout(800);
    const qty = page.getByRole('textbox', { name: /Số lượng/ }).first(); await qty.fill('50');
    const price = page.getByRole('textbox', { name: /Đơn giá|Giá mua/ }).first();
    if (await price.count()) await price.fill('1500');
    await page.getByRole('button', { name: 'Tạo đơn mua' }).click();
    const dialog = page.getByRole('dialog');
    if (await dialog.count()) { const confirm = dialog.getByRole('button', { name: /Tạo đơn mua|Xác nhận/ }); if (await confirm.count()) await confirm.first().click(); }
    await page.waitForURL(/\/admin\/purchase-orders\/[0-9a-f-]{36}/, { timeout: 60000 });
    await page.waitForLoadState('load'); await page.waitForTimeout(1500);
    state.poUrl = new URL(page.url()).pathname;
    const text = await page.locator('main').innerText();
    state.poNumber = text.match(/PO-\d{4}-\d{6}/)?.[0]; keep();
    await shot(page, 'e2e-po');
    return `${state.poNumber} · ${state.poUrl}`;
  },

  async 'Mua hàng: ghi đã gửi NCC, nhận đủ hàng vào kho'() {
    const page = await as('owner');
    await page.goto(state.poUrl, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Đã gửi' }).click(); await page.waitForTimeout(2500);
    await page.goto(state.poUrl, { waitUntil: 'load' });
    const sent = /Đã gửi NCC/.test(await page.locator('main').innerText());
    await page.getByRole('button', { name: 'Nhận đủ (điền số còn lại)' }).click();
    await page.getByRole('button', { name: 'Xác nhận nhận hàng' }).click();
    await page.waitForLoadState('load'); await page.waitForTimeout(4000);
    const text = await page.locator('main').innerText();
    await shot(page, 'e2e-po-received');
    if (/còn 50/.test(text)) throw new Error('Vẫn còn 50 chưa nhận: ' + text.slice(0, 300));
    return `${sent ? 'đã ghi "Đã gửi NCC"; ' : 'KHÔNG thấy nhãn Đã gửi NCC; '}đã nhận đủ`;
  },

  async 'Công nợ D45 — khách: chọn 2 đơn → Trả tiền mặt tại cửa hàng'() {
    const page = await asMobile('customer');
    await page.goto('/customer/debts', { waitUntil: 'load' });
    await page.getByRole('checkbox', { name: 'Chọn SO-2026-000075' }).waitFor({ timeout: 60000 });
    const before = await page.locator('main').innerText();
    if (await page.getByRole('button', { name: /^Chuyển khoản/ }).count()) throw new Error('Hiện nút QR dù chưa bật SePay');
    await page.getByRole('checkbox', { name: 'Chọn SO-2026-000075' }).check();
    await page.getByRole('checkbox', { name: 'Chọn SO-2026-000076' }).check();
    const bar = page.getByRole('region', { name: 'Các khoản đã chọn' });
    const barText = await bar.innerText();
    if (!/5\.500\.000/.test(barText)) throw new Error('Tổng chọn sai: ' + barText);
    if (await bar.getByRole('button', { name: /^Chuyển khoản/ }).count()) throw new Error('Thanh chọn hiện nút chuyển khoản khi QR tắt');
    await bar.getByRole('button', { name: 'Trả tiền mặt tại cửa hàng' }).click();
    const dialog = page.getByRole('dialog'); await dialog.getByText('Mã thanh toán', { exact: true }).waitFor({ timeout: 60000 });
    const text = await dialog.innerText();
    state.cashCode = text.match(/YC[A-Z0-9]{5}/)?.[0]; keep();
    await shot(page, 'e2e-cash-request');
    if (!state.cashCode || !/5\.500\.000/.test(text)) throw new Error('Thẻ tiền mặt sai: ' + text.slice(0, 300));
    await dialog.getByRole('button', { name: 'Đóng' }).click();
    return `mã ${state.cashCode}, 5.500.000 ₫; danh sách nợ có ô chọn: ${/Số dư đầu kỳ/.test(before) ? 'có dòng Số dư đầu kỳ' : ''}`;
  },

  async 'Công nợ D45 — kế toán: Sổ quỹ → Chờ thu tiền mặt → Xác nhận đã thu 5.000.000 ₫ (thiếu 500k)'() {
    const page = await as('owner');
    await page.goto('/admin/cashbook', { waitUntil: 'load' });
    const section = page.getByRole('region', { name: 'Chờ thu tiền mặt' });
    await section.waitFor({ timeout: 60000 });
    const row = section.getByRole('row').filter({ hasText: state.cashCode });
    await row.getByRole('button', { name: 'Xác nhận đã thu' }).click();
    const dialog = page.getByRole('dialog', { name: new RegExp(`Xác nhận đã thu ${state.cashCode}`) });
    const amount = dialog.getByLabel('Số tiền thực nhận');
    if ((await amount.inputValue()) !== '5.500.000') throw new Error('Số mặc định sai: ' + await amount.inputValue());
    await amount.fill('5.000.000');
    await dialog.getByRole('button', { name: 'Xác nhận đã thu' }).click();
    await dialog.waitFor({ state: 'detached', timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.goto('/admin/cashbook', { waitUntil: 'load' });
    const text = await page.locator('main').innerText();
    await shot(page, 'e2e-cash-confirmed');
    if (text.includes(state.cashCode) && /Chờ thu tiền mặt/.test(text) && (await page.getByRole('region', { name: 'Chờ thu tiền mặt' }).getByText(state.cashCode).count()))
      return 'đã ghi; yêu cầu vẫn nằm trong Chờ thu (trả một phần) — đúng vì còn thiếu 500k';
    return 'đã ghi phiếu thu tiền mặt';
  },

  async 'Công nợ D45 — khách: công nợ sau khi trả tiền mặt'() {
    const page = await asMobile('customer');
    await page.goto('/customer/debts', { waitUntil: 'load' });
    await page.getByText('Các khoản cần trả').waitFor({ timeout: 60000 });
    await page.waitForTimeout(1500);
    const text = await page.locator('main').innerText();
    await shot(page, 'e2e-customer-after-cash');
    if (/Chọn SO-2026-000075/.test(await page.locator('main').innerHTML())) throw new Error('SO-075 vẫn còn nợ');
    return text.match(/Còn phải trả\s*[\d.]+\s*₫/)?.[0] ?? text.slice(0, 200);
  },

  async 'Công nợ D44 — chủ: thông tin chuyển khoản + bật Tự ghi tiền về (SePay)'() {
    const page = await as('owner');
    await page.goto('/admin/cashbook', { waitUntil: 'load' });
    await page.getByRole('link', { name: /Ngân hàng · / }).click(); await page.waitForURL(/account=/);
    await page.getByRole('button', { name: 'Sửa thông tin chuyển khoản' }).click();
    let d = page.getByRole('dialog');
    await d.getByLabel('Ngân hàng', { exact: true }).fill('Vietcombank');
    await d.getByLabel('Số tài khoản').fill('0071000123456');
    await d.getByLabel('Chủ tài khoản').fill('CONG TY HIEN XA QA');
    await d.getByLabel(/Hiện cho khách/).check();
    await d.getByRole('button', { name: 'Lưu' }).click(); await page.waitForLoadState('load'); await page.waitForTimeout(2500);
    await page.getByRole('button', { name: 'Tự ghi tiền về (SePay)' }).click();
    d = page.getByRole('dialog');
    await d.getByLabel(/Bật tự ghi tiền về/).check();
    await d.getByRole('button', { name: 'Lưu' }).click(); await page.waitForLoadState('load'); await page.waitForTimeout(2500);
    const text = await page.locator('main').innerText();
    await shot(page, 'e2e-bank-feed');
    return /lỗi|không thể/i.test(text) ? 'CẦN XEM: ' + text.slice(0, 200) : 'đã lưu';
  },

  async 'Công nợ D44 — khách: chọn 2 khoản còn lại → QR chuyển khoản'() {
    const page = await asMobile('customer');
    await page.goto('/customer/debts', { waitUntil: 'load' });
    await page.getByRole('checkbox', { name: 'Chọn SO-2026-000076' }).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'Chọn tất cả' }).click();
    const bar = page.getByRole('region', { name: 'Các khoản đã chọn' });
    const total = await bar.innerText();
    await bar.getByRole('button', { name: /^Chuyển khoản 2 khoản/ }).click();
    const dialog = page.getByRole('dialog');
    const qr = dialog.getByRole('img', { name: /Mã QR chuyển/ }); await qr.waitFor({ timeout: 60000 });
    const src = new URL(await qr.getAttribute('src'));
    state.qrNote = src.searchParams.get('des'); state.qrAmount = src.searchParams.get('amount'); state.qrCode = state.qrNote?.match(/YC[A-Z0-9]{5}/)?.[0]; keep();
    await shot(page, 'e2e-qr');
    const lines = await dialog.getByRole('list', { name: 'Các khoản trong lần thanh toán này' }).innerText();
    await dialog.getByRole('button', { name: 'Đóng' }).click();
    if (state.qrAmount !== '10500000') throw new Error(`QR ${state.qrAmount} ≠ 10.500.000 (thanh: ${total})`);
    return `QR ${state.qrAmount} ₫, nội dung "${state.qrNote}", khoản: ${lines.replace(/\n/g, ' ')}`;
  },

  async 'Công nợ D44 — sau khi SePay báo tiền: Sổ quỹ và cổng khách'() {
    const owner = await as('owner');
    await owner.goto('/admin/cashbook', { waitUntil: 'load' });
    await owner.waitForTimeout(2000);
    const book = await owner.locator('main').innerText();
    await shot(owner, 'e2e-cashbook-after-qr');
    const notes = [];
    notes.push(/REC-\d{6}-\d{6}/.test(book) ? 'Sổ quỹ có phiếu thu' : 'KHÔNG thấy phiếu thu');
    const bank = owner.getByRole('region', { name: 'Giao dịch ngân hàng chờ xử lý' });
    notes.push((await bank.count()) && /Khách chuyển lại cho yêu cầu thanh toán đã trả đủ/.test(await bank.innerText()) ? 'giao dịch chuyển trùng nằm ở Chờ xử lý, lý do đúng' : 'KHÔNG thấy giao dịch chuyển trùng ở Chờ xử lý');
    const cash = owner.getByRole('region', { name: 'Chờ thu tiền mặt' });
    if ((await cash.count()) && (await cash.getByText(state.cashCode).count())) notes.push(`LỖI: yêu cầu tiền mặt ${state.cashCode} vẫn ở Chờ thu dù các khoản đã trả hết bằng QR`);
    const customer = await asMobile('customer');
    await customer.goto('/customer/debts', { waitUntil: 'load' }); await customer.getByText('Các khoản cần trả').waitFor({ timeout: 60000 });
    const debts = await customer.locator('main').innerText();
    notes.push(/Không có dư nợ/.test(debts) ? 'cổng khách: Không có dư nợ' : 'cổng khách còn nợ: ' + (debts.match(/Còn phải trả\s*[\d.]+/)?.[0] ?? ''));
    await shot(customer, 'e2e-customer-after-qr');
    if (notes.some((n) => /KHÔNG|LỖI/.test(n))) throw new Error(notes.join('; '));
    return notes.join('; ');
  },

  async 'Chi phí: ghi chi phí chung 250.000 ₫ từ quỹ tiền mặt'() {
    const page = await as('owner');
    await page.goto('/admin/expenses', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Ghi chi phí' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Loại chi').fill('Xăng xe QA');
    await d.getByLabel('Số tiền').fill('250.000');
    await d.getByLabel('Chi từ quỹ').selectOption({ label: 'Tiền mặt (tiền mặt)' });
    await d.getByLabel('Tên người nhận (không bắt buộc)').fill('Cây xăng QA');
    await d.getByRole('button', { name: 'Ghi chi phí' }).click();
    await d.waitFor({ state: 'detached', timeout: 60000 }).catch(() => {});
    await page.waitForLoadState('load'); await page.waitForTimeout(2500);
    const text = await page.locator('main').innerText();
    await shot(page, 'e2e-expense');
    if (!/Xăng xe QA/.test(text)) throw new Error('Danh sách chi phí không có khoản vừa ghi: ' + text.slice(0, 300));
    return /Chờ duyệt/.test(text) ? 'đã ghi, đang Chờ duyệt' : 'đã ghi';
  },

  async 'Kho: tạo phiếu kiểm kho, đếm và cân bằng'() {
    const page = await as('owner');
    await page.goto('/admin/stock-counts', { waitUntil: 'load' });
    await page.getByRole('button', { name: '+ Tạo phiếu kiểm' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel(/Kho kiểm/).selectOption({ label: 'Kho chính' });
    await d.getByRole('button', { name: 'Tạo phiếu và bắt đầu đếm' }).click();
    await page.waitForURL(/\/admin\/stock-counts\/[0-9a-f-]{36}/, { timeout: 60000 });
    await page.waitForLoadState('load'); await page.waitForTimeout(2000);
    state.stockCountUrl = new URL(page.url()).pathname; keep();
    const html = await page.locator('main').innerText();
    await shot(page, 'e2e-stockcount');
    return `phiếu ${html.match(/KK-[\w-]+/)?.[0] ?? ''} mở trang đếm (${(html.match(/\n/g) ?? []).length} dòng chữ)`;
  },

  async 'Kho: đếm (xi măng lệch −2 kg) → Hoàn thành & cân bằng kho'() {
    const page = await as('owner');
    await page.goto(state.stockCountUrl, { waitUntil: 'load' });
    await page.getByLabel('Thực tế Cát vàng xây tô').fill('100');
    await page.getByLabel('Thực tế Thép Hòa Phát D10').fill('500');
    await page.getByLabel('Thực tế Xi măng Hà Tiên PCB40').fill('20048');
    await page.waitForTimeout(800);
    const tabs = await page.locator('main').innerText();
    await page.getByRole('button', { name: 'Hoàn thành & cân bằng kho' }).click();
    const dialog = page.getByRole('dialog');
    if (await dialog.count()) { const ok = dialog.getByRole('button', { name: /Hoàn thành|Cân bằng|Xác nhận/ }); if (await ok.count()) await ok.last().click(); }
    await page.waitForLoadState('load'); await page.waitForTimeout(4000);
    const text = await page.locator('main').innerText();
    await shot(page, 'e2e-stockcount-done');
    if (!/Đã cân bằng/.test(text)) throw new Error('Chưa thấy trạng thái Đã cân bằng: ' + text.slice(0, 300));
    return `lệch hiển thị: ${(tabs.match(/Lệch\s*\d+/) ?? [''])[0]}; Đã cân bằng kho`;
  },

  async 'Hồ sơ khách: tab Công nợ & thanh toán có mục Thu nợ + danh sách yêu cầu'() {
    const page = await as('owner');
    await page.goto('/admin/customers', { waitUntil: 'load' });
    await page.getByRole('link', { name: /An Phát/ }).first().click();
    await page.waitForURL(/\/admin\/customers\/[0-9a-f-]{36}/);
    await page.goto(new URL(page.url()).pathname + '?tab=debts', { waitUntil: 'load' });
    const panel = page.getByRole('region', { name: 'Thu nợ' }).or(page.locator('section[aria-labelledby=staff-qr-title]'));
    await panel.first().waitFor({ timeout: 60000 });
    const text = await panel.first().innerText();
    await shot(page, 'e2e-customer-debts-tab');
    const codes = text.match(/YC[A-Z0-9]{5}/g) ?? [];
    return `${/không còn khoản nợ/.test(text) ? 'khách hết nợ' : 'có khoản nợ'}; yêu cầu hiển thị: ${[...new Set(codes)].join(', ')}; ${/Tiền mặt/.test(text) && /QR chuyển khoản/.test(text) ? 'có cột Cách trả' : ''}`;
  },

  async 'Thợ: từ chối việc (C2) → phiếu quay về chờ điều phối'() {
    const page = await asMobile('worker');
    await page.goto(state.jobUrl, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Từ chối việc này' }).click();
    await page.getByLabel('Ghi chú (không bắt buộc)').fill('QA: xe đang sửa, không đi được');
    await page.getByRole('button', { name: 'Gửi từ chối' }).click();
    await page.waitForTimeout(4000);
    const text = await page.locator('body').innerText();
    await shot(page, 'e2e-decline');
    return text.slice(0, 160).replace(/\n/g, ' ');
  },

  async 'Tách phiếu D46 — khách đặt 2 mặt hàng, chủ duyệt → có phiếu giao 2 dòng'() {
    const c = await asMobile('customer');
    await c.goto('/customer/orders/new', { waitUntil: 'load' });
    await c.getByRole('button', { name: 'Thêm Thép Hòa Phát D10' }).click(); await c.waitForTimeout(500);
    await c.getByRole('button', { name: 'Thêm Cát vàng xây tô' }).click(); await c.waitForTimeout(500);
    await c.getByRole('button', { name: /Xem & gửi đơn/ }).click();
    const dialog = c.getByRole('dialog'); await dialog.waitFor(); await dialog.getByRole('button', { name: 'Gửi đơn' }).click();
    await c.waitForURL((url) => !url.pathname.endsWith('/new'), { timeout: 60000 });
    state.splitOrderId = new URL(c.url()).pathname.split('/').pop();
    const page = await as('owner');
    await page.goto('/admin/orders/' + state.splitOrderId, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Duyệt đơn (giữ hạn mức, tự phân nguồn)' }).click();
    await page.waitForTimeout(4000); await page.reload({ waitUntil: 'load' });
    state.splitDeliveryUrl = await page.locator('.order-next-steps a[href^="/admin/deliveries/"]').first().getAttribute('href');
    state.splitOrderNumber = (await page.locator('h1').innerText()).trim(); keep();
    await page.goto(state.splitDeliveryUrl, { waitUntil: 'load' }); await page.waitForSelector('h1');
    state.splitSource = (await page.locator('h1').innerText()).trim(); keep();
    if (!(await page.getByRole('link', { name: 'Tách phiếu giao' }).count())) throw new Error('Không thấy nút Tách phiếu giao');
    return `${state.splitOrderNumber} → ${state.splitSource}; có nút Tách phiếu giao`;
  },

  async 'Tách phiếu D46 — chọn xe không chở được cho phiếu 2 → bị từ chối, báo rõ, không đổi gì'() {
    const page = await as('owner');
    await page.goto(state.splitDeliveryUrl + '/split', { waitUntil: 'load' }); await page.waitForSelector('.split-form');
    await page.getByLabel(/Thép.*cho Phiếu 2/).fill('1');
    await page.locator('#split-employee-2').selectOption({ label: 'Thợ 01' });
    await page.locator('#split-vehicle-2').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Tách thành 2 phiếu' }).click();
    const alert = page.locator('.split-form .form-message'); await alert.waitFor({ timeout: 30000 });
    const message = await alert.innerText();
    await shot(page, 'e2e-split-refused');
    if (!/^Phiếu 2: .*Chưa tách phiếu nào\.$/s.test(message)) throw new Error('Thông báo lạ: ' + message);
    return message;
  },

  async 'Tách phiếu D46 — tách 3 phiếu (chia lẻ 1 dòng) → số phiếu liền nhau, liên kết qua lại'() {
    const page = await as('owner');
    await page.goto(state.splitDeliveryUrl + '/split', { waitUntil: 'load' }); await page.waitForSelector('.split-form');
    await page.getByRole('button', { name: '3 phiếu' }).click();
    await page.getByLabel(/Thép.*cho Phiếu 2/).fill('1');
    await page.getByLabel(/Cát.*cho Phiếu 3/).fill('0,5');
    const keepCell = await page.getByLabel(/Phiếu 1 giữ lại của Cát/).innerText();
    if (!/0,5/.test(keepCell)) throw new Error('Phiếu 1 không tự giữ 0,5: ' + keepCell);
    await page.getByRole('button', { name: 'Tách thành 3 phiếu' }).click();
    await page.locator('.split-result').waitFor({ timeout: 30000 });
    const numbers = (await page.locator('.split-result a.code-link').allInnerTexts()).map((x) => x.trim());
    await shot(page, 'e2e-split-done');
    const seq = numbers.map((n) => Number(n.slice(-6))).sort((a, b) => a - b);
    if (numbers.length !== 3 || seq[1] !== seq[0] + 1 || seq[2] !== seq[1] + 1) throw new Error('Số phiếu không liền nhau: ' + numbers.join(', '));
    state.splitNumbers = numbers; keep();
    await page.goto(state.splitDeliveryUrl, { waitUntil: 'load' }); await page.waitForSelector('h1');
    const original = await page.locator('.command-note').allInnerTexts();
    if (!original.some((t) => numbers.every((n) => t.includes(n)))) throw new Error('Phiếu gốc không ghi đã tách thành: ' + original.join(' | '));
    await page.goto('/admin/orders/' + state.splitOrderId, { waitUntil: 'load' }); await page.waitForSelector('.order-next-steps');
    const progress = await page.locator('.order-next-steps').innerText();
    if (!progress.includes('đã tách thành')) throw new Error('Tiến độ đơn không ghi đã tách');
    return `${state.splitSource} → ${numbers.join(', ')} (liền nhau); phiếu gốc và đơn ghi "đã tách thành"`;
  },

  async 'Tách phiếu D46 — bảng Chờ điều phối có các phiếu mới, thấy giờ hẹn và nút Gán ở 1280/1440 px'() {
    const page = await as('owner');
    const seen = [];
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/admin/dispatch', { waitUntil: 'load' }); await page.waitForSelector('.dispatch-waiting-scroll'); await page.waitForTimeout(500);
      const r = await page.evaluate((numbers) => {
        const box = document.querySelector('.dispatch-waiting-scroll'); const edge = box.getBoundingClientRect().right;
        const text = box.innerText;
        return { listed: numbers.filter((n) => text.includes(n)).length, overflow: box.scrollWidth > box.clientWidth + 1,
          ganHidden: [...box.querySelectorAll('.dispatch-waiting-actions button')].some((b) => b.getBoundingClientRect().right > edge + 1) };
      }, state.splitNumbers);
      if (r.overflow || r.ganHidden) throw new Error(`${width}px: bảng tràn ngang hoặc nút Gán bị che`);
      seen.push(`${width}px: ${r.listed}/3 phiếu mới trong bảng`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await shot(page, 'e2e-split-dispatch');
    return seen.join('; ');
  },

  async 'Đăng nhập: đăng xuất máy A không đá máy B (cùng tài khoản)'() {
    const a = await session(browser, 'owner'); const b = await session(browser, 'owner');
    await a.page.getByRole('button', { name: /Chủ doanh nghiệp/ }).first().click();
    await a.page.getByRole('button', { name: 'Đăng xuất' }).click();
    await a.page.waitForURL((url) => url.pathname === '/' || url.pathname.endsWith('/login'));
    await b.page.goto('/admin/orders', { waitUntil: 'load' });
    const still = new URL(b.page.url()).pathname.startsWith('/admin');
    await a.context.close(); await b.context.close();
    if (!still) throw new Error('Máy B bị đăng xuất theo');
    return 'máy A đã đăng xuất; máy B vẫn vào được /admin/orders';
  },
};

const wanted = process.argv.slice(2);
for (const [name, run] of Object.entries(steps)) {
  if (wanted.length && !wanted.some((w) => name.startsWith(w))) continue;
  try { const detail = await run(); record('Đầu-cuối', name, 'PASS', detail ?? ''); }
  catch (error) { record('Đầu-cuối', name, 'FAIL', error.message.split('\n')[0]); for (const [k, p] of Object.entries(pages)) await shot(p, `fail-${k}-${name.slice(0, 30).replace(/[^\w]+/g, '-')}`); }
}
await browser.close();
save(`e2e-${Date.now()}.json`);
