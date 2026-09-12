import { ButtonLink } from "@/components/ui/button-link";
import { requireInternalPermission } from "@/lib/access/context";

export default async function NewOrderPage() {
  await requireInternalPermission("orders.create");
  return (
    <>
      <header className="page-heading"><div><p className="eyebrow">Bán hàng</p><h1>Tạo đơn bán</h1><p className="lede">Bản mẫu biểu mẫu cho bước nhập và xác nhận thông tin đơn.</p></div></header>
      <div className="mock-banner">MOCK · Nút lưu chưa ghi dữ liệu; transaction và idempotency được tích hợp ở phase nghiệp vụ.</div>
      <form className="card card-pad"><div className="form-grid">
        <div className="field"><label htmlFor="customer">Khách hàng</label><select id="customer" defaultValue="CUS-00018"><option value="CUS-00018">Cửa hàng VLXD Minh Phát</option></select></div>
        <div className="field"><label htmlFor="product">Hàng hóa</label><select id="product" defaultValue="cement"><option value="cement">Xi măng PCB40</option></select></div>
        <div className="field"><label htmlFor="quantity">Số lượng (tấn)</label><input id="quantity" inputMode="decimal" defaultValue="2" /></div>
        <div className="field"><label htmlFor="unit-price">Đơn giá (VND/tấn)</label><input id="unit-price" inputMode="numeric" defaultValue="3000000" /></div>
        <div className="field"><label htmlFor="bags">Quy đổi bao 50 kg</label><input id="bags" readOnly value="40 bao" /></div>
        <div className="field"><label htmlFor="total">Thành tiền</label><input id="total" readOnly value="6.000.000 ₫" /></div>
        <div className="field field-full"><label htmlFor="note">Ghi chú giao hàng</label><textarea id="note" defaultValue="Giao trước 16:00, gọi khách trước khi tới." /></div>
      </div><div className="form-actions"><ButtonLink href="/admin/orders" variant="secondary">Hủy</ButtonLink><button className="button button-primary" type="button">Lưu bản nháp</button></div></form>
    </>
  );
}
