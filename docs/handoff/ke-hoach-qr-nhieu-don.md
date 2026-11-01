# Kế hoạch: Thanh toán nhiều đơn bằng một QR (mục 4)

> Kế hoạch ngày 01/11/2026 — **Owner đã duyệt cùng ngày** (D44 trong `Spec.md`, mở rộng D42). Lựa chọn của Owner ở §7.
> Mục tiêu số 1: **sổ sách không nhầm**. Mỗi đồng tiền về phải biết rõ trả cho khoản nợ nào, ai ghi, vì sao, và kiểm tra lại được.

## 1. Hiện trạng (D42, đang chạy)

- Cổng khách → **Công nợ** có hai kiểu thanh toán:
  - Nút **"Thanh toán"** từng đơn: QR = số còn nợ của đơn đó, nội dung `SO2026000101 KH01`.
  - **"Thanh toán tất cả"**: QR = tổng nợ, nội dung `TT KH01`.
- SePay báo tiền về thì `ingest_sepay_webhook` đọc nội dung chuyển khoản rồi gọi `post_bank_receipt`. Kết quả là **một phiếu thu** `BANK_TRANSFER`, phân bổ vào các khoản phải thu theo thứ tự:
  1. Các khoản của **đơn ghi trong nội dung**.
  2. Các **khoản nợ cũ nhất** (hạn sớm nhất).
  3. Còn dư thì thành **tiền ứng trước** của khách.
- Đối soát ngân hàng tự động. Mỗi mã giao dịch SePay chỉ ghi **một lần**.
- Không nhận ra khách (thiếu mã, mã khách lệch, khách ngừng…) thì giao dịch vào **"Giao dịch ngân hàng chờ xử lý"** cho kế toán.
- **Nợ chỉ phát sinh khi phiếu giao đã xác nhận** (`receivable_obligations`). Đơn chưa giao thì chưa có nợ, nên không có gì để trả.

**Chưa có:** khách **chọn một số đơn** (ví dụ 3 trong 10 đơn) và trả gộp bằng một QR.

## 2. Cách hệ thống biết tiền trả cho đơn nào: **Phiếu yêu cầu thanh toán + mã ngắn**

Khi khách tick chọn các đơn rồi bấm **"Thanh toán các đơn đã chọn"**, database tạo một **Phiếu yêu cầu thanh toán**:

| Trường | Ý nghĩa |
|---|---|
| **Mã yêu cầu** | `YC` + 5 ký tự, ví dụ `YC7K2MQ`. Chỉ dùng chữ và số dễ đọc (bỏ 0/O, 1/I/L). Duy nhất, không bao giờ dùng lại. |
| Khách, chi nhánh, quỹ nhận | Quỹ ngân hàng đang bật "Tự ghi tiền về (SePay)" và "Hiện cho khách". |
| **Danh sách khoản nợ (chụp lại lúc tạo)** | Mỗi dòng ghi: khoản phải thu nào, của đơn nào, **số còn nợ tại thời điểm tạo**. |
| Tổng tiền | Bằng tổng các dòng. Đây là số tiền trên QR. |
| Nội dung chuyển khoản | `[tiền tố ngân hàng] TT KH01 YC7K2MQ`, ví dụ `SEVQR TT KH003 YC7K2MQ` (22 ký tự, dưới giới hạn 25 ký tự của nhiều ngân hàng). |
| Người tạo, kênh | Khách tự tạo trên cổng, hoặc nhân viên tạo để gửi khách (giai đoạn sau, khi có Zalo). |
| Trạng thái | `Chờ thanh toán` → `Đã thanh toán` / `Thanh toán một phần` / `Đã hủy`. Hiển thị **hết hạn sau 7 ngày** (xem §4.6). |

SePay báo tiền về:
1. Database tìm `YC7K2MQ` trong nội dung, theo từng chữ trước. Nếu ngân hàng làm mất dấu cách thì tìm trong chuỗi liền, **kèm điều kiện mã khách cũng phải có mặt**.
2. Kiểm tra mã yêu cầu **thuộc đúng khách** ghi trong nội dung. Lệch nhau thì giao dịch **chờ kế toán**, không tự ghi.
3. Ghi **một phiếu thu** cho toàn bộ số tiền, phân bổ theo §3.

