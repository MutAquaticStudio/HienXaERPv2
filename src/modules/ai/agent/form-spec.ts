// D65: the form a prepared card opens ("Xem và sửa"). Catalog records (customers, suppliers, materials) open the real
// catalog form; every other action gets a form drawn from the tool's own input description, with Vietnamese labels. The
// person's edited values go back through the action's own `prepare`, so every check of the assistant still applies.

export type FormFieldKind = "text" | "textarea" | "date" | "money" | "select" | "checkbox" | "lines";
export type FormField = {
  key: string; label: string; kind: FormFieldKind; help?: string;
  options?: { value: string; label: string }[];
  /** For "lines": the columns of one line (text fields). */
  columns?: FormField[];
  /** For "lines": the label of the "add a line" button. */
  addLabel?: string;
};
export type FormSpec = { fields: FormField[]; values: Record<string, unknown> };

/** Hints per action: the labels the person reads, and which keys are dates, money or long text. */
export type FormHints = {
  labels: Record<string, string>;
  optionLabels?: Record<string, Record<string, string>>;
  dates?: string[]; money?: string[]; multiline?: string[];
  lineLabels?: Record<string, string>;
  /** The label of the "add a line" button, e.g. "Thêm dòng hàng". */
  addLine?: string;
};

const LINE_LABELS = { hang: "Hàng", don_vi: "Đơn vị", so_luong: "Số lượng" };
const goods: Pick<FormHints, "lineLabels" | "addLine"> = { lineLabels: LINE_LABELS, addLine: "Thêm dòng hàng" };

export const FORM_HINTS: Record<string, FormHints> = {
  soan_don_ban: { labels: { khach_hang: "Khách hàng", cong_trinh: "Công trình", ngay_giao: "Ngày giao", dong_hang: "Hàng bán", xac_nhan: "Xác nhận đơn và tự phân nguồn luôn", ghi_chu: "Ghi chú đơn", nv_ban: "Nhân viên bán hàng" },
    dates: ["ngay_giao"], multiline: ["ghi_chu"], ...goods },
  soan_phieu_giao: { labels: { ma_don: "Mã đơn bán", kho: "Kho xuất" } },
  soan_gan_phieu_giao: { labels: { ma_phieu: "Mã phiếu giao", nguoi_giao: "Người giao", xe: "Xe", don_vi_ngoai: "Đơn vị vận chuyển ngoài", sdt_don_vi_ngoai: "Điện thoại đơn vị ngoài", ngay: "Ngày giao", gio_bat_dau: "Từ giờ", gio_ket_thuc: "Đến giờ" }, dates: ["ngay"] },
  soan_don_mua: { labels: { nha_cung_cap: "Nhà cung cấp", kho: "Kho nhận", ngay_nhan: "Ngày nhận dự kiến", dong_hang: "Hàng mua" }, dates: ["ngay_nhan"], ...goods },
  soan_chuyen_kho: { labels: { tu_kho: "Từ kho", den_kho: "Đến kho", dong_hang: "Hàng chuyển", xuat_ngay: "Xuất kho ngay" }, ...goods },
  soan_thu_tien: { labels: { khach_hang: "Khách hàng", so_tien: "Số tiền (₫)", quy: "Vào quỹ", phuong_thuc: "Hình thức", tham_chieu: "Nội dung / mã giao dịch" }, money: ["so_tien"],
    optionLabels: { phuong_thuc: { CASH: "Tiền mặt", BANK_TRANSFER: "Chuyển khoản" } } },
  soan_chi_phi: { labels: { loai_chi: "Loại chi", so_tien: "Số tiền (₫)", nguoi_nhan: "Người / nơi nhận", quy: "Chi từ quỹ", ghi_chu: "Ghi chú" }, money: ["so_tien"], multiline: ["ghi_chu"] },
  soan_cham_cong: { labels: { nhan_vien: "Nhân viên", ngay: "Ngày", trang_thai: "Trạng thái", gio_vao: "Giờ vào (HH:MM)", gio_ra: "Giờ ra (HH:MM)" }, dates: ["ngay"],
    optionLabels: { trang_thai: { WORKED: "Đi làm", LEAVE_PAID: "Nghỉ có phép", LEAVE_UNPAID: "Nghỉ không phép", ABSENT: "Vắng" } } },
  soan_cong_tru_luong: { labels: { nhan_vien: "Nhân viên", cong: "Cộng (thưởng, ₫)", tru: "Trừ (tạm ứng…, ₫)", ghi_chu: "Lý do" }, money: ["cong", "tru"], multiline: ["ghi_chu"] },
  soan_nhan_tin: { labels: { nguoi_nhan: "Người nhận", noi_dung: "Nội dung" }, multiline: ["noi_dung"] },
};

type Property = { type?: string; description?: string; enum?: string[]; items?: { properties?: Record<string, Property> } };

function fieldOf(key: string, property: Property, hints: FormHints, labels: Record<string, string>): FormField {
  const label = labels[key] ?? key;
  const help = property.description;
  if (property.type === "boolean") return { key, label, kind: "checkbox" };
  if (property.enum) return { key, label, kind: "select", help, options: [{ value: "", label: "—" }, ...property.enum.map((value) => ({ value, label: hints.optionLabels?.[key]?.[value] ?? value }))] };
  if (hints.dates?.includes(key)) return { key, label, kind: "date", help };
  if (hints.money?.includes(key)) return { key, label, kind: "money", help };
  return { key, label, kind: hints.multiline?.includes(key) ? "textarea" : "text", help };
}

/** The fields of an action's form, or null when the action has none (or only one field: a button is enough). */
export function buildFormSpec(kind: string, properties: Record<string, unknown>, input: Record<string, unknown> | undefined): FormSpec | null {
  const hints = FORM_HINTS[kind];
  if (!hints) return null;
  const fields = Object.entries(properties as Record<string, Property>).map(([key, property]): FormField => {
    if (property.type === "array" && property.items?.properties) {
      const columns = Object.entries(property.items.properties).map(([column, item]): FormField => ({ key: column, label: hints.lineLabels?.[column] ?? column, kind: "text", help: item.description }));
      return { key, label: hints.labels[key] ?? key, kind: "lines", columns, addLabel: hints.addLine ?? "Thêm dòng" };
    }
    return fieldOf(key, property, hints, hints.labels);
  });
  return fields.length >= 2 || fields.some((field) => field.kind === "lines") ? { fields, values: input ?? {} } : null;
}

export const addLineLabel = (kind: string) => FORM_HINTS[kind]?.addLine ?? "Thêm dòng";

/** What one blank field sends when the person leaves it empty, so the action's own checks see every key. */
export function blankValue(field: FormField): unknown {
  return field.kind === "checkbox" ? false : field.kind === "lines" ? [] : "";
}
