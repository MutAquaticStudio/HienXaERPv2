import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vitest/package.json'));
const { createServer } = await import(viteRequire.resolve('vite'));
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const server = await createServer({ configFile: false, resolve: { alias: { '@': path.join(root, 'src') } }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { createBusinessDocument } = await server.ssrLoadModule('/src/lib/pdf/business-document.ts');
  const { salesDocumentData, purchaseDocumentData, deliveryDocumentData } = await server.ssrLoadModule('/src/lib/pdf/document-data.ts');
  const { createStandardPdf } = await server.ssrLoadModule('/src/lib/pdf/standard-document.ts');
  const meta = { branch: 'Hiền Xa - mẫu minh họa', generatedAt: '14/10/2026 09:00', sample: true };
  const sales = { id: 'MẪU-SO-KHÔNG-GHI-SỔ', order_number: 'SO-MAU', commercial_state: 'DRAFT', customer_name_snapshot: 'Khách hàng minh họa', site_name_snapshot: 'Công trình minh họa', delivery_address_snapshot: 'Địa chỉ công trình đã lưu trên chứng từ', created_at: '2026-10-14T02:00:00Z', requested_delivery_at: '2026-10-15T02:00:00Z', receiver_name_snapshot: null, receiver_phone_snapshot: null, total_vnd: '3450000', commercial_terms: 'Giao hàng theo lịch đã thống nhất.\nThanh toán theo thỏa thuận ghi trên đơn; không tự ghi nhận đã thu tiền.', draft_version: 1 };
  const lines = [{ line_number: 1, material_name_snapshot: 'Xi măng - quy cách theo đơn đã lưu', ordered_uom_id: 'uom', quantity: '15', unit_price_vnd: '230000', line_total_vnd: '3450000', unit_cost_vnd: '150000', line_total_cost_vnd: '2100000' }];
  const po = { id: 'MẪU-PO-KHÔNG-GHI-SỔ', purchase_order_number: 'PO-MAU', state: 'CONFIRMED', supplier_name_snapshot: 'Nhà cung cấp minh họa', supplier_address_snapshot: 'Địa chỉ nhà cung cấp đã lưu', destination_type: 'CUSTOMER_SITE', destination_name_snapshot: 'Công trình minh họa', destination_address_snapshot: sales.delivery_address_snapshot, created_at: sales.created_at, expected_at: sales.requested_delivery_at, total_cost_vnd: '2100000', commercial_terms: 'Nhà cung cấp giao thẳng đến công trình.\nLượng nhận thực tế và thanh toán được ghi nhận riêng khi phát sinh.', draft_version: 1 };
  const dl = { ...sales, id: 'MẪU-DL-KHÔNG-GHI-SỔ', delivery_number: 'DL-MAU', execution_state: 'VERIFIED', result_kind: 'PARTIAL', reported_result_kind: 'FULL', reported_receiver_name: 'Người nhận minh họa', result_note: null, scheduled_at: sales.requested_delivery_at, verified_at: '2026-10-15T04:00:00Z' };
  const dlLines = [{ id: 'line', material_name_snapshot: 'Xi măng - quy cách theo đơn đã lưu', source_mode: 'WAREHOUSE', base_uom_symbol: 'TẤN', planned_base_quantity: '15', loaded_base_quantity: '14', actual_base_quantity: '14', accepted_base_quantity: '13', billable_base_quantity: '13' }];
  const symbols = new Map([['uom', 'TẤN']]);
  const inputs = { 'SO-A4': salesDocumentData(sales, lines, symbols, meta), 'PO-A4': purchaseDocumentData(po, [{ ...lines[0], quantity: '14' }], symbols, true, meta), 'Phieu-giao-A4': deliveryDocumentData(dl, dlLines, meta) };
  await mkdir('output/pdf', { recursive: true });
  await mkdir('reports/document-pdf-forms/visual', { recursive: true });
  for (const [name, input] of Object.entries(inputs)) await writeFile(`output/pdf/${name}.pdf`, await createBusinessDocument(input));
  const long = { ...inputs['SO-A4'], reference: 'SO-MAU-NHIEU-TRANG', fields: inputs['SO-A4'].fields.map((f, i) => i === 2 ? { ...f, value: 'Địa chỉ dài có tiếng Việt, phường xã và thông tin giao hàng. '.repeat(7) } : f), rows: Array.from({ length: 36 }, (_, i) => ({ ...inputs['SO-A4'].rows[0], number: String(i + 1), material: 'Vật tư có quy cách và ghi chú dài, dòng cuối cần được giữ đầy đủ ' + (i === 35 ? 'MÃ-DÀI-' + '1234567890'.repeat(35) : '') })), totals: [{ label: 'Tổng giá trị đơn bán', value: '124.200.000 ₫' }], notes: [{ title: 'Điều khoản / ghi chú', text: 'Điều khoản dài để kiểm tra xuống trang.\n'.repeat(15) }] };
  await writeFile('reports/document-pdf-forms/visual/SO-many-pages.pdf', await createBusinessDocument(long));
  await writeFile('reports/document-pdf-forms/visual/PO-no-price.pdf', await createBusinessDocument(purchaseDocumentData(po, lines, symbols, false, meta)));
  await writeFile('reports/document-pdf-forms/visual/delivery-before.pdf', await createStandardPdf({ title: 'PHIẾU GIAO HÀNG', reference: 'DL-MAU - MẪU MINH HỌA', subtitle: 'Đã xác minh / Đủ', fields: inputs['Phieu-giao-A4'].fields.slice(0, 6), columns: [{ label: 'Vật tư', key: 'material', width: 174 }, { label: 'Nguồn', key: 'source', width: 88 }, { label: 'Kế hoạch', key: 'planned', width: 83 }, { label: 'Thực tế', key: 'actual', width: 83 }, { label: 'Khách nhận', key: 'accepted', width: 83 }], rows: [{ material: dlLines[0].material_name_snapshot, source: 'Từ kho', planned: '15 TẤN', actual: '14 TẤN', accepted: '13 TẤN' }], trace: 'Mẫu minh họa - không ghi sổ', disclaimer: 'Phiếu giao hàng - không phải hóa đơn thuế.' }));
  console.log(JSON.stringify({ status: 'GENERATED_3_A4_SAMPLES_AND_LAYOUT_VARIANTS', synthetic: true, databaseWrites: false }));
} finally { await server.close(); }