**Ưu tiên khi nội dung có nhiều loại mã:** mã yêu cầu `YC…` > mã đơn `SO…`/`SRV…` > chỉ mã khách `TT KH…`. Các kiểu cũ của D42 vẫn chạy y nguyên.

## 3. Quy tắc phân bổ tiền (trái tim của sổ sách)

Một giao dịch ngân hàng tạo ra **một phiếu thu**. Phiếu thu có nhiều dòng phân bổ, mỗi dòng trả cho **một khoản phải thu**. Thứ tự:

1. **Các khoản trong phiếu yêu cầu**, khoản **hạn sớm nhất trước**. Mỗi khoản lấy tối đa **số còn nợ thực tế lúc tiền về** (không phải số chụp lúc tạo). Như vậy không bao giờ trả quá một khoản.
2. Còn dư thì trả **các khoản nợ cũ nhất khác** của khách, giống D42.
3. Vẫn còn dư thì ghi **tiền ứng trước** của khách, giống D42.

Không làm tròn: tiền là số nguyên đồng (`bigint`). Mọi thứ diễn ra trong **một transaction**: hoặc ghi đủ phiếu thu, phân bổ, đối soát và cập nhật phiếu yêu cầu, hoặc không ghi gì.

### Ví dụ (khách KH003 nợ 4 đơn)

| Đơn | Hạn | Còn nợ |
|---|---|---|
| SO-2026-000101 | 05/11 | 3.000.000 |
| SO-2026-000102 | 10/11 | 5.000.000 |
| SO-2026-000103 | 15/11 | 2.000.000 |
| SO-2026-000099 (không chọn) | 01/11 | 1.500.000 |

Khách chọn **101, 102, 103** → yêu cầu `YC7K2MQ`, QR **10.000.000 ₫**.

| Tình huống | Tiền về | Kết quả ghi sổ |
|---|---|---|
| **A. Trả đúng** | 10.000.000 | Phiếu thu REC 10.000.000: 101 = 3tr, 102 = 5tr, 103 = 2tr. Yêu cầu **Đã thanh toán**. Đơn 099 **không bị đụng**. |
| **B. Trả thiếu** | 6.000.000 | 101 = 3tr (hết nợ), 102 = 3tr (còn 2tr), 103 chưa trả. Yêu cầu **Thanh toán một phần**, hiện "còn 4.000.000". Khách tạo yêu cầu mới cho phần còn lại. |
| **C. Trả dư** | 12.000.000 | 101, 102, 103 hết nợ (10tr). Dư 2tr trả **đơn cũ nhất khác** là 099 (1,5tr). Còn 500.000 thành **ứng trước**. |
| **D. Giữa chừng kế toán đã thu tiền mặt đơn 102** (5tr) | 10.000.000 | Lúc tiền về, 102 còn nợ 0 → bỏ qua. 101 = 3tr, 103 = 2tr, dư 5tr → 099 = 1,5tr, ứng trước 3,5tr. Phiếu yêu cầu ghi chú "102 đã trả trước đó". |
| **E. Khách chuyển 2 lần cùng mã** | 10tr + 10tr | Lần 1 như A. Lần 2: các đơn đã hết nợ → trả nợ cũ khác, rồi ứng trước (như C). **Báo kế toán** "mã YC7K2MQ được thanh toán lần 2" để gọi khách. *(Owner chọn: tự ghi như vậy, hay giữ lần 2 chờ kế toán — xem §7.)* |
| **F. Đơn bị trả hàng hoặc giảm nợ sau khi tạo yêu cầu** | 10.000.000 | Phân bổ theo **số còn nợ thực tế**, nên phần dư tự chảy sang nợ cũ khác rồi ứng trước. Không bao giờ âm. |

## 4. Các trường hợp đặc biệt và cách xử lý

