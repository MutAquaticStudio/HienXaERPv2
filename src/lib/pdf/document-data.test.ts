import { describe, expect, it } from "vitest";
import { salesDocumentData, purchaseDocumentData, deliveryDocumentData, type SalesDocument, type PurchaseDocument, type DeliveryDocument } from "./document-data";
const meta = { branch: "Chi nhánh thử", generatedAt: "14/10/2026 09:00" };
const sales: SalesDocument = { id: "source", order_number: "SO-MAU", commercial_state: "DRAFT", customer_name_snapshot: "Khách hàng mẫu", site_name_snapshot: "Công trình mẫu", delivery_address_snapshot: "Địa chỉ đã lưu", created_at: "2026-10-14T02:00:00Z", requested_delivery_at: null, total_vnd: "9007199254740993", receiver_name_snapshot: null, receiver_phone_snapshot: null, commercial_terms: "Điều khoản đã lưu", draft_version: 3 };
const purchase: PurchaseDocument = { id: "po", purchase_order_number: "PO-MAU", state: "CONFIRMED", supplier_name_snapshot: "Nhà cung cấp mẫu", supplier_address_snapshot: null, destination_type: "CUSTOMER_SITE", destination_name_snapshot: "Công trình mẫu", destination_address_snapshot: "Địa chỉ đã lưu", created_at: sales.created_at, expected_at: null, total_cost_vnd: "1234567", commercial_terms: null, draft_version: 1 };
const delivery: DeliveryDocument = { id: "dl", delivery_number: "DL-MAU", execution_state: "VERIFIED", result_kind: "PARTIAL", reported_result_kind: "FULL", reported_receiver_name: "Người nhận", result_note: "Ghi chú gốc", customer_name_snapshot: sales.customer_name_snapshot, site_name_snapshot: sales.site_name_snapshot, delivery_address_snapshot: sales.delivery_address_snapshot, receiver_name_snapshot: null, receiver_phone_snapshot: null, created_at: sales.created_at, scheduled_at: null, verified_at: sales.created_at };
const line = { line_number: 2, material_name_snapshot: "Tên vật tư đã lưu", quantity: "0.123456", ordered_uom_id: "uom", unit_price_vnd: "1234567", line_total_vnd: "152415", unit_cost_vnd: "9999999", line_total_cost_vnd: "1234567" };
const dlLine = { id: "line", material_name_snapshot: "Xi măng", source_mode: "WAREHOUSE", base_uom_symbol: "TẤN", planned_base_quantity: "15", loaded_base_quantity: "14", actual_base_quantity: "14", accepted_base_quantity: "13", billable_base_quantity: "13" };
describe("Printable source documents", () => {
  it("keeps saved totals beyond JS integer precision, original six-place quantities and terms", () => {
    const doc = salesDocumentData(sales, [line], new Map([["uom", "TẤN"]]), meta);
    expect(doc.totals?.[0].value).toBe("9.007.199.254.740.993 ₫");
    expect(doc.rows[0]).toMatchObject({ quantity: "0,123456", amount: "152.415 ₫", number: "2", uom: "TẤN" });
    expect(doc.notes[0].text).toBe("Điều khoản đã lưu");
    expect(doc.status).toContain("Bản nháp");
  });
  it("does not emit any purchase prices or totals without price permission, even if input contains them", () => {
    const doc = purchaseDocumentData(purchase, [line], new Map([["uom", "TẤN"]]), false, meta);
    expect(doc.columns.some(c => ["price", "amount"].includes(c.key))).toBe(false);
    expect(doc.totals).toEqual([]);
    expect(JSON.stringify(doc)).not.toMatch(/1234567|9999999|1\.234\.567|9\.999\.999/);
  });
  it("shows unknown purchase money explicitly, never as zero", () => {
    const doc = purchaseDocumentData({ ...purchase, total_cost_vnd: null }, [{ ...line, unit_cost_vnd: null, line_total_cost_vnd: null }], new Map(), true, meta);
    expect(doc.rows[0].price).toBe("Chưa xác định");
    expect(doc.totals?.[0].value).toBe("Chưa xác định");
  });
  it("keeps planned15 / loaded14 / reported14 / accepted13 and billable13 separate", () => {
    const doc = deliveryDocumentData(delivery, [dlLine], meta);
    expect(doc.rows[0]).toMatchObject({ planned: "15", loaded: "14", reported: "14", accepted: "13", billable: "13" });
    expect(doc.status).toContain("Kết quả: Giao thiếu");
    expect(doc.fields.find(f => f.label === "Hiện trường báo")?.value).toBe("Đủ");
    expect(JSON.stringify(doc)).not.toMatch(/unit_cost|giá vốn|30\.000/);
  });
  it("does not present pre-result or pre-verification view zeroes as completed events", () => {
    const doc = deliveryDocumentData({ ...delivery, result_kind: null, reported_result_kind: null, verified_at: null }, [{ ...dlLine, loaded_base_quantity: null, actual_base_quantity: "0", accepted_base_quantity: "0", billable_base_quantity: "0" }], meta);
    expect(doc.rows[0]).toMatchObject({ loaded: "Chưa lấy", reported: "Chưa báo", accepted: "Chưa xác minh", billable: "Chưa xác minh" });
  });
  it("keeps a verified zero explicit and a recorded zero loading distinct from no loading", () => {
    const doc = deliveryDocumentData({ ...delivery, result_kind: "FAILED" }, [{ ...dlLine, loaded_base_quantity: "0", actual_base_quantity: "0", accepted_base_quantity: "0", billable_base_quantity: "0" }], meta);
    expect(doc.rows[0]).toMatchObject({ loaded: "0", reported: "0", accepted: "0", billable: "0" });
  });
});
