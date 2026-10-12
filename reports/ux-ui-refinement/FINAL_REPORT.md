# Báo cáo tinh chỉnh UI

Đã sửa việc cắt số tiền dài, nhãn đối soát/đảo tiền và nhãn form điều phối, cách đọc kế hoạch/thực lấy/giới hạn báo giao, cùng focus và nút đăng xuất portal. Giữ giao diện và luồng thao tác quen thuộc.

Nền GitHub main e2a6393; nhánh `codex/ux-ui-refinement`. Taste `redesign-existing-projects` tại commit d237dd399d57524945c0c81327da5da19f7a468d. Chưa merge hoặc deploy. PR và CI sẽ được ghi sau khi đăng ứng viên.

Đã có24 cặp ảnh theo12 màn hình, kiểm bàn phím/cuộn bảng/hộp thoại, draft sau tải lại, mất mạng, bấm lặp và retry sau khi máy chủ lưu. Tài khoản quản lý, bán, mua, kho/điều phối, kế toán, thợ, khách finance và khách nhận hàng dùng quyền riêng. DB/Auth/RPC được kiểm thực tế; các unit test là bằng chứng bổ sung.

Ca chuẩn đạt: kho còn1 sau xuất14; thợ báo14, khách chấp nhận13; còn1 trên xe; doanh thu2.990.000đ, thu1.000.000đ, nợ1.990.000đ; một kết quả, một xác minh, một phiếu thu; ngoại lệ hàng còn và đơn chưa hoàn tất. Không activation và không tạo opening. QA hồi quy riêng đã được dọn.

64 kiểm thử liên quan, typecheck, lint và build đạt. CI tổng phải đạt trên HEAD cuối trước bàn giao. Không chạy hai race ứng trước.

Giới hạn: viewport điện thoại Chromium, chưa thử thiết bị iOS/Android vật lý. QA schema186 tương thích các hợp đồng dùng trong đợt này; source canonical187 không có migration mới từ UI. SHA ứng dụng doanh nghiệp chưa được provider/health công bố, DB doanh nghiệp khác QA; không suy rằng bản doanh nghiệp đã được tinh chỉnh. Preview chỉ cục bộ, dùng QA, không tạo cloud preview với cấu hình doanh nghiệp.

Nhãn công nợ hiện có thể trùng loại nguồn/công trình; giữ hợp đồng hiện tại và ghi rõ ở AUDIT.md. Không có sửa nghiệp vụ trong đợt này. Không tuyên bố nghiệm thu toàn bộ hệ thống từ CI.

Xem [ảnh](COMPARISON.md), [vai trò](ROLE_SCREEN_MATRIX.md), [nhật ký](EXECUTION_LOG.md), [bảng hoàn tất](DOD.md), [kiểm dữ liệu](UX_BROWSER.json), [dọn QA](QA_CLEANUP.json).
