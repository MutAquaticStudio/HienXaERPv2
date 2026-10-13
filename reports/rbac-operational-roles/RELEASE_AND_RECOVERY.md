# Phát hành RBAC và phục hồi

Ứng viên dựa d538e9f; CI phải đạt đúng head và merge. Môi trường đích: hien-xa-erp-v2-nu.vercel.app, Vercel project prj_o6ya9YI1b3fTFC8nxiOtjHiwaS3W, DB nbwynrwkdbtfsitafsxa. Hiện schema canonical188/history thực182. Chỉ áp dụng migration operational_role_presets đúng SQL/checksum đã diễn tập, rồi deploy ứng dụng merge. Không chạy db push/reset toàn bộ lịch sử; không áp lại8 phiên bản lịch sử bị thiếu.

Supabase management tự tạo version thực khi apply_migration; phải đọc lại version/name/statements checksum và ghi ánh xạ với file20261013105000. Không giả lập version hoặc sửa journal để gọi đã áp dụng. Về sau chỉ dùng rollout name/checksum đã đối chiếu, không tự push file trùng do khác timestamp.

Trước/sau: fingerprint mọi bảng public/private/Storage, riêng role cũ và employee access/grants; policies/grants, định nghĩa2 RPC và các hàm khác. Chỉ có8 role mới/quyền của chúng và2 thân RPC thay đổi; không tài khoản/binding/tiền/kho/opening mới. Apply trongtransaction, fail khi permission hay anchor hàm thiếu; replay không overwrite role cũ.

Backup/restore đầy đủ được chủ miễn trước đó, không thực hiện hoặc ghiPASS. Lưu metadata/định nghĩa trước thay đổi để đối chiếu. Quay lại app d538e9f artifact dpl_8HgrA4D86tsUCBaYg4FezfU82CeZ tương thích cùng schema189, giữ guardRBAC mới. Ưu tiên sửa tiếp để giữ nonce ởUI. Không tự gỡ quyền đã cấp thật hoặc xóa lịch sử; nếu cần dừng template mới, chủ kiểm người đang dùng rồi thu hồi/deactivate theo UI có audit, không xóa hồ sơ.

Sau deploy: health đúng SHA; Owner form có9 lựa chọn thực (Owner+8), quyền/phạm vi và 2RPC đúng; read-only màn hình/kết nối/log và fingerprint nghiệp vụ. Không gửi email thử, tạo nhân viên giả hoặc ghi sổ thử Production.
