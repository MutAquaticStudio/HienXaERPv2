# Ma trận role vận hành

Căn cứ: Spec.md SPEC-PRODUCT-002, SPEC-ACC-001..005; UXUI.md UX-910. Một role hiệu lực mỗi nhân viên/chi nhánh. Owner hiện có giữ nguyên. Khách hàng dùng CustomerPortalMembership riêng, không thêm role khách vào form nhân viên. Không dựng thêm Admin trùng Owner.

|Role|Trang đích|Quyền mặc định|
|---|---|---|
|Quản lý|/admin|catalog.read, customers.read, suppliers.read, orders.read, quotation.read, pricing.read, purchasing.read, purchasing.price.read, inventory.read, inventory.cost.read, delivery.read, delivery.verify, delivery.exception, workforce.read, work.verify, service.read, service.verify, compensation.read, compensation.approve, finance.ar.read, finance.ap.read, finance.expense.read, finance.profit.read, dashboard.read|
|Bán hàng|/admin/orders|catalog.read, customers.read, customers.manage, pricing.read, orders.read, orders.create, orders.confirm, orders.cancel, quotation.read, quotation.create, quotation.send, delivery.read, inventory.read, finance.ar.read|
|Mua hàng|/admin/purchase-orders|catalog.read, suppliers.read, suppliers.manage, orders.read, purchasing.read, purchasing.create, purchasing.confirm, purchasing.cancel, purchasing.price.read, purchasing.price.manage, delivery.read, inventory.read, finance.ap.read|
|Nhân viên kho|/admin/inventory|catalog.read, customers.read, suppliers.read, orders.read, purchasing.read, inventory.read, inventory.receive, inventory.reserve, inventory.count, delivery.read, delivery.handoff|
|Điều phối|/admin/dispatch|catalog.read, customers.read, suppliers.read, orders.read, inventory.read, delivery.read, delivery.create, delivery.assign, delivery.exception, workforce.read, work.manage, service.read|
|Kế toán|/admin/receivables|catalog.read, customers.read, suppliers.read, orders.read, purchasing.read, purchasing.price.read, delivery.read, inventory.read, inventory.cost.read, finance.ar.read, finance.ar.adjust, finance.ap.read, finance.ap.adjust, finance.account.manage, finance.payment.post, finance.payment.reverse, finance.payment_notice.review, finance.reconcile, finance.expense.read, finance.expense.manage, finance.profit.read, compensation.read|
|Thợ|/work|work.read, work.claim|
|Tài xế|/work|work.read, work.claim|

Các template không có roles.manage. Chỉ Owner hiện có cấp role/quyền thêm theo trần quyền và chi nhánh. Quản lý có quyền đọc tài chính/giá vốn và duyệt giao/công việc/thù lao; không ghi thu chi. Kế toán đọc/ghi tài chính theo các giới hạn nguồn có sẵn, không tự cấp quyền hay xác minh giao hàng. Thợ/tài xế chỉ work.read + work.claim, không workforce.read, giá vốn, công nợ hoặc quyền xác minh/ghi sổ.

Template là điểm bắt đầu; quản trị dùng quyền bổ sung hiện có khi cần kiêm nhiệm. Không tự gán role mới hoặc tăng quyền của tài khoản cũ. Role tùy chỉnh đã có cùng code được giữ nguyên; migration không tự kích hoạt/sửa quyền của chúng.
