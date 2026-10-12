# Chặn bằng chứng QA từ mã khác phiên bản

Review PR44 trên head16763e1 chỉ ra P2 tại bộ chạy `ux-refinement-browser.mjs`: đọc lại output chưa hoàn tất nhưng không so nguồn hiện tại, nên có thể bỏ qua ca đã chạy trên mã khác rồi gộp thành PASS. Đã kiểm mã và sửa nguyên nhân.

`source-binding.mjs` đọc commit và SHA-256 của src/package/lockfile/migrations cùng chính harness. Khi tiếp tục, phải trùng cả commit và nội dung trước khi mở DB hoặc trình duyệt. Trước khi chốt PASS kiểm lại nguồn để phát hiện thay đổi giữa lúc chạy. Thiếu metadata hoặc khác nguồn phải từ chối, giữ artifact cũ; output PASS đã hoàn tất vẫn bị chặn replay.

7 Node test kiểm nguồn mới, nguồn cũ trùng, commit khác, byte chưa commit khác, metadata thiếu, thay đổi giữa lúc chạy và đọc hash trên Git repo tạm với app/harness sửa thật. Cộng8 test evidence có sẵn:15/15 đạt cục bộ; lint phần sửa0 lỗi. CI bổ sung bộ này. Không chạy lại giao dịch, ca15→14→13 hoặc hai race ứng trước.

Bằng chứng UX trước giữ nguyên theo phiên bản/phạm vi của artifact; không đổi sourceCommit/SHA cũ để giả thành lần chạy mới. Mã ứng dụng/API/RPC/schema/permission/tính toán của đợt UI giữ nguyên; sửa này chỉ bảo vệ bộ kiểm chứng. Không nhận kết quả cũ là mới chỉ vì runner đã được sửa.