1. **Mã yêu cầu không tồn tại hoặc gõ sai**: bỏ qua mã đó, xử lý như D42 bằng mã khách. Nếu cũng không có mã khách thì giao dịch **chờ kế toán**.
2. **Mã yêu cầu của khách A nhưng nội dung ghi mã khách B**: **chờ kế toán** (lý do "Mã yêu cầu và mã khách không khớp"). Không tự ghi.
3. **Yêu cầu đã bị hủy** (khách bấm hủy, hoặc tạo yêu cầu mới thay thế): vẫn nhận ra là của khách đó và vẫn ghi sổ. Lý do: tiền đã thật sự về, và các đơn khách đã chọn vẫn là ý định tốt nhất. Kế toán nhận thông báo.
4. **Khách ngừng giao dịch** hoặc **người bật SePay mất quyền**: **chờ kế toán**, như D42.
5. **Hai giao dịch về cùng lúc cho cùng một yêu cầu**: khóa dòng phiếu yêu cầu và các khoản phải thu (`for update`), nên hai lần ghi chạy lần lượt và không trả trùng.
6. **Hết hạn 7 ngày**: chỉ để cổng khách **không hiện lại QR cũ** (số tiền có thể đã đổi). Mã vẫn được nhận ra mãi mãi nếu tiền về muộn.
7. **Số dư đầu kỳ** (khoản "Số dư đầu kỳ" trên cổng) được chọn như một đơn.
8. **Đơn chưa giao hoặc chưa xác nhận giao**: không hiện để chọn, vì chưa có nợ. Trả trước cho đơn chưa giao **ngoài phạm vi** (vẫn có thể chuyển `TT KH01`, tiền thành ứng trước).
9. **Giới hạn**: tối đa 50 khoản mỗi yêu cầu; tổng phải > 0; tất cả cùng một khách, một chi nhánh.
10. **Idempotency**: tạo yêu cầu có `operation_id`. Bấm hai lần ra **cùng một mã**, không tạo trùng.

## 5. Kế toán nhìn thấy gì (để đối chiếu)

- **Sổ quỹ**: một phiếu thu `REC-202611-000123` 10.000.000 ₫, tham chiếu `SePay <mã GD> · YC7K2MQ`.
  - Mở phiếu thu thấy từng dòng phân bổ theo đơn.
  - **In phiếu thu** (PDF đã có) liệt kê các đơn.
- **Giao dịch ngân hàng**: dòng giao dịch hiện "Yêu cầu YC7K2MQ · 3 đơn" và lý do ghi.
- **Hồ sơ khách → tab mới "Yêu cầu thanh toán"**: danh sách yêu cầu, gồm trạng thái, các đơn chọn, số chụp lúc tạo, số đã nhận và phiếu thu liên kết.
- **Thông báo**: "Đã nhận 10.000.000 ₫ — Công ty A — YC7K2MQ (3 đơn) · còn nợ 1.500.000 ₫".
- **Chờ xử lý**: kế toán chọn khách, rồi chọn **đơn hoặc yêu cầu** để ghi (mở rộng `resolve_bank_transaction`), hoặc "Bỏ qua".
- **Nhật ký** (`audit_events`): tạo yêu cầu, hủy yêu cầu, ghi phiếu thu kèm mã yêu cầu.

## 6. Thiết kế kỹ thuật

### 6.1 Migration (forward-only, một file, kèm test native)
- Bảng `public.payment_requests` (RLS bật; khách thành viên OWNER/FINANCE_CONTACT xem của mình; nhân viên có `finance.ar.read` xem theo chi nhánh; không grant `anon`):
  - `id`, `branch_id`, `customer_id`, `account_id`, `code` (UNIQUE), `amount_vnd`, `note`, `state`, `created_via`, `created_by`, `created_at`, `expires_at`, `cancelled_at`, `operation_id` (UNIQUE).
- Bảng `public.payment_request_lines`: `request_id`, `receivable_obligation_id`, `sales_order_id` / `service_job_id` (để hiển thị), `amount_vnd` (số chụp lúc tạo). UNIQUE (`request_id`, `obligation`).
- `bank_transactions.payment_request_id` (FK). Một yêu cầu có thể nhận nhiều giao dịch (trả thiếu rồi trả thêm, hoặc chuyển trùng).
- RPC mới:
  - `create_payment_request(customer, keys[], operation_id)`: cho cổng khách. Tự tính lại số còn nợ trong DB, không tin số từ trình duyệt.
  - `cancel_payment_request(id, operation_id)`.
