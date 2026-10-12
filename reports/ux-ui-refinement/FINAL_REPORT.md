# Báo cáo tinh chỉnh UI

Đã sửa việc cắt số tiền dài, nhãn đối soát/đảo tiền và nhãn form điều phối, cách đọc kế hoạch/thực lấy/giới hạn báo giao, cùng focus và nút đăng xuất portal. Giữ giao diện và luồng thao tác quen thuộc.

Nền GitHub main e2a6393; nhánh `codex/ux-ui-refinement`. Taste `redesign-existing-projects` tại commit d237dd399d57524945c0c81327da5da19f7a468d. Commit mã543a93e; [PR44](https://github.com/MutAquaticStudio/HienXaERPv2/pull/44); [preview cục bộ](http://127.0.0.1:3116). Chưa merge hoặc deploy.

Đã có24 cặp ảnh theo12 màn hình, kiểm bàn phím/cuộn bảng/hộp thoại, draft sau tải lại, mất mạng, bấm lặp và retry sau khi máy chủ lưu. Tài khoản quản lý, bán, mua, kho/điều phối, kế toán, thợ, khách finance và khách nhận hàng dùng quyền riêng. DB/Auth/RPC được kiểm thực tế; các unit test là bằng chứng bổ sung.

Ca chuẩn đạt: kho còn1 sau xuất14; thợ báo14, khách chấp nhận13; còn1 trên xe; doanh thu2.990.000đ, thu1.000.000đ, nợ1.990.000đ; một kết quả, một xác minh, một phiếu thu; ngoại lệ hàng còn và đơn chưa hoàn tất. Không activation và không tạo opening. QA hồi quy riêng đã được dọn.

64 kiểm thử liên quan đạt cục bộ. CI trên commit mã543a93e đạt619/619 unit (91 tệp), 8/8 Node, typecheck, lint và build: [bằng chứng](CI_CODE.json). HEAD chốt hồ sơ được kiểm riêng; kết quả đúng HEAD cuối và link Actions được chốt tại [PR44 checks](https://github.com/MutAquaticStudio/HienXaERPv2/pull/44/checks) và mô tả PR trước bàn giao. Không chạy hai race ứng trước.

Giới hạn: viewport điện thoại Chromium, chưa thử thiết bị iOS/Android vật lý. QA schema186 tương thích các hợp đồng dùng trong đợt này; source canonical187 không có migration mới từ UI. SHA ứng dụng doanh nghiệp chưa được provider/health công bố, DB doanh nghiệp khác QA; không suy rằng bản doanh nghiệp đã được tinh chỉnh. Preview chỉ cục bộ, dùng QA, không tạo cloud preview với cấu hình doanh nghiệp.

Nhãn công nợ hiện có thể trùng loại nguồn/công trình; giữ hợp đồng hiện tại và ghi rõ ở AUDIT.md. Không có sửa nghiệp vụ trong đợt này. Không tuyên bố nghiệm thu toàn bộ hệ thống từ CI.

Xem [ảnh](COMPARISON.md), [vai trò](ROLE_SCREEN_MATRIX.md), [nhật ký](EXECUTION_LOG.md), [bảng hoàn tất](DOD.md), [kiểm dữ liệu](UX_BROWSER.json), [dọn QA](QA_CLEANUP.json).

Bản build phục vụ preview đã đối chiếu health SHA543a93e, chụp lại24 màn hình đăng nhập và giữ cùng runtime hash `789ca0f771cea763525d9a97e30e4193b63532135a46b5c68b04163be5c887de`. Ảnh trước là dev baseline sạch; ảnh sau cuối là next start, nên không còn biểu tượng phát triển.

Sửa bổ sung: phần trăm rất dài không bị cắt tại1024–1180px; ngắt ở dấu phẩy giữ nguyên chuỗi. RESPONSIVE.json: cả7 kích thước320–1440px đạt, nội dung số không đổi. Runtime hash sau sửa: `b56c4ace29f2690f5fb78bb9acfb9327861488346c43254d4fdcfd3dedbb600c`. Các ca ghi sổ đã đạt vẫn còn hiệu lực vì không đổi hợp đồng/quyền/tính toán; không chạy lại. CI sau sửa phải được kiểm riêng.
