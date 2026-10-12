# Phạm vi dọn UAT trước phát hành

Yêu cầu người dùng: dọn UAT trước PR/merge và deploy Production. Đã được phép xử lý UAT; không cần hỏi lại quyền chung. Chưa thực hiện DELETE/UPDATE trên Production.

Đích cấu hình đã xác minh: Vercel `hien-xa-erp-v2` / team `hienxa`, domain `hien-xa-erp-v2-nu.vercel.app`, Supabase `nbwynrwkdbtfsitafsxa`. Vercel env Production trỏ đúng ref này; không dùng QA làm Production.

| Nguồn | Phân loại | Quyết định hiện hành |
|---|---|---|
| Branch `LUAT_PROOF_B_261008`, ID e6c81cc5-58ce-4620-a357-32a0a49790ad | UAT rõ ràng từ mã/tên | Chờ backup và thử khôi phục; không xóa khi chưa có căn cứ phục hồi |
| 4 audit_events và1 private.branch_operational_states gắn branch UAT | Phụ thuộc nguồn UAT | Phải cùng snapshot/đối chiếu với branch; không xóa audit của nguồn khác |
| SO-2026-000013, ID de541c3c-8323-471f-9bd9-a3115ba0161c, DRAFT, branch HX | Không có marker UAT | Giữ; câu hỏi phân loại đã gửi người dùng |
| PO-2026-000010, ID d6375226-43a1-4ba6-9319-5c97c389eb5d, CANCELLED | Không có marker UAT | Giữ chờ phân loại |
| PO-2026-000011, ID675eca7b-d53a-4f66-8b2f-15b06418eb53, DRAFT | Không có marker UAT | Giữ chờ phân loại |
| PO-2026-000012, ID336c8008-e9a4-444d-bf98-64e3ec0f42cb, DRAFT | Không có marker UAT | Giữ chờ phân loại |
| Customer MT, supplier BS, employee HX_OWNER và branch HX | Không có marker UAT | Bảo toàn; không suy từ hệ thống đang ít chứng từ rằng tất cả là thử |
| Auth users có qa_seed |0 | Không có căn cứ xóa tài khoản Auth doanh nghiệp |

Kiểm FK thực tế:55 bảng tham chiếu branch; ở branch UAT chỉ audit_events4 và branch_operational_states1 có dòng, các bảng nghiệp vụ khác0. Inventory toàn dự án tại lần đọc:1SO,3PO,0 kho movement/thu chi/AR/AP/giao/công việc/Storage objects/evidence. Số0 không thay việc phân loại nguồn.

Sau khi đủ kết nối: dump DB/roles/schema/data theo quyền, kiểm archive/SHA và restore sang môi trường thử; so khóa/FK/nguồn, quyền và giá trị. Lập snapshot riêng các row/ancestors trong danh sách dọn và fingerprint toàn dữ liệu cần giữ. Mọi danh sách xóa dùng ID và nguồn rõ ràng, khóa/chặn ghi phù hợp, kiểm lại counts/hash trong cùng transaction; mismatch phải rollback. Không TRUNCATE, không xóa theo tên chứa “test/QA” chung, không disable FK/trigger/RLS, không tạo opening hoặc tiền giả.

Chỉ dọn4 chứng từ HX nếu người dùng xác nhận là UAT; đọc lại toàn đồ thị con trước khi lập DELETE. Sau dọn, đối chiếu nguồn giữ, Auth/cấu hình và Storage. Hai race ứng trước không chạy lại; giữ bằng chứng600.000đ/400.000đ.