- Sửa (bằng `create or replace` trong migration mới):
  - `private.post_bank_receipt`: thêm tham số `target_request_id`; thứ tự phân bổ theo §3; cập nhật trạng thái yêu cầu.
  - `ingest_sepay_webhook`: nhận diện `YC…` theo §2, kiểm khớp khách.
  - `resolve_bank_transaction`: cho chọn yêu cầu.
  - `portal_bank_payment_status`: báo "đã nhận" đúng theo yêu cầu đang mở.
- Hàm sinh mã `private.payment_request_code()`: ngẫu nhiên, thử lại khi trùng.

### 6.2 Ứng dụng
- **Cổng khách → Công nợ**:
  - Mỗi khoản có ô **chọn**, kèm "Chọn tất cả quá hạn" và "Bỏ chọn".
  - Thanh tóm tắt dính đáy: "Đã chọn 3 đơn · 10.000.000 ₫" và nút **"Thanh toán các đơn đã chọn"**.
  - Bấm nút mở **cửa sổ QR**: số tiền, nội dung, danh sách đơn, nút sao chép. Cửa sổ tự báo "Đã nhận thanh toán" khi tiền về, dùng lại cửa sổ D42.
  - Giữ nguyên nút "Thanh toán" từng đơn và "Thanh toán tất cả".
- **Admin**:
  - Tab "Yêu cầu thanh toán" ở hồ sơ khách.
  - Cột hoặc nhãn yêu cầu ở "Giao dịch ngân hàng".
  - Chọn yêu cầu khi xử lý giao dịch chờ.
- Lỗi DB được dịch sang tiếng Việt, ví dụ: "Khoản nợ đã thay đổi, tải lại trang", "Chỉ chọn tối đa 50 khoản".

### 6.3 Kiểm thử (bắt buộc trước khi phát hành)
- **Test SQL native**:
  - Ví dụ A–F ở §3.
  - Các trường hợp 1–10 ở §4.
  - Webhook gửi lại (replay) không ghi trùng.
  - Tổng phân bổ + ứng trước **luôn bằng** số tiền về.
  - Không khoản nào âm.
  - Khách khác không xem được yêu cầu của nhau.
  - Kế toán chi nhánh khác không thấy.
- **Test giao diện**: chọn, bỏ chọn, tổng tiền, cửa sổ QR, thông báo đã nhận.
- **QA**: gọi webhook có chữ ký thật lên QA (giống test D42) cho từng tình huống, rồi đối chiếu Sổ quỹ và công nợ trên màn hình.
- **Đối soát sau phát hành**: chạy truy vấn kiểm tra `sum(phân bổ) + sum(ứng trước) = sum(tiền về)` cho mọi giao dịch có mã yêu cầu.

## 7. Owner đã chốt (01/11/2026)
1. **Trả dư**: như D42 (trả nợ cũ khác → ứng trước).
2. **Chuyển trùng cùng mã (E)**: **giữ chờ kế toán** (`request_already_paid`), không tự ghi. Áp dụng cả khi các khoản của yêu cầu đã hết nợ bằng cách khác.
3. **Trả thiếu**: **hạn sớm nhất trước** trong các khoản đã chọn.
4. **Nhân viên tạo QR thay khách**: **làm luôn đợt này** — mục "Thu nợ bằng QR" ở tab Công nợ & thanh toán của hồ sơ khách (quyền `finance.ar.read`), có "Sao chép tin nhắn gửi khách" để gửi qua Zalo/tin nhắn.

Thay đổi so với bản nháp: danh sách yêu cầu nằm ngay trong tab **Công nợ & thanh toán** (không tách tab riêng); kế toán xử lý giao dịch chờ bằng cách chọn khách/đơn như D42 (không chọn lại yêu cầu — mã yêu cầu vẫn hiện để đối chiếu).

## 8. Lưu ý vận hành
- Tính năng chỉ chạy khi **SePay đã cấu hình trên Production**: webhook, khóa trong Vault, quỹ ngân hàng bật "Tự ghi tiền về" và "Hiện cho khách". Đây là việc số 4 trong HANDOFF và **hiện chưa làm**. Trước đó, cổng khách sẽ không hiện nút thanh toán.
- Thứ tự phát hành: PR → CI → áp migration lên QA → test QA đủ các tình huống → Owner xem → áp Production → deploy.
