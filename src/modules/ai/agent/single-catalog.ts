// D65: one new supplier / material prepared by the assistant. The card opens the real catalog form ("Thêm nhà cung cấp",
// "Thêm vật tư") pre-filled; "Xác nhận" still saves it at once through the same command as the list cards.
import { createMaterials, createSuppliers, type MaterialRow, type SupplierRow } from "./batch-catalog";
import type { AgentAction } from "./registry";

const str = (description: string) => ({ type: "string", description });
const tick = (value: boolean) => (value ? "true" : "");

export const createSupplier: AgentAction = {
  kind: "soan_tao_nha_cung_cap", area: "Mua hàng & kho", permissions: ["suppliers.manage"],
  description: "Soạn tạo MỘT nhà cung cấp mới (người dùng bấm \"Xem và sửa\" để mở form thêm nhà cung cấp đã điền sẵn). Nhiều nhà cung cấp một lần thì dùng soan_tao_nhieu_nha_cung_cap.",
  properties: { ten: str("Tên nhà cung cấp."), ma: str("Mã nếu có; trống = tự đặt."), dien_thoai: str("Điện thoại; có thể trống."), dia_chi: str("Địa chỉ; có thể trống."),
    email: str("Email; có thể trống."), ma_so_thue: str("Mã số thuế; có thể trống."), han_thanh_toan: str("Số ngày được nợ, ví dụ 30; trống = 0.") },
  async prepare(context, input) {
    const prepared = await createSuppliers.prepare(context, { nha_cung_cap: [input] });
    const row = (prepared.payload.rows as SupplierRow[])[0];
    return { title: `Tạo nhà cung cấp ${row.name}`, payload: { rows: [row] },
      summary: [{ label: "Mã", value: row.code }, ...(row.phone ? [{ label: "Điện thoại", value: row.phone }] : []), ...(row.address ? [{ label: "Địa chỉ", value: row.address }] : []),
        { label: "Hạn thanh toán", value: `${row.days} ngày` }] };
  },
  execute: (context, payload, actionId) => createSuppliers.execute(context, payload, actionId),
  catalog: { kind: "suppliers", initial: (payload): Record<string, string> => {
    const row = (payload.rows as SupplierRow[] | undefined)?.[0];
    return row ? { code: row.code, name: row.name, phone: row.phone, email: row.email, address_text: row.address, tax_code: row.taxCode, payment_terms_days: row.days } : {};
  } },
};

export const createMaterial: AgentAction = {
  kind: "soan_tao_vat_tu", area: "Mua hàng & kho", permissions: ["catalog.manage"],
  description: "Soạn tạo MỘT vật tư mới (người dùng bấm \"Xem và sửa\" để mở form thêm vật tư đã điền sẵn). Cần tên, nhóm vật tư và đơn vị gốc có sẵn. Nhiều vật tư một lần thì dùng soan_tao_nhieu_vat_tu.",
  properties: { ten: str("Tên vật tư."), ma: str("Mã nếu có; trống = tự đặt."), nhom: str("Nhóm vật tư (mã hoặc tên)."), don_vi: str("Đơn vị gốc (bao, kg, m³, cây…)."),
    quy_cach: str("Quy cách; có thể trống."), ban: { type: "boolean", description: "Cho phép bán." }, mua: { type: "boolean", description: "Cho phép mua." } },
  async prepare(context, input) {
    const prepared = await createMaterials.prepare(context, { vat_tu: [input] });
    const row = (prepared.payload.rows as MaterialRow[])[0];
    return { title: `Tạo vật tư ${row.name}`, payload: { rows: [row], supplierId: null },
      summary: [{ label: "Mã", value: row.code }, { label: "Nhóm", value: row.groupName }, { label: "Đơn vị gốc", value: row.uomSymbol }, { label: "Cho phép", value: [row.sale ? "bán" : "", row.purchase ? "mua" : ""].filter(Boolean).join(" và ") }] };
  },
  execute: (context, payload, actionId) => createMaterials.execute(context, payload, actionId),
  catalog: { kind: "materials", initial: (payload): Record<string, string> => {
    const row = (payload.rows as MaterialRow[] | undefined)?.[0];
    return row ? { code: row.code, name: row.name, group_id: row.groupId, base_uom_id: row.uomId, specification: row.specification, sale_enabled: tick(row.sale), purchase_enabled: tick(row.purchase) } : {};
  } },
};
