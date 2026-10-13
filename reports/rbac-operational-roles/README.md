# Bổ sung RBAC vận hành 13/10/2026

Production d538e9f/schema188 chỉ có role Owner. RBAC server/RPC/RLS đã triển khai, nhưng danh mục role thiếu nên form mời thợ không có lựa chọn. Bổ sung8 template theo ROLE_MATRIX.md; không tự gán ai, không sửa role/quyền cũ. Thêm bảng xem quyền đang có, trang đích theo role chỉ chọn đường đã được cấp quyền.

Gia cố đúng RBAC: kiểm chi nhánh/role active/trần quyền trước gửi lời mời; DB register_invited_employee kiểm lại trần quyền. Cấp/đổi role giữ nonce của form, đổi nonce khi ý định đổi, khóa nonce rồi nhân viên, đối chiếu payload/audit và trả kết quả cũ khi retry. Không phục hồi role cũ sau thay đổi/thu hồi mới. Nonce NULL hoặc dùng lại cho ý định khác bị từ chối; nonce lịch sử đã có nhiều tác động yêu cầu đối chiếu, không âm thầm xóa lịch sử.

Lỗi retry được phát hiện bằng JWT thật: trước sửa cùng nonce trả2 AccessID,2 audit. Sau sửa nhận đồng thời và gửi lại cho8 role chỉ có1 tác động; đổi nội dung cùng nonce400; replay sau đổi role khác không phục hồi role cũ.

Chỉ sửa access/auth/landing, form/page RBAC và một migration. Không sửa SO/PO/kho/thu chi/giao nhận, không thay policies/grants hoặc hàm nghiệp vụ khác. Vercel chỉ thêm tắt auto deploy nhánh. Scope source kiểm giữa d538e9f và ứng viên; kèm hồ sơ sau triển khai PR47.

QA thật: restore cô lập schema188, migration189.17 kiểm SQL/RPC,8 role qua JWT/Auth QA thật, khóa tài khoản với token cũ, sai branch/giá vốn/role quản trị bị từ chối. HTTP200 với[] doRLS được phân biệt với403; không gọi dữ liệu rỗng là chưa chặn. Trình duyệt: Owner127.0.0.1 đổi role qua form; nhân viên localhost cùng tài khoản QA nhận từng role và chuyển đúng8 trang/quyền. Không dùng Owner thay phiên nhân viên. ChọnThợ ở form mời, chưa gửi email.117 bảng nghiệp vụ giữ fingerprint; các thay đổi role/access/audit là fixture QA;1 role hiệu lực.45 kiểm thử liên quan,type/lint/build đạt. Các script kèm theo chỉ dùng QA loopback/credential file riêng, không chứa token/mật khẩu.

Giới hạn: không mời tài khoản doanh nghiệp thật hoặc gửi email thử; không ghi tài chính/kho trênProduction. SMTP không được nghiệm thu bằng unit mock. Nghiệm thu đợt này là RBAC/template/routing/retry, không thay nghiệm thu mọi chức năng của từng phân hệ. Không chạy2 race ứng trước; giữ600.000/400.000.

Production định dạng hàm register khác khoảng trắng. Anchor cuối bỏ phụ thuộc indent; diễn tập5 kiểm trên đúng định nghĩa2 hàm Production trong QA rollback đạt (QA_PRODUCTION_DEFINITION_REHEARSAL.json). SQLhash cuối8ec1e8f3. Kết quả17SQL/8JWT/browser trước thay đổi khoảng trắng này giữ phạm vi role/nonce; không gọi hash85bf làSQL cuối.
