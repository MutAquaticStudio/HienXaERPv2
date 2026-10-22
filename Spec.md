> Quy tắc hiện hành 12/10/2026: bỏ opening pending và kích hoạt thủ công khỏi vận hành. Thông tin đối chiếu lịch sử chỉ mô tả chất lượng dữ liệu, không khóa giao dịch mới. Các bằng chứng trạng thái/gate cũ bên dưới là lịch sử, không phải điều kiện đang áp dụng.

> Quyết định Owner 15/10/2026 (đợt góp ý khách `FB-KIOTVIET-20261015`): **D1** tắt hẳn Báo giá ở nội bộ và cổng khách — mọi chỗ nhắc tới báo giá trong tài liệu này tạm không áp dụng (SPEC-140); **D2** KPI Tổng quan dùng lợi nhuận ròng thay lợi nhuận gộp (SPEC-DASH-001); **D3** biểu đồ Tổng quan là đường Thu / Chi / Lợi nhuận theo đúng bộ lọc (SPEC-DASH-009); **D4** thiết lập giá chung hàng loạt, lưu một lần nguyên tử (SPEC-PRI-005).
>
> Quyết định Owner 16/10/2026 (đợt tinh chỉnh 2 `FB2-20261016`, giữ nguyên nghiệp vụ): **D5** tạo/sửa danh mục và tạo nhanh mở trong popup (UX-160); **D6** nút chính khi tạo đơn bán là "Xác nhận đơn" qua popup kiểm tra, "Lưu nháp" là lối phụ; **D7** giữ mô hình quy đổi đơn vị (SPEC-UOM), giao diện "Đơn vị tính" kiểu KiotViet; **D8** tắt hẳn Báo chuyển khoản như cách tắt Báo giá, không xóa dữ liệu; **D9** Dịch vụ giữ là chứng từ riêng, tạo nhanh từ đơn/khách, không gộp vào dòng đơn bán; **D10** Cài đặt thêm Thông tin doanh nghiệp in trên chứng từ và Giao diện theo máy (sáng/tối, cỡ chữ, font); **D11** biến thể vật tư (mỗi biến thể là một vật tư đủ mã/tồn/giá) và gợi ý giá lẻ chia theo quy đổi (giá lưu vẫn là số VND tuyệt đối từng đơn vị); nhóm giá khách tự đặt theo `CUSTOMER_TIER`; **D12** vai trò tùy biến chỉ người có `roles.manage` (Owner) tạo/sửa, không gán được `roles.manage` vào vai trò tùy biến. Kế hoạch theo đợt: `tasks.md` mục FB2-20261016.
>
> Quyết định Owner 17/10/2026: **D13** tên miền — tạm dùng tên miền mặc định Vercel của dự án; sau bàn giao và thanh toán gói chuyển sang `app.hienxavlxd.com`. Link mời nhân viên/quên mật khẩu lấy theo tên miền đang mở; Supabase Auth (Site URL, Redirect URLs) phải khai báo đúng tên miền đang dùng. Logo doanh nghiệp tải lên trong Cài đặt (SPEC-CONFIG-003).
>
> Quyết định Owner 17/10/2026 (đợt `FB3-20261017`): **D14** tài khoản cổng khách — doanh nghiệp tạo tài khoản (email + mật khẩu, bắt đổi mật khẩu lần đầu) đồng bộ với hồ sơ khách, và khách mới tự đăng ký tạo hồ sơ khách "Tự đăng ký"; **D15** khách tự đặt hàng, thấy giá theo nhóm giá của mình, đơn chờ doanh nghiệp duyệt; **D16** khi duyệt đơn khách: dòng kho đủ → phiếu giao từ kho, dòng thiếu → đơn mua NCC giao thẳng công trình; **D17** báo NCC qua Zalo (nút gửi thủ công; Zalo tự động khi có Zalo OA); **D18** danh mục có nút Xóa (chỉ khi chưa phát sinh chứng từ, SPEC-CAT-003), ô tiền tự phân cách hàng nghìn khi gõ, ô chọn vật tư tự xổ danh sách, giảm giá đơn bán theo VND hoặc % từng dòng và cả đơn (SPEC-PRI-007). D18 làm trước và phát hành riêng (R1); D14–D17 triển khai ở đợt R3 + B (18/10/2026): SPEC-CUSTPORTAL-004/005, SPEC-PUR-003.

> Quyết định Owner 17/10/2026 tối (đợt `FB4-20261017`): **D19** tự phân nguồn khi xác nhận đơn — hệ thống tự giải cho cả đơn (ưu tiên kho; phần thiếu thành đơn mua NCC giao thẳng **nháp, chờ duyệt**; kho đủ một phần thì tự quyết tách hay mua cả dòng theo chi phí), người dùng chỉ xem kết quả và đổi khi cần; **D20** hai luồng phiếu giao giữ như hiện có và làm rõ trên giao diện: *giao từ kho* (xe nhà, tài xế/thợ, cổng thợ, ảnh "Đã giao") và *NCC giao thẳng* (phiếu riêng theo đơn mua, đầu mối là NCC); **D21** một thợ/tài xế nhận nhiều phiếu: mỗi điểm giao chiếm "thời gian mỗi điểm giao" (Cài đặt, mặc định 60 phút) thay mặc định 4 giờ, "Giao ngay" cho người đang bận được xếp nối tiếp, hẹn giờ trùng thì báo giờ trống gần nhất (SPEC-DEL-007); **D22** tự điều phối mức "Tự động, sửa được" (Cài đặt Tắt / Gợi ý / Tự động, mặc định Tự động); **D23** danh mục loại dịch vụ có đơn vị tính, đơn giá mặc định và loại cần xe/máy (SPEC-SRV-003). Cùng đợt (FB3 Phần A): điều phối lập phiếu giao từ kho không cần quyền mua hàng, phân xe là việc tự sang cổng thợ, cổng thợ "Đã giao" kèm ảnh (SPEC-DEL-007, SPEC-WORKPORTAL-004). D21, D23 và Phần A ở đợt R2; D19, D22 ở đợt R3 (SPEC-SRC-004, SPEC-DEL-008).

> Quyết định Owner 17/10/2026 (FB3 Phần C và F5, "cũng cần làm cùng"): **C1** đăng nhập bằng số điện thoại (không cần SMS); **C2** thợ từ chối việc chưa bắt đầu; **F5** tự động hóa không tốn phí dịch vụ ngoài (không n8n/Make/Zapier): thông báo trong ứng dụng, quy tắc tự động, thông báo đẩy về điện thoại, Telegram, email, webhook (SPEC-SEC-006). Zalo ZNS (trả phí theo tin) và trợ lý AI chỉ làm khi Owner yêu cầu.

> Quyết định Owner 17/10/2026 tối (P0): **D24** mời nhân viên không phụ thuộc email — mặc định hệ thống tạo **link kích hoạt dùng một lần** để quản lý sao chép gửi qua Zalo/tin nhắn (vẫn chọn được gửi thư mời; thư không gửi được thì tự tạo link); danh sách Nhân viên & quyền có nút "Link kích hoạt" tạo link mới cho người chưa đặt mật khẩu hoặc quên mật khẩu (link mới thay link cũ; không tạo cho chính mình, chỉ trong chi nhánh đang quản lý, không vượt quyền người tạo). Link mở thẳng trang đặt mật khẩu của ứng dụng và được xác minh trong trình duyệt, nên không phụ thuộc danh sách chuyển hướng của Supabase và không bị bản xem trước của ứng dụng chat dùng mất.

> Quyết định Owner 18/10/2026 (góp ý sau bản Production, đợt `FB5-20261018`, giữ nguyên nghiệp vụ ghi sổ): **D25** (a) quy đổi đơn vị nhập được hai chiều ("1 Tấn = 20 Bao" hoặc "1 Bao = 0,05 Tấn") và luôn hiện bằng câu "1 A = x B", không hiện "A → B 20 / 1" (SPEC-UOM-004); (b) giá mua nhập theo một đơn vị tự tính giá cho các đơn vị khác của vật tư theo quy đổi, lưu nguyên tử (SPEC-PRI-008); (c) xe không bắt ghi căn cứ sức chở; sức chở tự quy đổi sang đơn vị của hàng qua quy đổi đã duyệt, hai chiều, tối đa 3 bước (SPEC-DEL-009); (d) đơn bán mới có ô "Khách trả trước" (số tiền, phương thức, quỹ) ghi thành phiếu thu ứng trước của khách trong Sổ quỹ (SPEC-FIN-007); (e) xác nhận xong đơn bán/đơn mua hiện "bước tiếp theo" để giảm thao tác, không bỏ bước nghiệp vụ nào (SPEC-DEL-009, SPEC-PUR-003).

> Quyết định Owner 18/10/2026 tối (đợt `FB6`): **D26** màn "Đặt hàng" của cổng khách đồng nhất với "Tạo đơn bán" nội bộ và chọn được hàng cùng loại (variant) trên từng dòng (SPEC-CUSTPORTAL-005).

> Quyết định Owner 22/10/2026 (đợt `FB7`, Owner tự QA sau phát hành): **D27** (a) giao hàng: điều phối chỉ phân người + xe; **thợ** xác nhận "Đã lấy hàng lên xe" kèm 1–5 ảnh (trừ kho) và "Đã giao" kèm ảnh; báo "Đã giao" **là xác minh** (kể cả giao thiếu / không giao được), phần chưa giao tự nhập lại kho xuất; bỏ bước "Tới nơi"; ảnh hiện ở phiếu giao; khách thấy đơn **Hoàn tất** — thay luật cũ "xác minh do người có quyền `delivery.verify` sau khi thợ báo" (SPEC-FB7 §1); (b) "bước tiếp theo" của đơn bán/đơn mua hiện thường trực, không chỉ ngay sau xác nhận (§2); (c) cổng khách có trang **Tài khoản** (§3); (d) trang chủ chọn một trong ba cổng (Khối vận hành / Thợ & tài xế / Khách hàng + Đăng ký) (§4); (e) kiểm kho lệch âm → chi phí **"Hao hụt kiểm kho"** không dùng tiền: trừ lợi nhuận, hiện ở Chi phí và Sổ quỹ, không trừ số dư quỹ (§5); (f) công trình bỏ vĩ độ, kinh độ, khung giờ nhận trên form (§6); (g) **bỏ "Lý do" bắt buộc ở mọi nơi**: danh mục/giá/cài đặt/quyền bỏ hẳn ô; thao tác tiền/hàng có ô "Ghi chú (không bắt buộc)"; hệ thống tự ghi câu mặc định vào nhật ký (§7); (h) chi phí kiểu KiotViet: người nhận bất kỳ (Khác / NCC / Nhân viên), trả ngay từ quỹ hoặc ghi nợ NCC, mua tài sản có thể không tính lợi nhuận — thay luật cũ "chi phí luôn gắn NCC và qua duyệt + công nợ phải trả" (§8); (i) form lỗi không còn nút "Bắt đầu thao tác mới": giữ dữ liệu, đánh dấu ô lỗi, gửi lại được ngay (§9).

# Spec.md — HIỀN XA ERP V2

> **Bộ tài liệu:** `HX-V2-DOCSET-4.4`  
> **Giao thức đồng bộ:** `SYNC-4.4`  
> **File sở hữu:** Yêu cầu sản phẩm, nghiệp vụ, dữ liệu, bảo mật, hiệu năng và tiêu chí nghiệm thu  
> **Mục đích:** Mô tả chính xác hệ thống phải làm gì và những điều tuyệt đối không được sai.

---


# SPEC-000 — Luật sử dụng tài liệu

## SPEC-000.1 — Quyền sở hữu thông tin

`Spec.md` là file duy nhất được phép sở hữu:

- phạm vi sản phẩm;
- thuật ngữ nghiệp vụ;
- thực thể nghiệp vụ;
- quy tắc nghiệp vụ;
- invariant;
- yêu cầu dữ liệu;
- yêu cầu backend ở mức hợp đồng;
- yêu cầu bảo mật;
- ngân sách hiệu năng;
- hành vi lỗi;
- tiêu chí nghiệm thu;
- Definition of Done.

Không ghi vào `Spec.md`:

- phase hiện tại;
- task hiện tại;
- SHA/commit hiện tại;
- module nào đã code xong;
- log kiểm thử;
- benchmark thực đo;
- bố cục chi tiết từng màn;
- checklist thực thi.

Các nội dung trên lần lượt thuộc `tasks.md`, `implementation.md`, `UXUI.md`, `plan.md`.

## SPEC-000.2 — Ưu tiên yêu cầu và xử lý mâu thuẫn

Chỉ thị mới nhất của người dùng quyết định ý định sản phẩm; `Spec.md` ghi lại ý định đã được duyệt. Quy định an toàn và quyền công cụ của môi trường vẫn có hiệu lực.

Nếu code, UX hoặc kế hoạch khác Spec: ghi `CONFLICT`, xác định phía sai rồi sửa trong phạm vi được phép; **không mặc định code sai trước khi kiểm tra Spec có lỗi/mâu thuẫn hay không**. Không sửa Spec để hợp thức hóa lỗi triển khai. Chỉ người dùng mới phê duyệt thay đổi nghiệp vụ có hậu quả tài chính, dữ liệu hoặc quyền.

Sự thật triển khai lấy từ mã nguồn/cơ sở dữ liệu được kiểm tra và bằng chứng gắn phiên bản. Báo cáo người dùng và dữ liệu chưa kiểm tra phải được ghi đúng loại bằng chứng trong `implementation.md`.

## SPEC-000.3 — Legacy

V1 đã được lưu trữ riêng trong Git history/branch/tag.

V2:

```text
GIỮ LỊCH SỬ
GIỮ DỮ LIỆU CẦN BẢO TOÀN
XÂY LẠI APPLICATION SOURCE
```

Không coi implementation V1 là kiến trúc chuẩn của V2.

Legacy chỉ dùng để:

- xác minh business rule;
- xác minh dữ liệu cần migration;
- tham khảo test case;
- điều tra lịch sử khi có chênh lệch.

---

# SPEC-005 — Bài toán người dùng và điều kiện kiểm chứng

## SPEC-PRODUCT-001 — Điều đã biết và điều chưa được chứng minh

**Đã được người dùng nêu:** phiên bản cũ không được khách hàng chấp nhận; khó hiểu/phân quyền có lỗi; cần màn bán hàng, mua hàng, khách hàng có cách thao tác kiểu Sapo; người dùng trung niên và ít quen phần mềm; chủ cần xem lãi/công nợ và bấm thẳng vào chi tiết. Đây là thông tin từ cuộc trao đổi, chưa phải kết quả nghiên cứu quan sát độc lập.

**Giả thuyết thiết kế:** danh sách → tạo mới → chi tiết, nhãn tiếng Việt, giá tự lấy theo khách và một hành động chính sẽ giảm thao tác sai. Phải kiểm chứng bằng bài thử ở `UX-TEST-001`; không coi prototype đẹp là đã xác thực.

## SPEC-PRODUCT-002 — Việc người dùng cần hoàn thành

| Người dùng | Việc cần xong | Bằng chứng sản phẩm có giá trị |
|---|---|---|
| Nhân viên bán hàng | Nhận đơn qua điện thoại/Zalo, chọn đúng khách/công trình, đúng giá và đơn vị | Tạo được đơn mà không hỏi người quản lý giá từng dòng; xem lại đơn cũ không đổi giá |
| Mua hàng/điều phối | Chọn kho hoặc nhà cung cấp gần công trình | Một liên kết đơn bán–đơn mua–phiếu giao, không nhập lại giá bán ở hai nơi |
| Kho/thợ/tài xế | Biết lấy/giao/làm gì, báo lượng thực và bằng chứng | Không phải hiểu công nợ hay kế toán; thao tác không yêu cầu bấm khi đang lái |
| Tài chính | Thu một khoản trả nhiều đơn, sửa sai có dấu vết | Phân bổ đúng, không ghi trùng, không mất lịch sử |
| Chủ/quản lý | Xem kết quả kinh doanh và khoản cần thu/chi | Từ một dòng công nợ mở đúng hồ sơ bằng một thao tác, không tìm lại |
| Khách | Xem báo giá, tiến độ và khoản phải trả | Không cần thuật ngữ nội bộ; gửi biên nhận không bị hiểu là tiền đã được xác minh |

## SPEC-PRODUCT-003 — Phạm vi và ưu tiên

Không bỏ các chức năng đã chốt. Xây và nghiệm thu theo lát cắt luồng thật thay vì chấm điểm hoàn tất theo số màn hình.
- Lõi bắt buộc: xác thực/quyền; danh mục/đơn vị; khách/công trình/giá; báo giá (đang tắt theo quyết định Owner D1 ngày 15/10/2026, xem SPEC-140); bán–mua–giao; kho; công nợ/thu chi; Dashboard.
- Phần vận hành nối tiếp: thợ, dịch vụ, thu nhập/hoa hồng, cổng khách.
- Tích hợp phải có nhưng chỉ bật khi điều kiện đủ: lộ trình/GPS/chat, hóa đơn điện tử. Thiếu API không cho phép đánh dấu tích hợp thật đã đạt.
- Ngoài phạm vi: khai/nộp thuế, kế toán pháp định đầy đủ, ứng dụng di động chạy nền liên tục, bộ máy cấu hình quy trình tổng quát.

## SPEC-PRODUCT-004 — Ràng buộc đã chốt không được làm rơi

Một repository hiện hữu; một ứng dụng Next.js + TypeScript trên một Vercel project; **một Supabase Cloud Production**. Không tạo Cloud staging/preview/database nhánh. Kiểm thử dùng PostgreSQL/Supabase cục bộ cô lập. Giữ dữ liệu thật, Auth và Storage; làm lại mã ứng dụng trên `main`, V1 chỉ tra cứu ở archive.

Bộ canonical từ DOCSET 4.4 có đúng **năm file**:

- `Spec.md` — product/business/data/security/performance/acceptance contract;
- `UXUI.md` — interaction/layout/navigation contract;
- `plan.md` — execution order, audit/check/token strategy;
- `tasks.md` — current work only;
- `implementation.md` — observed reality/evidence/gap status.

Không dùng `acceptance.md` riêng trong DOCSET 4.4; acceptance behavior bắt buộc nằm trong `Spec.md`, còn UX acceptance nằm trong `UXUI.md`. Không tạo Master/ADR/QA-handoff Markdown mới.

## SPEC-PRODUCT-005 — Các quyết định còn cần chủ xác nhận

Các lựa chọn dưới đây không được mô hình tự biến thành chính sách tài chính đã duyệt:

| Quyết định | Đề xuất để chạy thử cục bộ | Khóa trước khi dùng thật |
|---|---|---|
| POLICY-CREDIT | Công thức giữ hạn mức tại SPEC-CRE-001; chặn nợ quá hạn trừ phê duyệt | R4 |
| POLICY-CUSTODY | Ghi hàng rời kho tại bàn giao, theo dõi đang đi đường | R6 |
| POLICY-BILLING | Ghi phải thu khi xác minh lượng tính tiền; không chờ khách đăng nhập | R6 |
| POLICY-COST | Giá vốn bình quân liên hoàn; chi phí trực tiếp phân loại duy nhất | R6/R7 |
| POLICY-PAYROLL | Quy tắc riêng từng người, chưa có cấu hình thì không sinh tiền | R8 |
| POLICY-COMMISSION | Chưa tự gán tỷ lệ/cơ sở hoa hồng | R8 |
| POLICY-INVOICE | Thời điểm/loại hóa đơn và provider cần người phụ trách thuế xác nhận | R11 |

Task cấu hình/giả lập được triển khai trước. Hành động thật chịu tác động phải `DEPENDENCY_LOCKED` cho đến khi có phê duyệt ghi trong `tasks.md`; không đánh dấu cả dự án đã đủ điều kiện vận hành.

---


# SPEC-006 — Khóa tuân thủ tài liệu cho Codex

## SPEC-DOC-001 — Tài liệu là hợp đồng triển khai

Trong phạm vi dự án này, Codex phải coi bộ tài liệu hiện hành là **hợp đồng bắt buộc**, không phải tài liệu tham khảo tùy chọn.

Thứ tự áp dụng:

```text
chỉ thị mới nhất của Owner trong cuộc làm việc hiện tại
→ Spec.md
→ UXUI.md khi chạm trải nghiệm/giao diện
→ plan.md
→ tasks.md
→ implementation.md chỉ để biết trạng thái thực tế
```

Các chỉ dẫn hệ thống/công cụ của môi trường vẫn có ưu tiên cao hơn khi bắt buộc về an toàn hoặc khả năng thực thi.

Codex không được dùng:
- sở thích kiến trúc cá nhân;
- "best practice" chung chung;
- code V1;
- convention của framework;
- suy đoán về tương lai;

để âm thầm thay đổi yêu cầu trong bộ tài liệu.

## SPEC-DOC-002 — Không tự phát minh yêu cầu

Nếu tài liệu không nói một behavior là bắt buộc, Codex không được tự biến behavior đó thành requirement.

Đặc biệt không tự thêm:
- bước duyệt;
- trạng thái;
- bảng;
- role;
- permission;
- service;
- queue;
- cache;
- provider;
- workflow;
- field bắt buộc;
- business rule;
- default tài chính;
- data retention;
- automation.

Chỉ được thêm chi tiết kỹ thuật nhỏ khi:
1. cần thiết để implementation chạy đúng contract;
2. không thay đổi observable behavior;
3. không mở rộng scope;
4. không tạo source of truth mới;
5. phù hợp ranh giới kiến trúc trong SPEC-510/520/530.

## SPEC-DOC-003 — Không tự sửa tài liệu để khớp code

Trong BUILD_ONLY, Codex không được tự sửa `Spec.md`, `UXUI.md`, `plan.md`, `tasks.md` để hợp thức hóa implementation.

Chỉ được:
- cập nhật trạng thái thực tế/bằng chứng trong `implementation.md`;
- cập nhật trạng thái task được phép trong `tasks.md` nếu plan yêu cầu.

Nếu implementation cần thay requirement/UX/roadmap để tiếp tục:
```text
DOC_CONFLICT
→ nêu ID bị ảnh hưởng
→ nêu lựa chọn tối thiểu
→ BLOCK phần chịu ảnh hưởng
→ chờ Owner quyết định
```

Không silent rewrite.

## SPEC-DOC-004 — Sai khác giữa code và tài liệu

Khi code hiện tại khác tài liệu:
- không mặc định code đúng;
- không mặc định tài liệu đúng một cách mù;
- đối chiếu chỉ thị Owner và source thực;
- nếu khác biệt là implementation defect → sửa code;
- nếu khác biệt cho thấy requirement cần đổi → `DOC_CONFLICT`, chờ Owner.

Legacy/V1 không được dùng làm lý do để giữ behavior trái V2.

## SPEC-DOC-005 — Không tự mở rộng scope khi thấy vấn đề lân cận

Codex có thể ghi nhận vấn đề lân cận nhưng không sửa ngoài task/lô đang mở trừ khi vấn đề đó:
- trực tiếp làm task hiện tại sai;
- tạo lỗi dữ liệu/quyền/nghiệp vụ nghiêm trọng;
- và có thể sửa tối thiểu trong cùng contract.

Nếu không, ghi `ADJACENT_FINDING` trong log và để nguyên.

## SPEC-DOC-006 — Mọi task phải truy được về contract

Trước khi sửa code, task phải xác định được:

```text
TASK
→ CONTEXT PACK
→ SPEC/UX contract liên quan
→ source thực bị ảnh hưởng
```

Nếu không xác định được requirement/risk nào biện minh cho thay đổi, không thực hiện thay đổi đó.

Không viết code "tiện thể", "chuẩn hóa luôn", "để sau dùng", hoặc "cho sạch kiến trúc".

## SPEC-DOC-007 — Default an toàn khi còn mơ hồ

Nếu mơ hồ chỉ liên quan chi tiết kỹ thuật nội bộ không observable, chọn phương án nhỏ nhất phù hợp SPEC-ARCH và ghi ngắn trong implementation khi đáng kể.

Nếu mơ hồ ảnh hưởng:
- tiền;
- số lượng;
- kho;
- công nợ;
- giá;
- quyền;
- dữ liệu khách;
- source of truth;
- state transition;
- migration;
- Production;
- observable UX chính;

thì không đoán:
```text
DOC_CONFLICT / HUMAN_ACTION_REQUIRED
```



## SPEC-DOC-008 — Quyết định đã khóa không được phân tích lại

Khi một quyết định đã được Spec/plan khóa và DOCSET không đổi, Codex phải dùng quyết định đó, không mở lại vòng so sánh phương án.

Ví dụ đã khóa:
- modular monolith;
- function-first;
- explicit FK cho source authoritative;
- không event bus/saga nội bộ;
- không generic repository/service framework;
- không cache/projection trước bằng chứng;
- không job/outbox trước nhu cầu async thật;
- Sapo-like interaction chứ không clone Sapo;
- acceptance tách khỏi BUILD_ONLY.

Không được lặp lại các câu hỏi kiểu “có nên dùng microservice/CQRS/generic repository/Redis/queue/cache không?” trừ khi Owner thay Spec hoặc bằng chứng thực tế chứng minh contract hiện tại không thể đáp ứng yêu cầu. Khi đó ghi `DOC_CONFLICT`, không tự đổi kiến trúc.

## SPEC-DOC-009 — Audit và bằng chứng được tái sử dụng cho tới khi bị vô hiệu

Một audit/check có bằng chứng gắn đúng phạm vi được phép tái sử dụng nếu không có trigger liên quan thay đổi. Không audit lại chỉ vì chuyển task/phase.

Trigger điển hình:
- tài liệu contract thay đổi → invalid document-context;
- AGENTS/CLAUDE/instruction áp dụng thay đổi → invalid instruction audit;
- deployment/CI/branch config thay đổi → invalid deploy guard;
- migration/schema thay đổi → invalid schema snapshot;
- RLS/grant/view/function/storage policy thay đổi → invalid security snapshot;
- source/test/dependency/config liên quan thay đổi → invalid check tương ứng;
- path move/delete → invalid path registry;
- release candidate đổi → invalid release QA của candidate cũ.

Không có trigger → dùng bằng chứng hiện có, không re-read/re-run/re-reason.

## SPEC-DOC-010 — Không tạo reasoning work nếu task đã đủ quyết định

Nếu task đã có đầu ra, bước làm, ranh giới, context pack, risk tag và source path đã registry thì không tạo thêm proposal/plan/architecture review trước khi code.

Flow chuẩn:

```text
load context cần thiết
→ resolve source
→ implement
→ focused checks
→ log delta
```

Không brainstorm nhiều phương án rồi chọn lại phương án Spec đã khóa.

# SPEC-010 — Product North Star

Hiền Xa ERP V2 phải giúp người dùng trả lời nhanh các câu hỏi vận hành:

1. Hôm nay việc gì cần xử lý?
2. Đơn nào đang chờ báo giá, xác nhận, giao hoặc thanh toán?
3. Công trình nào đang hoạt động?
4. Mỗi dòng hàng lấy từ kho hay nhà cung cấp?
5. Xe/người nào đang chịu trách nhiệm?
6. Đã giao/làm thực tế bao nhiêu?
7. Khách còn nợ bao nhiêu và khoản nào quá hạn?
8. Hiền Xa còn phải trả nhà cung cấp bao nhiêu?
9. Lương/hoa hồng nào đã được ghi nhận nhưng chưa trả?
10. Doanh thu, chi phí và lợi nhuận trong kỳ là bao nhiêu?
11. Hóa đơn nào cần phát hành/xử lý?
12. Vấn đề nào đang chặn tiến độ?

Nguyên tắc:

```text
DỮ LIỆU QUAN TRỌNG
→ NHÌN THẤY NGAY

CHI TIẾT
→ MỞ KHI CẦN

NGHIỆP VỤ QUAN TRỌNG
→ CÓ NGUỒN SỰ THẬT DUY NHẤT
```

---

# SPEC-020 — Phạm vi sản phẩm

## SPEC-020.1 — Lĩnh vực

Hệ thống phục vụ:

- vật liệu xây dựng;
- vận chuyển;
- máy móc;
- phá dỡ;
- đào móng;
- dịch vụ công trình;
- bán hàng;
- mua hàng;
- kho;
- giao hàng;
- công nợ;
- nhân công;
- thu nhập;
- hóa đơn;
- hội thoại nghiệp vụ.

## SPEC-020.2 — Ba bề mặt

```text
/admin
/work
/customer
```

### `/admin`

Dành cho:

- chủ doanh nghiệp;
- quản lý;
- kinh doanh;
- mua hàng;
- kho;
- điều phối;
- tài chính;
- nhân sự;
- quản trị hệ thống.

### `/work`

Dành cho:

- tài xế;
- công nhân;
- người vận hành máy;
- nhân sự hiện trường.

### `/customer`

Dành cho:

- khách hàng;
- chủ công trình;
- người đại diện khách;
- người nhận hàng được phép.

## SPEC-020.3 — Ngoài phạm vi

Không mặc định xây:

- hệ thống kế toán pháp định đầy đủ;
- khai thuế tự động;
- tự động nộp thuế;
- hệ thống lương pháp lý toàn diện;
- tối ưu tuyến đường tự quyết định thay con người;
- theo dõi GPS như nguồn trạng thái giao hàng;
- hội thoại như nguồn thay đổi nghiệp vụ;
- kiến trúc nhiều dịch vụ độc lập khi chưa cần.

---

# SPEC-030 — Thuật ngữ chuẩn

| Thuật ngữ | Nghĩa |
|---|---|
| Khách hàng | Bên mua hàng/dịch vụ |
| Công trình | Địa điểm hoặc site gắn với khách |
| Báo giá | Đề nghị thương mại có revision |
| Đơn bán | Cam kết bán đã tạo trong hệ thống |
| Đơn mua | Cam kết mua với nhà cung cấp |
| Phân bổ nguồn | Quyết định dòng hàng lấy từ kho hoặc nhà cung cấp |
| Phiếu giao | Đơn vị thực thi giao hàng |
| Phải thu | Khoản khách còn phải trả |
| Phải trả | Khoản Hiền Xa còn phải trả |
| Thanh toán | Giao dịch tiền đã được ghi nhận |
| Thông báo chuyển khoản | Tín hiệu do khách gửi, chưa phải thanh toán đã ghi nhận |
| Thu nhập | Quyền lợi đã phát sinh cho nhân viên/người lao động |
| Chi trả thu nhập | Giao dịch tiền trả cho thu nhập đã ghi nhận |
| Công việc | Đơn vị việc giao cho người thực hiện |
| Dịch vụ | Công việc ngoài bán vật liệu thuần |
| Bằng chứng | Ảnh/tài liệu/thông tin chứng minh hoạt động |
| Ảnh chụp dữ liệu | Giá trị nghiệp vụ được cố định tại thời điểm giao dịch |

---

# SPEC-040 — Quy tắc nguồn sự thật

## SPEC-040.1

Không duy trì hai nguồn sự thật có thể chỉnh sửa cho cùng một đại lượng.

Ví dụ cấm:

```text
customer.balance
+
AR ledger
```

nếu cả hai đều có thể cập nhật độc lập.

## SPEC-040.2

Dashboard là projection.

```text
DASHBOARD
=
READ MODEL
```

Không phải ledger riêng.

## SPEC-040.3

Các giá trị tổng hợp có thể cache/projection nhưng phải:

- tái tạo được từ nguồn gốc;
- không được chỉnh tay như nguồn chính;
- có cơ chế invalidation/rebuild;
- có thời điểm dữ liệu rõ nếu không hoàn toàn tức thời.

---

# SPEC-050 — Registry invariant bắt buộc

## SPEC-INV-001 — Báo giá đã gửi

Revision đã gửi không được sửa trực tiếp; muốn thay đổi phải tạo revision mới.

## SPEC-INV-002 — Đơn bán xác nhận

Xác nhận đơn bán không đồng nghĩa tự tạo phải thu.

## SPEC-INV-003 — Đơn mua xác nhận

Xác nhận đơn mua không đồng nghĩa tự tạo phải trả.

## SPEC-INV-004 — Giữ hàng

Reservation không làm giảm số lượng tồn thực tế.

## SPEC-INV-005 — Giao thẳng từ nhà cung cấp

Giao thẳng không tạo nhập/xuất kho giả.

## SPEC-INV-006 — Ba lượng giao

Nhà cung cấp giao, khách chấp nhận và lượng tính tiền là ba sự thật riêng.

## SPEC-INV-007 — Hoàn thành công việc

Worker DONE không tự động đồng nghĩa Delivery Confirmed.

## SPEC-INV-008 — Thu nhập

Earning không đồng nghĩa đã chi trả.

## SPEC-INV-009 — Thông báo chuyển khoản

PaymentNotice không đồng nghĩa Payment POSTED.

## SPEC-INV-010 — Tuyến đường

Route Recommendation không đồng nghĩa Assignment.

## SPEC-INV-011 — GPS

GPS ping không đồng nghĩa trạng thái giao hàng.

## SPEC-INV-012 — Hội thoại

Tin nhắn không phải lệnh nghiệp vụ.

## SPEC-INV-013 — Hóa đơn

Phát hành hóa đơn không tự tạo thêm phải thu nếu khoản phải thu đã tồn tại.

## SPEC-INV-014 — Khách nợ

Phải thu khách hàng không phải chi phí hoạt động.

## SPEC-INV-015 — Nợ nhà cung cấp

Phải trả nhà cung cấp không phải chi phí hoạt động.

## SPEC-INV-016 — Thu tiền

Tiền nhận không mặc định bằng doanh thu.

## SPEC-INV-017 — Chi trả nhà cung cấp

Thanh toán phải trả không tạo chi phí mới lần hai.

## SPEC-INV-018 — Số tiền

Tiền và phép tính tài chính không dùng số dấu phẩy động nhị phân.

## SPEC-INV-019 — Số lượng quan trọng

Số lượng/costing quan trọng phải dùng biểu diễn chính xác.

## SPEC-INV-020 — Phân quyền

Ẩn nút trên giao diện không được coi là kiểm soát quyền.

## SPEC-INV-021 — Khách hàng

Khách A không được đọc dữ liệu khách B.

## SPEC-INV-022 — Idempotency

Retry cùng lệnh nghiệp vụ không được nhân đôi hậu quả.

## SPEC-INV-023 — Concurrency

Hai thao tác cạnh tranh không được phá invariant tồn kho/thanh toán/claim.

## SPEC-INV-024 — Provider bên ngoài

Timeout không được suy luận thành thất bại chắc chắn nếu trạng thái ngoài hệ thống chưa biết.

## SPEC-INV-025 — Production

Không được tự thay đổi Production nếu chưa có lệnh rõ của Owner.


---

# SPEC-100 — Customer & Site

## SPEC-CUS-001 — Customer

Customer lưu:

- mã khách;
- tên;
- loại khách;
- trạng thái;
- điện thoại;
- email nếu có;
- địa chỉ chính;
- mã số thuế nếu có;
- nhân viên kinh doanh phụ trách;
- tier;
- điều khoản thanh toán mặc định;
- hạn mức tín dụng;
- ghi chú nội bộ có phân quyền.

Không lưu mutable debt balance như nguồn sự thật.

## SPEC-CUS-002 — Công trình và địa chỉ linh hoạt

Một khách có nhiều công trình. Công trình lưu tên, địa chỉ hiển thị đầy đủ, người nhận/điện thoại, tọa độ tùy chọn, ghi chú đường vào/xe/khung nhận, trạng thái và sales phụ trách nếu khác khách.

Các cấp địa giới là dữ liệu tùy chọn có phiên bản nguồn; không bắt buộc cấu trúc quận/huyện cố định trong form. Giữ nguyên địa chỉ lịch sử trên chứng từ. Customer/site identity khác nhau; không gộp hai khách chỉ vì cùng điện thoại.

## SPEC-CUS-003 — Snapshot

Khi đơn/báo giá/giao hàng được phát hành, các trường quan trọng phải snapshot để lịch sử không bị thay đổi bởi việc sửa Customer/Site sau này.

Ví dụ:

- tên khách;
- tên công trình;
- địa chỉ giao;
- người nhận;
- số điện thoại;
- thông tin xuất hóa đơn;
- sales phụ trách nếu policy cần.

## SPEC-CUS-004 — Customer 360

Trang chi tiết khách phải tổng hợp bằng read model:

- hồ sơ;
- công trình;
- báo giá;
- đơn bán;
- giao hàng;
- phải thu;
- thanh toán;
- hóa đơn;
- hội thoại/tài liệu được phép.

Không tạo một shadow ledger riêng.

**FB2 Đợt 4 (17/10/2026, kiểu KiotViet):** đầu trang khách có tên, mã, điện thoại, địa chỉ, nhóm giá và các nút Tạo đơn, Ghi thu,
Tạo dịch vụ, Sửa (popup), + Công trình (popup) theo quyền; 5 chỉ số: Nợ hiện tại, Nợ quá hạn, Hạn mức còn lại — đọc bằng RPC chỉ đọc
`customer_credit_summary(target_customer_id)` (`security definer`, chỉ người có `finance.ar.read` ở chi nhánh của khách, không cấp `anon`;
trả đúng số của `customer_credit_exposure` + tổng phải thu `OVERDUE` từ `receivable_read`, không lưu thêm gì) — và Tổng bán (đơn
`CONFIRMED`/`CLOSED`), Đơn đang giao dở (`CONFIRMED` chưa `FULFILLED`/`CLOSED_REMAINDER`) từ `sales_order_read`. Nội dung chia tab thật
`?tab=`: Thông tin & công trình │ Đơn bán │ Giao hàng │ Công nợ & thanh toán │ Giá riêng │ Tài liệu; tab chỉ hiện khi có quyền và chỉ
đọc dữ liệu của tab đang mở. Trang chi tiết NCC cùng cách: chỉ số Còn phải trả, Quá hạn (từ `payable_read`), Tổng mua (đơn đã xác nhận,
khi có quyền xem giá mua), Đơn mua đang mở, Điều khoản; tab Thông tin & liên hệ │ Đơn mua │ Nhập kho & giao thẳng │ Công nợ & thanh toán │
Bảng giá mua. Không tạo sổ phụ.

---

# SPEC-110 — Catalog, Material, UOM

## SPEC-CAT-001 — Material/Product

Tối thiểu:

- mã;
- tên;
- nhóm;
- trạng thái;
- đơn vị cơ sở;
- cho phép bán/mua;
- quy cách nếu có;
- metadata vận hành cần thiết.

## SPEC-CAT-003 — Xóa và ngừng dùng danh mục (D18, 17/10/2026)

- Danh mục (vật tư, nhóm, đơn vị, khách hàng, công trình, NCC, kho, xe, máy) có **Xóa** và **Ngừng dùng / Dùng lại** (thay ô tick "Đang sử dụng").
- Xóa chỉ thực hiện khi chưa có chứng từ hay dữ liệu nghiệp vụ nào dùng bản ghi (đơn, phiếu giao, tồn kho, công nợ, thanh toán, hội thoại…);
  database chặn bằng khóa ngoại và không xóa gì (`catalog_record_in_use`). Thiết lập riêng của bản ghi (đơn vị bán, giá bán, giá mua, ngưỡng tồn,
  công trình chưa dùng, quyền cổng khách) xóa theo. Đã dùng thì chỉ ngừng dùng; lịch sử không đổi. Cùng quyền như tạo/sửa; có audit.

## SPEC-CAT-002 — Hàng cùng loại / biến thể vật tư (D11, 16/10/2026)

- Một **hàng cùng loại** (vd "Xi măng Bút Sơn", "Thép Hòa Phát") có tên và 1–3 **thuộc tính** (vd Mác; Phi; Màu). Mỗi **loại (biến thể)** là
  **một vật tư đầy đủ**: mã riêng (sửa được), tồn kho, đơn vị bán, giá và lịch sử riêng; kho, giá, bán, mua, giao hàng không đổi cách tính.
- Mỗi loại ghi giá trị cho đúng các thuộc tính của hàng (1–40 ký tự); hai loại của cùng một hàng không được trùng giá trị thuộc tính.
- Tạo/sửa trong **một lệnh nguyên tử** (`save_material_variant_group`, quyền `catalog.manage`; đặt giá kèm theo cần `pricing.manage`): tạo/đổi tên/
  ngừng hàng, tạo loại mới từ mẫu chung (nhóm vật tư, đơn vị cơ sở, đơn vị bán, cho phép bán/mua) qua lệnh danh mục và lệnh đơn vị tính hiện có,
  thêm vật tư có sẵn (đang dùng, chưa thuộc hàng khác) vào hàng, đổi giá trị thuộc tính, bỏ một vật tư ra khỏi hàng (vật tư giữ nguyên).
  Sửa hàng phải khớp phiên bản đã đọc (đổi tên thuộc tính thì mọi loại phải được ghi lại theo tên mới trong cùng lệnh).
- Giá kèm khi tạo loại là giá chung theo từng đơn vị (SPEC-PRI-005); công cụ chia giá theo quy đổi (SPEC-UOM-004) mặc định **không làm tròn** và
  hiện giá đã chia trước khi lưu.

## SPEC-UOM-001 — Đơn vị

Transaction không dùng đơn vị dạng free text.

Ví dụ:

```text
kg
tấn
tạ
bao
m³
cây
bó
cuộn
viên
chuyến
giờ
ngày
```

## SPEC-UOM-002 — Conversion

Các loại:

```text
EXACT
PACKAGING
ESTIMATED
MEASURED
VEHICLE_LOAD
```

Mỗi conversion phải biết:

- from unit;
- to unit;
- factor/ratio chính xác;
- loại conversion;
- material/product scope nếu không global;
- effective period nếu cần;
- độ chính xác/làm tròn;
- nguồn đo nếu là estimated/measured.

## SPEC-UOM-003

`VEHICLE_LOAD` là quy tắc lập kế hoạch/tải xe, không mặc định là chuyển đổi vật lý chính xác.

## SPEC-UOM-004 — Đơn vị tính của vật tư (D7, 16/10/2026)

- Mỗi vật tư có **một đơn vị cơ sở** (không đổi sau khi tạo); tồn kho chỉ là một con số theo đơn vị cơ sở.
- **Đơn vị bán** là quy đổi theo vật tư "1 <đơn vị> = tử/mẫu <đơn vị cơ sở>", loại Chính xác / Đóng gói / Ước lượng / Đo thực tế, được phép
  tính tiền; Ước lượng và Đo thực tế bắt buộc ghi nguồn (3–500 ký tự). Tỉ lệ tối đa 6 chữ số thập phân, không làm tròn ngầm.
- Thêm/ngừng đơn vị bán và đặt giá chung từng đơn vị lưu **một lần nguyên tử** (`save_material_units`): quy đổi đi qua lệnh danh mục hiện có,
  giá đi qua lưu giá hàng loạt (SPEC-PRI-005). Chỉ đặt giá cho đơn vị cơ sở hoặc đơn vị bán đang dùng. Đổi tỉ lệ = ngừng bản cũ + thêm bản mới;
  dòng chứng từ đã lập giữ snapshot quy đổi (SPEC-UOM-002). Quyền: quy đổi cần `catalog.manage`, giá cần `pricing.manage`.
- "Chia giá theo quy đổi" (D11) chỉ là công cụ gợi ý trên giao diện từ giá của một đơn vị, làm tròn 1.000 / 100 / không; giá lưu luôn là số VND
  tuyệt đối của từng đơn vị.
- D25 (18/10/2026): form đơn vị cho chọn chiều nhập mỗi dòng — "1 <đơn vị cơ sở> = x <đơn vị>" (mặc định) hoặc "1 <đơn vị> = x <đơn vị cơ sở>";
  ứng dụng đổi sang tử/mẫu của "1 <đơn vị> = tử/mẫu <đơn vị cơ sở>" (dữ liệu không đổi). Nhập "1 tấn = 3 bao" mà 1/3 không chính xác tới 6 chữ số
  thì báo lỗi và đề nghị nhập chiều kia. Thẻ "Đơn vị & quy đổi" và bảng đơn vị hiện câu số lớn trước ("1 Tấn = 20 Bao", dòng phụ "1 Bao = 0,05 Tấn";
  "≈" khi không chia hết).

---

# SPEC-120 — Pricing

## SPEC-PRI-001 — Precedence

```text
Customer + Material
→ Customer + Material Group
→ Customer Tier
→ Default
```

## SPEC-PRI-002 — Hiệu lực

Rule giá có:

- hiệu lực từ;
- hiệu lực đến nếu có;
- version;
- trạng thái.

## SPEC-PRI-003 — Snapshot

Giá đã chốt trong Quote/SO phải snapshot:

- giá;
- đơn vị;
- rule source;
- rule version;
- override;
- người override;
- lý do override nếu policy yêu cầu.

Policy giá mới không rewrite giao dịch cũ.

## SPEC-PRI-004 — Override

Override giá cần:

- quyền;
- reason khi dưới ngưỡng/sàn;
- audit.

## SPEC-PRI-005 — Thiết lập giá chung hàng loạt (D4, 15/10/2026)

- Chỉ áp cho giá chung (`Default`) theo vật tư + đơn vị tính gốc. Giá theo khách, nhóm vật tư của khách và hạng khách vẫn sửa từng phiên bản như SPEC-PRI-002.
- Một lần lưu: tối đa 500 dòng, một lý do (3–500 ký tự), một ngày hiệu lực không trước hôm nay theo giờ kinh doanh; cần quyền quản lý giá.
- **Nguyên tử:** một dòng không hợp lệ hoặc đã bị người khác đổi phiên bản thì không dòng nào được ghi; người dùng tải lại để xem giá mới nhất.
- Mỗi dòng tạo phiên bản mới qua đúng lệnh lưu giá đơn lẻ (version, khóa lạc quan, audit từng dòng) và lô có thêm một audit + receipt. Gửi lại cùng mã thao tác trả lại kết quả cũ, không ghi lần hai; cùng mã thao tác nhưng nội dung khác bị từ chối.
- Cách mặc định vẫn là nhập giá bán cuối (SPEC-CONFIG-002). Tăng/giảm theo % hoặc theo số tiền tính trên **giá bán hiện tại** (không phải trên giá vốn) và chỉ là công cụ tính giá mới trên giao diện; giá được lưu luôn là số VND nguyên dương tuyệt đối. Làm tròn mặc định đến 1.000 đ, có lựa chọn 100 đ hoặc không làm tròn; người dùng thấy giá mới và chênh lệch từng dòng trước khi lưu. Dòng chưa có giá hiện tại không được điều chỉnh theo %/số tiền, chỉ nhập giá trực tiếp.
- Giá vốn chỉ hiển thị cho người có quyền xem giá vốn. Chứng từ đã chốt giữ snapshot (SPEC-PRI-003).
- Bổ sung D11 (16/10/2026): bảng giá hàng loạt chọn được **bảng giá của một nhóm giá khách** (Sỉ, Đại lý…) và lưu giá nhóm (`CUSTOMER_TIER`)
  theo đúng quy tắc trên; giá chung hiện kèm để so sánh. Giá của các đơn vị bán khác hiện tham khảo, sửa ở "Đơn vị tính & giá" của vật tư.

## SPEC-PRI-006 — Nhóm giá khách (D11, 16/10/2026)

- Nhóm giá khách là danh mục theo chi nhánh (mã, tên, đang dùng); quản lý cần `pricing.manage`. Mã là định danh, viết hoa A–Z 0–9 _ -, không đổi.
- `customers.tier_code` và giá nhóm (`pricing_rules.customer_tier_code`) chỉ nhận mã là nhóm của cùng chi nhánh (khóa ngoại trong database).
- Khách không thuộc nhóm nào dùng giá chung (giá lẻ). Ngừng nhóm: không gán cho khách mới, không đặt giá nhóm mới; khách đang ở nhóm giữ nguyên.
- Thứ tự ưu tiên giá không đổi (SPEC-PRI-001).

## SPEC-PRI-007 — Giảm giá đơn bán (D18, 17/10/2026)

- Giống KiotViet: **giảm giá từng dòng** (bấm đơn giá → "Đơn giá · Giảm giá [VND | %] · Giá bán") và **giảm giá cả đơn** ở khung tổng
  ("Tổng tiền hàng · Giảm giá [VND | %] · Khách cần trả"). Cần `pricing.manage` (cấp cho nhân viên qua vai trò tùy biến).
- Giảm tính theo **mỗi đơn vị**: `unit_price_vnd` là giá bán sau giảm (số đồng nguyên, > 0), `list_unit_price_vnd` giữ giá trước giảm (giá
  bảng giá đã kiểm theo SPEC-PRI-001/003 hoặc giá thủ công đã duyệt), `discount_unit_vnd` = chênh lệch; `discount_mode`/`discount_value` lưu
  đúng điều đã nhập cho dòng. Vì vậy tổng đơn, giữ hạn mức, phiếu giao, xác minh công nợ lũy kế và trả hàng dùng giá sau giảm mà không đổi công thức.
- Giảm % làm tròn mỗi đơn vị về đồng (HALF_UP); giảm phải nhỏ hơn đơn giá, phần trăm dưới 100.
- Giảm cả đơn được chia vào giá đơn vị các dòng theo tỉ lệ thành tiền, khớp đúng số đồng khi số lượng cho phép; nếu giá đơn vị nguyên đồng
  không đạt đúng số yêu cầu, màn hình báo số giảm thực tế và phần lệch trước khi lưu. Đơn lưu kiểu + giá trị giảm cả đơn đã nhập để sửa lại.
- Đơn không giảm giá lưu và băm lệnh y như trước (bản ghi thao tác cũ vẫn phát lại được).

---

# SPEC-130 — Credit

## SPEC-CRE-001 — Công thức hạn mức có thể kiểm thử

Đề xuất mặc định để chủ duyệt trước dùng thật:

`exposure = phải_thu_chưa_tất_toán + cam_kết_bán_đã_chốt_chưa_chuyển_thành_phải_thu - tiền_trả_trước_đủ_điều_kiện_đã_giữ_cho_cam_kết`

Không cộng thêm "billable chưa AR": xác minh tính tiền tạo AR trong cùng giao dịch nên không có khoảng hở này trong luồng chuẩn. Tiền đã phân bổ vào AR đã làm giảm AR, không được trừ lần nữa. Khoản khách báo đã chuyển chưa phải tiền đã ghi nhận.

Xác nhận đơn: khóa vị trí hạn mức của khách, tính phần tăng thêm và giữ cam kết. Giao một phần: chuyển phần cam kết đó sang AR nguyên tử; không tính cả hai. Hủy phần chưa giao: giải phóng đúng phần cam kết. Hai đơn cạnh tranh phải khóa chung khách chứ không chỉ khóa từng đơn.

Mặc định chưa có hạn mức được duyệt: không tự coi là vô hạn. Cho lưu nháp; xác nhận bán chịu phải được người có quyền duyệt. Nhà cung cấp không bị áp hạn mức phải trả trong phạm vi hiện tại.

## SPEC-CRE-002 — Quá hạn và ngoại lệ

Mặc định chạy thử: chặn xác nhận bán chịu mới nếu có khoản quá hạn chưa giải quyết. Chủ có quyền cấp ngoại lệ cho đúng lần xác nhận, ghi lý do và ảnh chụp số dư/hạn mức tại thời điểm đó. Không có ngoại lệ vĩnh viễn ngầm, không để giao diện tự quyết định chặn/cho phép. Chính sách khác phải được duyệt theo SPEC-PRODUCT-005.

## SPEC-CRE-003 — Override

Override cần:

- permission;
- actor;
- reason;
- timestamp;
- captured exposure;
- captured limit.

---

# SPEC-140 — Quotation

> **Trạng thái từ 15/10/2026: TẮT** (quyết định Owner D1). Không có lối vào Báo giá ở menu, hồ sơ khách, trang đích, cổng khách; route nội bộ/cổng khách và PDF báo giá trả "không tìm thấy"; lệnh tạo/sửa/gửi/hủy/chấp nhận báo giá bị server từ chối. Bảng, dữ liệu lịch sử, RPC và quyền trong database **giữ nguyên, không xóa**. Đơn bán cũ có nguồn báo giá vẫn mở được (nguồn hiển thị dạng chữ). Trước khi phát hành, Owner xác nhận không còn báo giá `SENT` đang chờ khách. Bật lại cần quyết định Owner mới và QA lại toàn bộ SPEC-140; nội dung bên dưới là hợp đồng khi được bật lại.

## SPEC-QUO-001 — Thực thể

Quotation:
- customer;
- site;
- owner/sales;
- currency;
- current revision;
- status.

QuotationRevision:
- revision number;
- lines;
- totals;
- commercial terms;
- snapshots;
- created by;
- sent at;
- accepted at nếu có.

## SPEC-QUO-002 — States

Tối thiểu:

```text
DRAFT
SENT
ACCEPTED
EXPIRED
SUPERSEDED
CANCELLED
```

## SPEC-QUO-003 — Transition

```text
DRAFT → SENT
SENT → ACCEPTED
SENT → EXPIRED
SENT → SUPERSEDED
DRAFT/SENT → CANCELLED theo quyền/policy
```

Không sửa revision SENT.

## SPEC-QUO-004 — Chấp nhận đúng phiên bản, không bắt khách có tài khoản

Chấp nhận phải tham chiếu đúng revision còn hiệu lực. Khách có tài khoản dùng command chuẩn ở portal; khi khách đồng ý qua điện thoại/Zalo, nhân viên có quyền ghi nhận kênh, người xác nhận, thời gian và ảnh/tài liệu liên quan khi có. Không giả chữ ký điện tử.

Command kiểm revision chưa hết hạn/superseded, quyền ghi nhận và liên kết khách. Hai acceptance cùng nguồn/revision trả lại cùng kết quả. Chấp nhận báo giá không tự xác nhận SO hoặc vượt hạn mức; tạo/chốt SO vẫn là command riêng với xác nhận rõ.
---

# SPEC-150 — Sales Order

## SPEC-SO-001 — Các trục trạng thái độc lập

- `commercial_state`: `DRAFT → CONFIRMED → CLOSED`; `DRAFT/CONFIRMED → CANCELLED` chỉ khi không có hậu quả đã ghi nhận chưa xử lý. Đơn giao một phần chỉ hủy phần còn lại, không xóa phần đã giao.
- `fulfillment_state` là kết quả suy ra: `NOT_STARTED / PARTIAL / FULFILLED / CLOSED_REMAINDER`. Không cho sửa tay.
- `payment_state` là kết quả suy ra từ AR và phân bổ: `NOT_DUE / UNPAID / PARTIAL / PAID`. Chưa phát sinh AR là `NOT_DUE`, không phải `PAID`.
- Tiền trả trước và số dư chưa phân bổ hiển thị riêng, không ghép `OVERPAID/ADVANCE` thành trạng thái tùy ý.

Hoàn thành giao không đồng nghĩa đã thu tiền; đóng đơn thương mại không xóa nghĩa vụ công nợ.

## SPEC-SO-002 — Confirm

Confirm phải:

- validate customer/site;
- validate lines;
- snapshot price/UOM;
- run credit policy;
- record actor/time;
- idempotent.

Không tự tạo AR chỉ vì CONFIRMED.

Bổ sung D6 (16/10/2026): khi tạo đơn, nút chính là "Xác nhận đơn" — mở bảng kiểm tra (khách, công trình, các dòng, tổng tiền, nợ hiện tại và
quá hạn khi có quyền phải thu) rồi mới lưu nháp + xác nhận bằng hai mã thao tác riêng như trước. Bị chặn hạn mức thì đơn ở nháp, báo lý do và
giữ lối duyệt vượt hạn mức. "Lưu nháp" là lối phụ.

## SPEC-SO-003 — Source relation

SO có thể:
- sinh từ Quote revision;
- tạo trực tiếp nếu quyền/policy cho phép.

Nếu từ Quote:
- giữ reference exact revision.

---

# SPEC-160 — Purchasing & Sourcing

## SPEC-PRI-008 — Giá mua tự tính theo quy đổi (D25, 18/10/2026)

- Tạo giá mua cho một đơn vị (vd 1 tấn 1.600.000 ₫) có ô "Tự tính giá cho các đơn vị khác theo quy đổi" (mặc định bật): server tính giá các đơn vị
  thanh toán còn hiệu lực của vật tư theo quy đổi về đơn vị cơ sở (làm tròn tới đồng), bỏ qua đơn vị đã có giá hiệu lực của cùng NCC trùng thời gian,
  rồi lưu tất cả qua `save_purchase_price_rules(branch, rules, reason, op)` — một transaction, mỗi giá đi qua `save_purchase_price_rule` hiện có
  (cùng quyền, kiểm tra và audit; mã thao tác con suy ra), một giá lỗi thì không lưu giá nào; replay trả lại cùng kết quả.
- Ô "Đơn vị giá" chỉ liệt kê đơn vị của vật tư đã chọn. Đơn mua vẫn khớp giá theo đúng đơn vị đặt (SPEC-PUR-001).

## SPEC-PUR-001 — Purchase Order

PO có:
- supplier;
- lines;
- price/cost snapshots;
- expected dates;
- destination/source relation;
- state;
- audit.

### Warehouse destination address

PO mới có `destination_mode=WAREHOUSE` chỉ được tạo khi `public.warehouses.address_text` của kho active, đúng branch có nội dung sau chuẩn hóa trim (bao gồm tab/newline). NULL, rỗng, chỉ khoảng trắng bị từ chối tại command/RPC; client không cung cấp snapshot thay nguồn. Kho danh mục vẫn được phép chưa có địa chỉ.
Snapshot `public.purchase_orders.destination_address_snapshot` lấy từ kho trong transaction. DRAFT đổi kho hoặc chủ động cập nhật địa chỉ từ kho cần quyền, expected version, reason và audit; sửa quantity/terms không tự đổi snapshot. DRAFT thiếu snapshot có nội dung không được CONFIRM; sửa địa chỉ master rồi cập nhật snapshot của chính DRAFT đó. CONFIRMED không đồng bộ theo master, không tự sửa lịch sử. Giao thẳng vẫn lấy địa chỉ công trình khách.
Validation thất bại không để PO/lines/allocation/success receipt dở dang. Retry intent chưa commit sau bổ sung địa chỉ được tạo một lần; retry intent đã commit cùng payload trả kết quả cũ sau kiểm quyền hiện tại, không thay snapshot; payload khác cùng key phải conflict.

## SPEC-PUR-002

PO Confirmed không tự tạo AP.

## SPEC-PUR-003 — Gửi đơn mua cho NCC (D17, 18/10/2026)

- Đơn mua đã xác nhận có "Gửi NCC qua Zalo": trên điện thoại mở bảng chia sẻ với PDF đơn mua và nội dung soạn sẵn (số đơn, hàng, nơi giao,
  ngày giao, người liên hệ) để chọn Zalo → chat NCC; trên máy tính chép nội dung, tải PDF và mở `zalo.me/<SĐT NCC>`; phụ: email (mailto).
  Việc gửi do người dùng làm; ứng dụng chỉ ghi nhận.
- D25: ngay sau khi xác nhận, trang đơn mua hiện "bước tiếp theo": Gửi NCC, Nhận hàng (kho) hoặc NCC giao thẳng (phiếu riêng), Tạo đơn mua mới cùng NCC.
  Form nhận hàng có nút "Nhận đủ" điền sẵn số còn lại của mọi dòng; vẫn phải bấm "Xác nhận nhận hàng" (không tự ghi).
- `record_purchase_order_sent(po, channel ZALO|EMAIL|OTHER, op)`: chỉ đơn CONFIRMED, quyền `purchasing.create` hoặc `purchasing.confirm`,
  idempotent theo mã thao tác, audit. Bảng `purchase_order_dispatches` (RLS, đọc theo `purchasing.read`). Danh sách đơn mua hiện
  "Đã gửi NCC 10:30 · Zalo" / "Chưa gửi". Zalo ZNS tự động: chưa làm (cần Zalo OA đã xác minh và phí theo tin).

## SPEC-SRC-001 — Supply Mode

Mỗi SalesOrderLine có thể có một/nhiều allocation:

```text
WAREHOUSE
SUPPLIER_DIRECT
SUPPLIER_TO_WAREHOUSE
```

## SPEC-SRC-002 — Split

Một line được phép split theo quantity nếu tổng allocation không vượt quantity cần nguồn trừ các trường hợp policy cho phép.

## SPEC-SRC-003 — Supplier Direct

Phải có:
- supplier;
- customer/site destination;
- quantity;
- expected date;
- source PO nếu có.

Không tạo warehouse receipt/issue giả.

## SPEC-SRC-004 — Tự phân nguồn khi xác nhận đơn (D19, 18/10/2026)

- Xác nhận đơn (nội bộ, hoặc duyệt đơn khách) xong thì cùng thao tác gọi `auto_source_sales_order(order, op)` với mã thao tác suy ra từ mã xác nhận;
  lỗi phân nguồn không hủy việc xác nhận (trang đơn báo "Chưa phân nguồn xong" + nút "Tự phân nguồn"). Cài đặt chi nhánh: bật/tắt tự phân nguồn,
  kho mặc định, "chi phí một chuyến" (trống = luôn dùng tồn trước).
- Lời giải là hàm thuần `private.solve_order_sourcing(order)` cho **cả đơn**: tồn có thể bán của từng kho (trừ phần đã giữ và phần đã phân cho đơn
  khác đang mở); bước 1 chọn kho phục vụ được nhiều dòng nhất (hòa thì kho mặc định); bước 2 từng dòng: kho đủ → kho; kho hết → NCC; kho đủ một phần
  → so "tách (kho + NCC phần còn lại)" với "cả dòng NCC" theo tiền mua NCC + chuyến phát sinh × chi phí một chuyến; NCC = giá mua hiệu lực thấp nhất
  cho vật tư + đơn vị (bằng nhau → bản mới nhất); không có giá mua → dùng hết tồn, phần còn lại "Thiếu nguồn — chưa có NCC/giá mua" và báo mua hàng.
  Mỗi dòng kèm lý do tiếng Việt. `order_sourcing_plan(order)` chỉ đọc (xem trước).
- Thực hiện: phân bổ kho; phần NCC gom theo NCC thành đơn mua **nháp** giao thẳng công trình (chạy bằng quyền `purchasing.create` của chính
  người xác nhận; thiếu quyền → dòng "Chờ chọn nguồn" + thông báo `sales_order.needs_purchase`); dòng kho gom theo kho thành phiếu giao rồi tự
  điều phối (SPEC-DEL-008). Kết quả lưu `sales_order_sourcing_runs`; gọi lại cùng mã thao tác trả kết quả cũ.
- Duyệt đơn mua nháp giao thẳng → tự lập **phiếu NCC giao thẳng** (đầu mối = NCC, giờ = ngày giao dự kiến của đơn mua). Phiếu này có nút
  **"NCC đã giao"** (`submit_supplier_delivery_done`) cho nhân viên phụ trách: nhập lượng nhận (để trống = đủ), người nhận, ảnh; rồi xác minh như phiếu thường.
- Trang đơn: khung "Nguồn hàng" chỉ hiện kết quả (kho, NCC + đơn mua, thiếu nguồn) và lý do; đổi tay vẫn dùng các lệnh hiện có.

---

# SPEC-170 — Inventory

## SPEC-INVTRY-001 — Ledger

Nguồn sự thật tồn kho là movement ledger + các invariant liên quan.

Không cho người dùng sửa `on_hand` trực tiếp.

## SPEC-INVTRY-002 — Movement

Movement tối thiểu lưu:

- material;
- warehouse;
- quantity exact;
- UOM/base quantity;
- movement type;
- source type/id;
- occurred_at;
- actor/system;
- idempotency key/source uniqueness;
- cost basis khi liên quan.

## SPEC-INVTRY-003 — Reservation

Reservation:
- không giảm on-hand;
- giảm available;
- có source;
- có quantity;
- có trạng thái;
- release/consume rõ.

```text
available = on_hand - active_reserved
```

## SPEC-INVTRY-004 — Concurrency

Hai reservation đồng thời không được oversubscribe stock.

Phải test bằng transaction/concurrent sessions thực.

## SPEC-INVTRY-005 — Stock Count

Flow:

```text
open count
→ cutoff/reference
→ physical count
→ variance
→ reason/evidence
→ approval
→ adjustment movement
```

Không sửa balance trực tiếp.

**FB2 Đợt 5 (17/10/2026, kiểu KiotViet):** phiếu kiểm nhập **nhiều dòng một lần** bằng
`record_stock_count_lines_batch(target_stock_count_id, count_lines jsonb, expected_count_version, operation_id)` — tối đa 500 dòng
`{material_id, counted_base_quantity, adjustment_unit_cost_vnd?, reason?}`, không trùng vật tư; gọi lại `record_stock_count_line` cho từng
dòng trong **một transaction** (giữ nguyên quyền `inventory.count`, kiểm cutoff/biến động sau mốc chốt, số lượng chính xác, lý do khi lệch,
fingerprint căn cứ và lịch sử quan sát; mã thao tác con suy ra từ mã của lô), một dòng lỗi thì cả lô không ghi; receipt + audit
`stock_count.lines_batch_recorded`. "Hoàn thành & cân bằng kho" = lưu các dòng mới/đã sửa rồi `approve_stock_count` hiện có (quyền
`inventory.adjust`); chỉ vật tư đã đếm được điều chỉnh. **Hủy phiếu** `cancel_stock_count(target_stock_count_id, expected_count_version,
cancel_reason, operation_id)`: chỉ phiếu `OPEN`, cần lý do ≥ 3 ký tự, chuyển `CANCELLED`, **không** sinh phát sinh kho; dòng đã đếm giữ làm
lịch sử; audit `stock_count.cancelled` kèm lý do. Phiếu đã cân bằng không hủy được.

## SPEC-INVTRY-006 — Costing

Ban đầu dùng Moving Weighted Average nếu phù hợp dữ liệu.

Cost history không rewrite sau khi transaction đã finalized theo policy.

---

# SPEC-180 — Delivery

## SPEC-DEL-001 — Delivery là thực thể riêng

Một SO có thể có nhiều Delivery.

Một Delivery có thể chứa nhiều lines.

## SPEC-DEL-002 — Trạng thái thực thi và kết quả giao tách nhau

`execution_state`: `PLANNED → ASSIGNED → DISPATCHED → ARRIVED → RESULT_SUBMITTED → VERIFIED`.
`result_kind`: `FULL / PARTIAL / FAILED`, chỉ có sau khi gửi kết quả. `CANCELLED` chỉ trước bàn giao/rời kho; sau rời kho dùng kết quả thất bại/thu hồi và xử lý hàng đang đi đường.

`RESULT_SUBMITTED` là thợ báo; `VERIFIED` là người có quyền xác minh. Thiếu bước ARRIVED do mạng yếu có thể nộp kết quả từ DISPATCHED kèm thời gian thực và lý do, không tự tạo dữ liệu GPS. Giao một phần được VERIFIED rồi tạo phiếu giao tiếp cho phần còn lại; không nhảy vòng lại trạng thái cũ.

Không dùng `PARTIAL` đồng thời làm một bước trên trục thời gian và kết quả khối lượng.

## SPEC-DEL-003 — Quantities

Tách:

```text
planned_quantity
actual_quantity
accepted_quantity
billable_quantity
```

## SPEC-DEL-004 — Proof

Có thể gồm:

- ảnh;
- người nhận;
- chữ ký/thông tin xác nhận nếu cần;
- tọa độ;
- timestamp;
- ghi chú;
- document.

Proof mặc định private trừ khi policy cho phép customer xem.

## SPEC-DEL-006 — Lập phiếu giao một bước từ đơn đã xác nhận (FB2 Đợt 3, 16/10/2026)

- `create_delivery_for_order` (một giao dịch, idempotent): với mỗi dòng chọn, lượng nhập **theo đơn vị đã bán** được đổi sang đơn vị cơ sở
  bằng tỉ lệ đã chụp trên dòng đơn (phải đúng tối đa 6 số lẻ, không làm tròn); dùng phân nguồn kho đã có của đúng kho đó (tăng thêm nếu còn
  thiếu) hoặc tạo phân nguồn mới qua `upsert_supply_allocation`; rồi `create_delivery_from_allocations` (giữ tồn khả dụng) và, nếu chọn,
  `assign_delivery_scheduled` (người giao + xe + khung giờ). Mọi quy tắc cũ (quyền, sức chứa phân nguồn, giữ tồn, trùng lịch, tải xe) giữ nguyên;
  lỗi ở bất kỳ bước nào thì không có gì được ghi. Một kho mỗi phiếu; dòng NCC giao thẳng vẫn theo luồng hiện có.
- `order_delivery_plan` chỉ đọc (cần `delivery.create`): lượng phải giao, các phân nguồn và phần đã dùng của từng phân nguồn, để điền sẵn
  "Còn phải giao" theo kho được chọn.

## SPEC-DEL-007 — Điều phối lập phiếu, nhiều điểm giao một người, phân xe tự giao việc (FB3 A1–A4, D21, 18/10/2026)

- **Quyền (A1):** `create_delivery_for_order` chỉ cần `delivery.create`. Nguồn kho lấy khi lập phiếu đi qua `private.allocate_warehouse_source`
  (cùng kiểm tra nhánh WAREHOUSE của `upsert_supply_allocation`: kho đang dùng cùng chi nhánh với đơn, lượng chính xác, sức chứa phân nguồn,
  version của phân nguồn đã có), hàm nội bộ chỉ gọi từ trong lệnh lập phiếu. Nguồn NCC và lệnh "Chọn nguồn kho" vẫn cần `purchasing.create`.
- **Thời gian mỗi điểm giao (D21):** bảng `branch_operation_settings` (một dòng mỗi chi nhánh: `stop_minutes` 5–720, `version`; chưa có dòng =
  60 phút), RLS bật, thành viên chi nhánh đọc, `anon` không có quyền; chỉ ghi qua `save_branch_operation_settings(branch, {"stop_minutes"},
  version_đã_đọc, op)` với `roles.manage`, idempotent, audit. Phiếu không lưu giờ kết thúc chiếm `scheduled_at + stop_minutes` (thay 4 giờ) trong
  mọi kiểm tra trùng lịch người/xe của phiếu giao và việc cổng thợ; giờ kết thúc đã lưu giữ nguyên.
- **Giao ngay / Hẹn giờ:** phân công trong `create_delivery_for_order` nhận `schedule_mode`: `NOW` → giờ bắt đầu là lúc sớm nhất từ khi bấm mà
  người và xe cùng rảnh đủ một điểm giao (xếp nối tiếp sau việc đang có, cùng cửa sổ bận mà kiểm tra trùng lịch dùng); `AT` → đúng giờ đã chọn,
  trùng thì từ chối và gửi kèm giờ trống gần nhất (hint `next_free_at=<UTC>`) để giao diện đề xuất "Hẹn lúc …". Lệnh trả giờ đã xếp. Trùng lịch
  khi phân xe trên trang phiếu giao cũng báo giờ trống gần nhất.
- **Phân xe là giao việc (A2):** `assign_delivery`, `assign_delivery_scheduled` và `update_delivery_receiver` gọi `private.sync_delivery_work_item`:
  phiếu có người giao nội bộ mà chưa có việc → tạo việc DIRECT, CLAIMED cho người đó như `publish_work_item` (người phân xe có `delivery.assign`
  là đủ, không cần `work.manage`); đổi người khi việc chưa bắt đầu → việc chuyển theo như trước; thiếu tên, SĐT hoặc địa chỉ người nhận → chưa tạo,
  trang phiếu hiện điều còn thiếu, bổ sung người nhận xong thì việc tự tạo. Nút "Giao việc qua cổng thợ" chỉ còn cho phiếu cũ chưa có việc.
- **Hộp lập phiếu (A4):** chọn *Giao ngay* hoặc *Hẹn ngày giờ* (mặc định ngày khách yêu cầu nếu chưa qua); mặc định phân xe luôn, chỉ có một
  người/một xe thì chọn sẵn; chặn gửi khi dòng vượt tồn khả dụng của kho hoặc vượt phần còn phải giao, chỉ rõ dòng và link "Đặt NCC giao thẳng"
  khi người dùng có quyền mua hàng; lỗi hiện ngay trong hộp, không rời trang đơn. Giờ bàn giao lên xe trên trang phiếu giao là lúc bấm.

## SPEC-DEL-008 — Tự điều phối, bảng điều phối, thợ từ chối việc (D22, C2, 18/10/2026)

- Danh mục Xe có **"Tài xế mặc định"** (`vehicles.default_driver_employee_id`, nhân viên đang làm có quyền nhận việc). Cài đặt vận hành chi nhánh
  thêm chế độ điều phối Tắt / Gợi ý / Tự động (mặc định Tự động), giờ làm việc (mặc định 07:00–18:00).
- `private.auto_dispatch_delivery`: chạy khi phiếu giao từ kho được lập mà chưa phân xe (lập tay hoặc do tự phân nguồn). Ứng viên = cặp xe đang dùng +
  tài xế mặc định, phải qua mọi kiểm tra của `assign_delivery_scheduled` (quyền, sức chở, trùng lịch). Chọn giờ rảnh sớm nhất từ giờ khách cần, rồi
  ít phiếu nhất trong ngày, rồi đang chở cùng công trình/khách, rồi mã xe; quá giờ làm việc thì sang ngày kế. Gán qua `assign_delivery_scheduled`
  bằng quyền `delivery.assign` **của chính người thao tác** (không mượn quyền); không có quyền hoặc không có ai phù hợp → phiếu "Chờ điều phối" +
  thông báo `delivery.waiting_dispatch`. Chế độ Gợi ý chỉ lưu đề xuất (`delivery_dispatch_proposals`), người điều phối bấm "Áp dụng".
- Trang **Điều phối** (`/admin/dispatch?day=`): hàng "Chờ điều phối", cột theo tài xế với các phiếu trong ngày theo giờ, nút "Tự chia việc"
  (`auto_dispatch_day`) và "Áp dụng" gợi ý; 390 px dạng danh sách.
- **Thợ từ chối việc (C2):** `decline_portal_work_item(work, reason, version, op)` khi việc đã nhận nhưng chưa bắt đầu và phiếu chưa bàn giao lên xe:
  đóng phân công, phiếu về PLANNED, ghi người từ chối vào `delivery_dispatch_exclusions` (lần tự điều phối sau bỏ qua người này cho phiếu đó),
  thông báo `work.declined` cho người có `delivery.assign` kèm lý do. Lịch sử phân công giữ nguyên.

## SPEC-DEL-009 — Sức chở theo quy đổi, bước tiếp theo sau xác nhận đơn (D25, 18/10/2026)

- Xe chỉ cần "Sức chở tối đa" + đơn vị (vd 5 tấn); ghi chú căn cứ là tùy chọn. Kiểm tải (`assert_delivery_resources`, `assert_vehicle_actual_load`)
  quy đổi lượng hàng (đơn vị cơ sở) sang đơn vị sức chở qua `private.capacity_factor`: đọc quy đổi đã duyệt **hai chiều**, tối đa 3 bước, ưu tiên
  quy đổi riêng của vật tư; loại Đo thực tế vẫn cần nguồn; Ước lượng không dùng. Không quy đổi được thì vẫn từ chối (`vehicle_capacity_conversion_missing`,
  kèm tên vật tư) — không đoán (SPEC-UOM-002).
- Hộp "Lập phiếu giao" ghi cạnh xe "chở tối đa 5 tấn ≈ 100 bao Xi măng" (`vehicle_capacity_by_order`) và chặn gửi khi các dòng chọn vượt sức chở;
  Lộ trình cảnh báo tải cả chuyến bằng `vehicle_load_for_deliveries`. Chặn thật vẫn ở bàn giao lên xe.
- Ngay sau khi xác nhận đơn bán, trang đơn hiện khung "bước tiếp theo": phiếu giao đã tự lập (xe, tài xế, giờ, đã giao việc qua cổng thợ) hoặc
  "chờ phân xe", đơn mua NCC giao thẳng chờ duyệt, số khách còn phải trả, nút Thu tiền / In đơn / Tạo đơn mới cùng khách. Chỉ là lối tắt tới màn
  hình có sẵn; quyền và kiểm tra không đổi.

## SPEC-DEL-005 — Xác minh giao hàng và ghi sổ đúng một lần

`verifyDelivery` khóa phiếu, kiểm tra phiên bản, lượng bàn giao, lượng chấp nhận/tính tiền và bằng chứng; rồi cùng một giao dịch:
1. Ghi kết quả đã xác minh và revision nguồn tính tiền.
2. Với hàng từ kho: xử lý đúng lượng giao thành công từ hàng đang đi đường theo SPEC-OPS-001. Không trừ kho lần nữa nếu đã bàn giao ra xe.
3. Tạo AR và doanh thu vận hành theo lượng/giá tính tiền; chuyển cam kết hạn mức tương ứng sang AR.
4. Ghi giá vốn/chi phí trực tiếp từ nguồn đã có; không coi thiếu giá vốn là 0.
5. Ghi audit và hoàn tất idempotency.

AP của NCC giao thẳng có căn cứ độc lập `verifySupplierFulfillment`; không bắt chờ khách đồng ý mới ghi nghĩa vụ đã xác minh với NCC. Nếu người duyệt thực hiện cả hai cùng màn, dùng hai căn cứ rõ và một giao dịch khi phù hợp. Không đồng bộ vòng qua HTTP giữa hai module.

Ảnh nằm trong Storage không thể commit nguyên tử cùng SQL: chỉ liên kết object đã upload/xác minh thuộc phiên tải lên hợp lệ; lỗi upload không cho ghi VERIFIED thiếu bằng chứng bắt buộc.
---

# SPEC-190 — Finance

## SPEC-FIN-001 — Phạm vi

Operational finance gồm:

```text
AR
AP
Payment
PaymentAllocation
Advance
Expense
Cash/Bank
Reconciliation
Reversal
```

Không mặc định là hệ thống sổ cái pháp định đầy đủ.

## SPEC-FIN-002 — Phải thu và nguồn phát sinh

AR được ghi đúng một lần theo revision nguồn trong ma trận SPEC-OPS-001: giao hàng đã xác minh tính tiền; dịch vụ đã duyệt khối lượng tính tiền; điều chỉnh được duyệt; số dư đầu kỳ có loại riêng.

Mỗi khoản có `customer_id`, `site_id?`, `branch_id`, nguồn/revision, tiền gốc, hạn trả và các mục tăng/giảm/phân bổ bất biến. `outstanding` và `state` là giá trị suy ra hoặc cache tái tạo được, không cập nhật độc lập.

Khóa duy nhất ở nguồn phát sinh ngăn hai actor dùng hai idempotency key khác nhau tạo hai AR cho cùng lần giao. Chỉ thêm ảnh hóa đơn không tạo AR mới.

## SPEC-FIN-003 — Phải trả và nguồn phát sinh

AP ghi từ nhận hàng vào kho đã xác minh; căn cứ NCC giao thẳng đã duyệt; hoặc chi phí/dịch vụ mua đã được ghi nhận. Chỉ tạo PO, nhận file hóa đơn đầu vào hay thanh toán trước chưa phải ghi AP.

Một chứng từ nhận và hóa đơn NCC có thể cùng chỉ về một nghĩa vụ, không cộng hai lần. NCC được thanh toán theo lượng/giá đã được Hiền Xa xác minh, không theo lượng khách chấp nhận một cách mặc định. Không áp hạn mức AP; vẫn kiểm người duyệt, hạn trả, bằng chứng và đối soát.

## SPEC-FIN-004 — Thu/chi và đối soát

`posting_state`: `DRAFT / POSTED / REVERSED`. `reconciliation_state`: `UNMATCHED / PARTIAL / MATCHED` là trục riêng, không phải bước ghi sổ thứ hai.

POSTED ghi tiền đúng một lần; đối soát ngân hàng không ghi tiền lại. REVERSED thêm giao dịch đảo và đảo phân bổ tương ứng, không xóa lịch sử. Cùng pháp nhân/currency mới được phân bổ; nếu khác chi nhánh cần quyền cả hai và chính sách kế toán đã duyệt.

**Sổ quỹ theo kỳ (FB2 Đợt 6, 17/10/2026):** `cashbook_period_summary(target_branch_id, from_at, to_at, target_account_id?)` — RPC chỉ đọc,
quyền `finance.ar.read` như `cashbook_summary`, cùng nguồn `payment_read` và quy tắc dấu (mọi phiếu đã ghi sổ và phiếu đảo; thu cộng, chi trừ):
quỹ đầu kỳ = tổng trước `from_at`, tổng thu / tổng chi = phiếu trong `[from_at, to_at)`, tồn quỹ cuối kỳ = tổng trước `to_at`; số trả về dạng chuỗi.
Không lưu thêm sổ nào.

## SPEC-FIN-005 — Allocation

PaymentAllocation many-to-many.

Không được:
- allocate vượt Payment available;
- allocate vượt target outstanding;
- tạo duplicate allocation do retry.

## SPEC-FIN-006 — Reversal

Reversal:
- không xóa lịch sử;
- tạo trạng thái/effect đảo phù hợp;
- audit actor/reason;
- khôi phục outstanding đúng.

## SPEC-FIN-007 — Advance

Customer advance và Supplier advance là thực thể/position riêng, không biểu diễn đơn giản bằng AR/AP âm.

D25 (18/10/2026) — khách trả trước khi lập đơn bán: form đơn bán mới có ô "Khách trả trước" (số tiền, phương thức Tiền mặt / Chuyển khoản / Thẻ /
Khác, quỹ nhận — mặc định quỹ tiền mặt cho tiền mặt, tài khoản ngân hàng cho cách khác) cho người có `finance.payment.post`. Sau khi lưu đơn,
ứng dụng ghi `post_payment` RECEIPT với toàn bộ số tiền là **ứng trước của khách** (không phân bổ, vì công nợ chỉ sinh khi xác minh giao),
tham chiếu "Trả trước đơn SO-…", thời điểm cố định lúc mở form, mã thao tác suy ra từ mã lưu đơn (gửi lại không ghi hai lần). Ghi thu lỗi không
hủy đơn, chỉ báo để kiểm Sổ quỹ. Trang đơn hiện "Khách đã trả trước X (REC-…) · Còn phải trả Y". Khi đã giao và có công nợ, trừ khoản trả trước bằng
phân bổ phiếu thu đã ghi ở Công nợ phải thu của khách (có sẵn); luật công nợ và hạn mức không đổi.

## SPEC-FIN-008 — Payment Notice

PaymentNotice:
- customer;
- amount khai báo;
- time;
- method/reference;
- evidence;
- status review.

Không tác động AR trước khi Payment được POSTED.

**D8 (Owner 16/10/2026, áp dụng FB2 Đợt 6 17/10/2026): Báo chuyển khoản tắt hẳn trên mọi bề mặt**, như báo giá (D1): cờ
`PAYMENT_NOTICES_ENABLED = false` (`src/lib/features.ts`); `/admin/payment-notices` trả 404 thật (rewrite trước định tuyến), menu và trang đích
mặc định bỏ mục này, cổng khách `/customer/debts` không còn danh sách/form gửi thông báo, API gửi thông báo trả 404, lệnh rà soát/nối/sửa nối
bị từ chối trước mọi gọi DB. Dữ liệu, RPC và quyền giữ nguyên; bật lại cờ là khôi phục. Tiền khách chuyển được ghi thu tại Công nợ.

---

# SPEC-200 — Profitability & Expense

## SPEC-PRO-001 — Revenue

Revenue dashboard/report = doanh thu thực tế/billable được ghi nhận theo policy.

Không lấy Payment received làm Revenue.

## SPEC-PRO-002 — Direct Cost

Direct cost có thể gồm khi attributable:
- vật liệu;
- supplier direct purchase;
- vận chuyển trực tiếp;
- bốc xếp trực tiếp;
- nhiên liệu trực tiếp;
- direct labor;
- direct service cost.

## SPEC-PRO-003 — Lợi nhuận gộp quản trị

`gross_profit = net_revenue - direct_cost`. Trong sản phẩm này, direct_cost bao gồm giá vốn và chi phí trực tiếp thực hiện đơn/dịch vụ theo SPEC-PRO-002; nhãn đầy đủ là "Lợi nhuận gộp quản trị" hoặc có chú giải tương ứng.

Đây không phải cam kết tương đương dòng lợi nhuận gộp trên báo cáo pháp định. Khi chi phí bắt buộc chưa đủ, metric là `INCOMPLETE`, không trả một số chắc chắn bằng cách mặc định giá vốn bằng 0. Có thể hiển thị ước tính tách nhãn, không trộn với số đã ghi nhận.

## SPEC-PRO-004 — Operating Expense

Opex là chi phí vận hành không đã nằm trong Direct Cost.

## SPEC-PRO-005 — Operating Profit

```text
Operating Profit = Gross Profit - Operating Expense
```

## SPEC-PRO-006 — Margin

```text
Operating Margin = Operating Profit / Revenue
```

Revenue = 0 → hiển thị `—`.

## SPEC-PRO-007 — Không double count

Payment:
- thay đổi cash/AR;
- không tạo Revenue lần hai.

AP payment:
- thay đổi cash/AP;
- không tạo Expense lần hai.

---

# SPEC-210 — Dashboard

## SPEC-DASH-001 — KPI

Dashboard `/admin` phải hỗ trợ (hàng KPI theo quyết định Owner D2, 15/10/2026):

- Revenue (Doanh thu);
- Total Cost (Tổng chi phí) = giá vốn trực tiếp + Operating Expense; chỉ READY khi cả hai thành phần READY;
- Net Profit (Lợi nhuận ròng) = Operating Profit hiện có = Revenue − giá vốn trực tiếp − Operating Expense;
- Net Margin (Biên lợi nhuận ròng) = Operating Margin.

Gross Profit vẫn được snapshot tính nhưng không còn hiển thị ở hàng KPI Tổng quan (trước đây đây là chỗ duy nhất hiển thị); đưa lại vào Báo cáo cần Owner quyết định. Không có công thức thứ hai: các nhãn mới đọc đúng chỉ số của snapshot tài chính hiện có.

## SPEC-DASH-002 — Balances

Phải hỗ trợ:

- Customer Receivable;
- Supplier Payable;
- Salary Payable;
- Sales Commission Payable.

## SPEC-DASH-003 — Top lists

Phải có:
- khách/công trình đang nợ;
- nhà cung cấp đang phải trả;
- chi phí theo nhóm;
- hoa hồng theo nhân viên.

## SPEC-DASH-004 — Global filter

Tối thiểu:
- thời gian;
- chi nhánh;
- sales;
- customer;
- site;
- loại hoạt động.

## SPEC-DASH-005 — Kỳ phát sinh và số dư tại thời điểm

Múi giờ kinh doanh là `Asia/Ho_Chi_Minh`; lưu thời gian kỹ thuật UTC. Khoảng kỳ là `[from_inclusive, to_exclusive)`. Chọn tháng hiện tại không có nghĩa có dữ liệu tương lai: thời điểm số dư bị chặn ở `min(kết_thúc_kỳ, server_now)` và hiển thị "tính đến ...".

Ledger có `effective_at` (ngày nghiệp vụ) và `posted_at` (ngày hệ thống ghi nhận). Báo cáo dùng cả ngày nghiệp vụ và `knowledge_cutoff` để tái lập; bút toán nhập lùi không âm thầm đổi báo cáo đã chốt. Số dư lịch sử phải xét lịch sử phân bổ/đảo tại ngày xem, không lọc bằng `status=OPEN` hôm nay.

Ví dụ AR 100 triệu phát sinh 31/8, thu 60 triệu ngày 5/9: xem đến 31/8 vẫn là 100 triệu; đến 5/9 là 40 triệu.

## SPEC-DASH-006 — Direct drill-down

Click số nợ phải mở exact source/detail với current filter context.

## SPEC-DASH-007 — Read model

Dashboard không được aggregate bằng cách tải hàng trăm dòng detail rồi tính ở client.

Ưu tiên:
- một snapshot read logic chính;
- top-N;
- lazy detail.

## SPEC-DASH-009 — Biểu đồ Thu / Chi / Lợi nhuận (D3, 15/10/2026)

- Biểu đồ đường ba chuỗi theo thời gian: **Thu** = doanh thu ghi nhận; **Chi** = Total Cost; **Lợi nhuận** = Thu − Chi = Net Profit. Cùng công thức với KPI SPEC-DASH-001.
- Dùng đúng bộ lọc Dashboard (SPEC-DASH-004) và `knowledge_cutoff`; đổi bộ lọc thì KPI và biểu đồ đổi cùng.
- Mỗi điểm là một kỳ con `[from, to)`: theo ngày nếu kỳ ≤ 31 ngày, theo tuần nếu ≤ 217 ngày, còn lại theo tháng; tối đa 31 điểm, kỳ dài hơn bị từ chối với thông báo rõ. Không có điểm cho thời gian tương lai.
- Mỗi điểm tính bằng cùng read logic snapshot (SPEC-DASH-007) với cùng kiểm quyền và `quality`; tổng các điểm READY bằng KPI cả kỳ.
- Điểm không READY không vẽ thành 0 (SPEC-REPORT-002); chuỗi không áp dụng thì ẩn kèm lý do.

## SPEC-DASH-008 — Không đưa lên homepage

Không:
- Working Capital KPI;
- profitability lifecycle control;
- finalize/reopen profitability;
- order-level profitability table.

---

# SPEC-220 — Workforce

## SPEC-WRK-001 — WorkItem

WorkItem là orchestration cho công việc cần người thực hiện.

Không thay Delivery/ServiceJob làm source of truth.

## SPEC-WRK-002 — Assignment mode

```text
DIRECT
POOL_CLAIM
```

## SPEC-WRK-003 — Claim

POOL_CLAIM:
- atomic;
- one winner;
- retry same worker idempotent;
- không double assignment.

## SPEC-WRK-004 — States

Có thể gồm:

```text
AVAILABLE
CLAIMED
IN_PROGRESS
BLOCKED
DONE
VERIFIED
CANCELLED
```

Các state monitoring như heartbeat/expired có thể tồn tại nhưng không được tự gây hậu quả nghiệp vụ nguy hiểm.

## SPEC-WRK-005 — Worker submit

Worker có thể gửi:
- actual quantity;
- note;
- proof;
- receiver;
- timestamp.

DONE có thể cần VERIFIED.

---

# SPEC-230 — Compensation

## SPEC-COMP-001 — Rule types

Có thể hỗ trợ:

```text
FIXED_MONTHLY
PER_JOB
PER_TRIP
PER_HOUR
PER_SHIFT
PER_DAY
PER_TON
PER_M3
PER_BAG
PER_UNIT
BONUS
ADJUSTMENT
SALES_COMMISSION
```

## SPEC-COMP-002 — Flow

```text
verified basis
→ rule
→ EarningEvent
→ approval
→ payable
→ payment/allocation
```

## SPEC-COMP-003

EarningEvent phải snapshot:
- source;
- basis;
- rule/version;
- rate;
- calculated amount;
- approved amount.

## SPEC-COMP-004 — Salary payable

Chỉ approved liability mới lên payable.

Không lấy estimated productivity làm khoản phải trả.

## SPEC-COMP-005 — Sales commission

Dashboard đọc outstanding approved `SALES_COMMISSION` earning.

Dashboard không tự tính commission ad hoc.

---

# SPEC-240 — Service Jobs

## SPEC-SRV-001

Flow:

```text
Customer
→ Service Quote/Request
→ ServiceJob
→ Machine/Operator
→ WorkLog
→ Verification
→ Billable fact
→ AR
→ Payment
→ Earning
```

## SPEC-SRV-002

Tách:
- actual work;
- billable work;
- compensable work.

## SPEC-SRV-003 — Danh mục loại dịch vụ (D23, 18/10/2026)

- Bảng `service_types` theo chi nhánh: mã (`^[A-Z0-9_-]{2,24}$`, duy nhất trong chi nhánh), tên, đơn vị tính (chuyến, giờ, ngày, ca, m³, km… —
  gõ hoặc chọn gợi ý), đơn giá mặc định VND (được để trống), cần xe / cần máy / không (`resource_kind` `VEHICLE` / `MACHINE` / `NONE`), đang dùng.
  RLS bật, đọc khi có `service.read` hoặc `service.manage`, `anon` không có quyền. Lưu và xóa qua `save_catalog_record` / `delete_catalog_record`
  (kind `service_types`, quyền `service.manage`); loại đã có việc dùng thì không xóa được, chỉ ngừng dùng (SPEC-CAT-003).
- `schedule_service_job(...)`: cùng kiểm tra như `create_service_job`; loại phải đang dùng và cùng chi nhánh (`invalid_service_type`). Việc chụp tên,
  đơn vị và đơn giá của loại (`service_jobs.service_type_id`, `unit_price_vnd`); đổi loại sau đó không đổi việc đã lập. Loại không cần xe/máy thì
  không gắn được xe hay máy; loại cần xe thì không gắn máy và ngược lại (`service_resource_mismatch`). Việc cũ giữ loại gõ tự do, không có đơn giá;
  `create_service_job` giữ nguyên.
- Giao diện: Dịch vụ → "Loại dịch vụ" (danh mục popup như UX-160); lập lịch chọn loại từ danh sách, "+ Thêm loại" mở popup; chỉ hiện ô Xe hoặc
  Máy theo loại. Lúc xác minh, ứng dụng gợi ý "Giá trị tính khách" = khối lượng tính khách × đơn giá (làm tròn tới đồng, nửa đồng làm tròn lên);
  người xác minh vẫn nhập/sửa số cuối. D9 giữ nguyên (dịch vụ là chứng từ riêng).

---

# SPEC-250 — Worker Portal

## SPEC-WORKPORTAL-001

Routes logic:
- home/my work;
- work pool;
- job detail;
- proof/result;
- earnings;
- profile;
- messages khi cần.

## SPEC-WORKPORTAL-002

Mobile-first.

Không hiển thị ERP table dày đặc.

## SPEC-WORKPORTAL-003

Không yêu cầu tài xế thao tác nguy hiểm khi đang lái.

## SPEC-WORKPORTAL-004 — Báo "Đã giao" kèm ảnh, việc theo giờ, ảnh trên phiếu giao (FB3 A3/A3b/A5, 18/10/2026)

- `submit_portal_delivery_done(work_item, lines | null, receiver_name, note, evidence_ids, version việc/phiếu/phân công, op)`: chỉ người đang được
  giao việc; việc CLAIMED hoặc IN_PROGRESS (chưa bắt đầu thì tính là bắt đầu), phiếu DISPATCHED hoặc ARRIVED (đang đi đường thì tính là tới nơi,
  không bắt gõ lý do). `lines` null = giao đủ theo lượng kho đã bàn giao lên xe; có `lines` = lượng thợ nhập, không vượt lượng đã lên xe. 0–5 ảnh
  tải qua cổng thợ cho đúng việc đó; có giao hàng (đủ hoặc thiếu) bắt ít nhất 1 ảnh, không giao được bắt lý do; người nhận để trống thì lấy từ phiếu.
  Việc → DONE, phiếu chờ xác minh như `submit_portal_delivery_result`; idempotent theo mã thao tác, đối chiếu các version.
- Hàng chưa bàn giao lên xe: nút mờ "Chờ kho bàn giao hàng lên xe". Ảnh được thu nhỏ trên điện thoại (cạnh dài tối đa 1600 px, JPEG) trước khi tải.
  Thợ thấy lượng theo đơn vị đã bán kèm đơn vị cơ sở (ví dụ "60 bao (3.000 kg)") theo tỉ lệ đã chụp trên dòng đơn.
- `worker_portal_snapshot`: việc của thợ xếp theo giờ hẹn (Hôm nay / Sắp tới, tối đa 30); bể việc nhận được giới hạn 50 việc trong 14 ngày tới.
- Nội bộ (A3b): trang phiếu giao có khung "Ảnh giao hàng" dạng lưới ảnh thu nhỏ (ảnh thợ gửi và ảnh nội bộ), bấm để phóng to; ảnh lấy qua route
  kiểm quyền `/api/evidence/[id]/download`, tệp PDF hiện nút mở tệp. Bước xác minh kết quả dùng cùng lưới ảnh.
- Hiệu năng (A5): index cho kiểm tra phân nguồn, giữ tồn và trùng lịch (`20261018130000_delivery_indexes`); trang đơn và trang phiếu giao đọc các
  phần dữ liệu độc lập song song.

---

# SPEC-260 — Customer Portal

## SPEC-CUSTPORTAL-001

Customer được phép:
- xem báo giá;
- accept/request revision;
- xem order;
- xem delivery;
- xem debt;
- gửi PaymentNotice;
- xem tài liệu/hóa đơn được phép;
- gửi yêu cầu;
- nhắn tin.

## SPEC-CUSTPORTAL-002

Authorization:

```text
AuthUser
→ CustomerPortalMembership
→ Customer
```

Không tin `customer_id` do browser gửi.

## SPEC-CUSTPORTAL-003

Customer không xem:
- internal margin;
- supplier cost;
- employee payroll;
- internal-only notes;
- dữ liệu khách khác.

## SPEC-CUSTPORTAL-004 — Tài khoản cổng khách, tự đăng ký, đăng nhập bằng số điện thoại (D14, C1, 18/10/2026)

Bổ sung SPEC-SEC-001 theo quyết định Owner: khách mới được tự đăng ký; doanh nghiệp tạo tài khoản cho khách từ trang khách hàng.
- **Doanh nghiệp tạo:** Khách hàng 360 → "Tài khoản cổng khách" (`customers.manage`): email **hoặc số điện thoại** + mật khẩu tạm + quyền (Chủ tài
  khoản / Kế toán / Người nhận hàng). Tài khoản tạo đã xác nhận, cờ `app_metadata.hx_must_change_password`; gắn khách bằng
  `grant_customer_portal_access` (từ chối tài khoản nhân viên, khách ngừng giao dịch, quyền đang hoạt động trùng); gắn lỗi thì xóa tài khoản vừa tạo.
  Không gửi email: màn hình trả nội dung để gửi khách qua Zalo. Có "Đặt lại mật khẩu" (mật khẩu tạm mới, bắt đổi lại) và "Thu hồi"
  (`revoke_customer_portal_access`, có lý do, giữ lịch sử). `customer_portal_accounts(customer)` liệt kê tài khoản (`customers.read`).
- **Lần đăng nhập đầu bằng mật khẩu tạm** (khách hoặc thợ): proxy chuyển mọi trang `/customer/*` hoặc `/work/*` tới trang đổi mật khẩu của cổng đó
  cho tới khi đổi xong (cờ được xóa, phiên làm mới).
- **Tự đăng ký** (`/customer/register`, cần bật "Allow new users to sign up" ở Supabase Auth): tên, SĐT, địa chỉ giao, email, mật khẩu.
  `register_portal_customer` (đăng nhập rồi, không phải nhân viên, chưa có quyền khách) tạo khách `source = SELF_REGISTERED` mã `KH-000123`, cá nhân,
  giá chung, chưa có hạn mức; công trình "Địa chỉ giao chính"; quyền OWNER; thông báo `customer.self_registered` (kèm gợi ý nếu trùng SĐT với khách
  cũ — không tự gộp). Chi nhánh nhận = `company_profile.portal_branch_id`, hoặc chi nhánh duy nhất đang hoạt động. Phải xác nhận email trước thì
  hồ sơ được tạo ở lần đăng nhập đầu (một mã thao tác cố định cho mỗi tài khoản). Không có email → nhờ cửa hàng tạo tài khoản bằng SĐT.
- **Đăng nhập bằng số điện thoại (C1):** ô "Email hoặc số điện thoại" ở 3 trang đăng nhập; số Việt Nam được chuẩn hóa thành tên đăng nhập nội bộ
  `<số>@sdt.hienxavlxd.com` (không gửi thư tới đó), mọi chỗ hiển thị đều hiện số điện thoại. Mời nhân viên bằng SĐT chỉ dùng link kích hoạt.
  Quên mật khẩu với tài khoản SĐT → báo nhờ quản lý đặt lại.

## SPEC-CUSTPORTAL-005 — Khách tự đặt hàng, doanh nghiệp duyệt (D15, D16, 18/10/2026)

Bổ sung SPEC-CUSTPORTAL-001: Chủ tài khoản và Kế toán được **đặt hàng**; Người nhận hàng chỉ theo dõi giao nhận.
- `customer_portal_catalog(customer?, search, limit)`: vật tư đang bán theo từng đơn vị bán được phép thanh toán, **giá áp cho chính khách này**
  (cùng thứ tự ưu tiên giá của đơn nội bộ); đơn vị không có giá thì không hiện; chỉ báo "Còn hàng / Đặt trước" — không lộ số tồn, giá vốn, giá khách khác.
- `submit_portal_order(customer, site | new_site, requested_at, lines[{material, uom, quantity}], note, op)`: giá tính ở server, mỗi dòng qua
  `private.assert_commercial_line`; địa chỉ mới thành công trình của khách; tạo đơn **DRAFT** `order_channel = CUSTOMER_PORTAL` ("Chờ duyệt", không thêm
  trạng thái), `portal_note`, `submitted_by`; idempotent; thông báo `order.portal_submitted` cho `orders.confirm`. Chưa giữ hạn mức, tồn hay đặt NCC.
- Khách hủy khi còn chờ duyệt: `cancel_portal_order(order, reason, op)`; thông báo `order.portal_cancelled`. Khách thấy dòng hàng (giá chỉ Chủ tài
  khoản/Kế toán), địa chỉ, ghi chú, lý do hủy, trạng thái "Chờ duyệt / Đã duyệt / Đang giao / Đã giao / Đã hủy".
- **Duyệt** = xác nhận đơn hiện có (giữ hạn mức, duyệt vượt hạn mức như đơn nội bộ) + tự phân nguồn (SPEC-SRC-004): đủ kho → phiếu giao từ kho tự điều
  phối; thiếu → đơn mua NCC giao thẳng nháp. Sửa trước khi duyệt dùng sửa bản nháp; **Từ chối** = hủy đơn có lý do (khách thấy lý do).
- Nội bộ: băng "Đơn khách tự đặt — chờ duyệt" trên trang đơn, nút "Duyệt đơn", lọc "Khách đặt · Chờ duyệt", nhắc ở Tổng quan.
- D26 (Owner 18/10/2026): màn "Đặt hàng" dùng **cùng bộ soạn đơn với "Tạo đơn bán" nội bộ** (ô tìm hàng bấm là xổ danh sách theo nhóm, hàng cùng
  loại đứng chung dưới tên sản phẩm; bảng dòng hàng có đơn vị, − / + số lượng, đơn giá của khách, thành tiền, xóa dòng; khung giao tới; tổng tiền dính
  dưới; popup xem lại). Mỗi dòng của hàng cùng loại có ô **"Loại"** đổi sang loại khác (vd PCB30 → PCB40) giữ đơn vị nếu loại kia bán theo đơn vị đó.
  `customer_portal_catalog` trả thêm `variant_group_id`, `variant_name`, `variant_label` (khách không đọc trực tiếp bảng hàng cùng loại; nhóm ngừng dùng
  thì không hiện như nhóm) và tìm được theo tên sản phẩm chung. Giá, quyền, kiểm tra và luồng duyệt không đổi; giá luôn tính lại ở server.

---

# SPEC-270 — Routing

## SPEC-ROUTE-001

RoutePlan là đề xuất.

Không mutate Delivery assignment trước Apply.

## SPEC-ROUTE-002

Inputs có thể:
- delivery;
- location;
- time window;
- capacity;
- vehicle;
- driver;
- priority.

## SPEC-ROUTE-003

Provider bản đồ phải có timeout/fallback.

Provider lỗi không khóa nghiệp vụ Delivery.

---

# SPEC-280 — GPS

## SPEC-GPS-001

GPS là telemetry.

Không là nguồn trạng thái Delivery.

## SPEC-GPS-002

Fleet view ưu tiên current active position.

Không tải full GPS history cho refresh thông thường.

## SPEC-GPS-003

Customer mặc định không được xem raw coordinate liên tục nếu không có policy rõ.

---

# SPEC-290 — Messaging

## SPEC-MSG-001

Core:

```text
Conversation
Participant
Message
```

Database là source of truth.

Realtime chỉ là transport.

## SPEC-MSG-002

Message send cần idempotency nếu UI có thể retry.

## SPEC-MSG-003

Conversation list dùng projection:
- last message;
- unread count;
- updated time.

Không aggregate toàn lịch sử message mỗi lần mở list.

---

# SPEC-300 — Electronic Invoice

## SPEC-EINV-001 — Phạm vi

Hóa đơn điện tử: trong phạm vi.

Khai thuế tự động: ngoài phạm vi.

## SPEC-EINV-002 — Luồng hóa đơn độc lập nghĩa vụ lập hóa đơn

Sự kiện hàng hóa/dịch vụ → ghi nhận nghĩa vụ cần lập hóa đơn theo cấu hình đã được người phụ trách thuế/provider xác nhận → lập nháp → kiểm tra/duyệt → lưu yêu cầu bền vững → provider → đối soát trạng thái → chứng từ.

Không mặc định chờ tiền về, chờ khách đăng nhập, hoặc chờ giải quyết tranh chấp nội bộ vô thời hạn rồi mới lập hóa đơn. `invoice_due_at` và `billing_verified_at` là hai thời điểm khác nhau; luồng chậm xác minh phải được đưa vào danh sách cần xử lý.

Không hardcode loại hóa đơn, biểu mẫu, thuế suất hoặc luật từ tài liệu V1. Hiền Xa là hộ kinh doanh, chưa chọn nhà cung cấp; R11 chỉ bật phát hành thật sau khi hồ sơ/cơ chế ký/loại hóa đơn/API được xác nhận.

## SPEC-EINV-003 — Provider neutral

Adapter phải cô lập provider-specific logic.

## SPEC-EINV-004 — Timeout

Nếu timeout khi issue:
- không kết luận chưa phát hành;
- trạng thái `UNKNOWN/PENDING_RECONCILIATION`;
- query/reconcile trước retry;
- idempotency key/provider reference phải được dùng nếu provider hỗ trợ.

## SPEC-EINV-005 — External call

Không giữ DB transaction mở trong lúc gọi provider.

## SPEC-EINV-006 — AR

Issue invoice không tự tạo AR lần hai nếu billable event đã tạo AR.

---

# SPEC-310 — Identity & Access

## SPEC-ACC-001 — Internal model

```text
AuthUser
→ Employee
→ EmployeeBranchAccess
→ ONE ACTIVE ROLE
→ RolePermission
```

Một nhân viên có thể có access nhiều branch.

Role có thể khác theo branch nếu business yêu cầu.

**Vai trò tùy biến (D12, FB2 Đợt 7, 17/10/2026):** ngoài vai trò mẫu (`system_role`, chỉ xem), người có `roles.manage` (chủ doanh nghiệp;
không vai trò mẫu nào có quyền này) tạo/sửa vai trò tùy biến bằng RPC `save_custom_role(branch, role?, tên, quyền[], quyền_đã_đọc[], đang_dùng, op)`:
không bao giờ chứa `roles.manage`, không chứa quyền mà chính người sửa không có tại chi nhánh đang chọn, không sửa vai trò mẫu hay vai trò đang có
`roles.manage`; sửa đối chiếu danh sách quyền đã đọc (đổi ở nơi khác → từ chối, không ghi đè); đổi quyền có hiệu lực ngay với mọi người đang giữ vai
trò; vai trò còn người dùng không ngừng dùng được; tên không trùng vai trò đang dùng; idempotent theo `operation_id`, ghi audit
`role.custom_created`/`role.custom_updated`. Migration `20261017120000_custom_roles`, test native `110_custom_roles.sql`.

## SPEC-ACC-002 — Customer model

```text
AuthUser
→ CustomerPortalMembership
→ Customer
```

Tách khỏi Employee role. R2 tạo định danh Customer tối thiểu có khóa ổn định trước khi tạo membership; R3 bổ sung hồ sơ CRM trên cùng thực thể, không tạo hai bản Customer độc lập.

## SPEC-ACC-003 — Permission naming

Permission phải cụ thể theo action.

Ví dụ:

```text
orders.read
orders.create
orders.confirm
quotation.read
quotation.create
inventory.read
inventory.receive
finance.ar.read
finance.payment.post
dashboard.profit.read
dashboard.payroll.read
invoice.issue
roles.manage
```

Tránh quyền mơ hồ kiểu `all.edit`.

## SPEC-ACC-004 — Enforcement

Bắt buộc hai lớp phù hợp:

```text
server authorization
+
database grants/RLS/safe function
```

Không chỉ UI.

## SPEC-ACC-005 — Sensitive fields

Profit/payroll/commission:
- server không fetch/return nếu actor không có quyền field/domain tương ứng.

Không fetch rồi CSS hide.

---

# SPEC-320 — Backend Contract

## SPEC-BE-001 — Kiến trúc

```text
MODULAR MONOLITH
```

Không microservice khi chưa có bằng chứng cần.

## SPEC-BE-002 — Đường ghi

```text
request
→ access context
→ validation
→ domain command
→ idempotency
→ database transaction
→ mutation
→ audit
→ commit
→ invalidate projection/cache nếu cần
→ response
```

## SPEC-BE-003 — Đường đọc

```text
request/server render
→ access context
→ read service/query/projection
→ minimal DTO
→ response/render
```

Không gọi command layer chỉ để đọc.

## SPEC-BE-004 — Đường đọc Dashboard có ranh giới nhất quán

Mục tiêu là một snapshot tài chính chính trả KPI và tổng số dư bằng SQL tổng hợp đúng quyền; các bảng top-N, biểu đồ và chi tiết có thể tải tách nếu benchmark chứng minh cần. Đây là **ngân sách ít lượt đọc**, không lệnh bắt buộc nhồi mọi widget vào một RPC khổng lồ.

Nếu mọi widget chờ cùng một Promise/RPC, chúng cùng chờ; không được tuyên bố Suspense làm chúng hoàn thành độc lập. Phần vỏ có thể render trước; muốn widget lỗi/chậm độc lập phải tách truy vấn/ranh giới lỗi rõ.

Một SQL statement hoặc transaction `REPEATABLE READ READ ONLY` ngắn cho các chỉ tiêu cần cùng ảnh dữ liệu; `READ ONLY` ở `READ COMMITTED` không tự bảo đảm cùng snapshot qua nhiều SELECT [SRC-PG]. Lazy detail dùng cùng filter/cutoff và report version; nếu nguồn thay đổi không thể giữ cùng ảnh thì báo cập nhật và tải lại, không hứa số bất biến.

## SPEC-BE-005 — N+1

N+1 trong hot list/dashboard là lỗi kiến trúc.

## SPEC-BE-006 — Payload

Không `select *` trên hot path nếu không cần.

Không gửi:
- raw provider payload;
- binary/evidence;
- full history;

cho list/dashboard nếu UI không cần.

## SPEC-BE-007 — External provider

Không gọi external provider trong transaction đang giữ lock.

---

# SPEC-330 — Money, Quantity, Rounding

## SPEC-NUM-001 — Money

VND ưu tiên integer/bigint.

Nếu cần decimal currency khác:
- dùng decimal chính xác;
- định nghĩa scale;
- không dùng binary float cho phép tính tiền.

## SPEC-NUM-002 — Quantity

DB dùng numeric precision phù hợp.

Application dùng decimal-safe representation/string/primitive.

## SPEC-NUM-003 — Rounding

Mỗi loại phép tính phải định nghĩa:
- scale;
- rounding mode;
- stage rounding.

Không làm tròn sớm nếu gây sai tổng.

## SPEC-NUM-004 — Percentage

Dùng basis points hoặc exact decimal.

---

# SPEC-340 — Idempotency

## SPEC-IDEM-001

Ít nhất các command sau cần idempotent:

- quotation accept;
- sales order confirm;
- stock reservation;
- delivery confirm;
- work claim;
- payment post;
- payment allocation;
- payment notice;
- route apply;
- message send nếu retry tự động;
- invoice issue.

## SPEC-IDEM-002

Một idempotency key dùng lại với payload khác phải:
- conflict;
- không silently execute payload mới.

## SPEC-IDEM-003

Lookup idempotency phải có unique/index phù hợp.

---

# SPEC-350 — Transaction & Concurrency

## SPEC-CON-001

Transaction phải ngắn.

## SPEC-CON-002

Row locks chỉ giữ trên record cần bảo vệ.

## SPEC-CON-003

Các race phải test:
- stock reservation;
- payment allocation;
- work claim;
- credit exposure khi confirm;
- stock count vs movement;
- route apply stale state;
- duplicate invoice issue.

## SPEC-CON-004

Hai transaction cạnh tranh phải có kết quả deterministic theo invariant, không phụ thuộc timing may rủi.

---

# SPEC-360 — API / Error Semantics

## SPEC-ERR-001

Phân biệt:

```text
401 — chưa xác thực
403 — không có quyền
404 — resource không tồn tại/không được lộ
409 — conflict/state/idempotency conflict
422 — validation/business input không hợp lệ
429 — rate/pressure limit nếu áp dụng
503 — dependency unavailable
```

## SPEC-ERR-002

Không trả `200 []` để che:
- DB fail;
- auth fail;
- timeout.

## SPEC-ERR-003

Error response/log phải có trace/request id nhưng không lộ secret.

---

# SPEC-370 — Performance Budget

## SPEC-PERF-001 — Triết lý

```text
10 GIÂY
=
TRẦN UX TUYỆT ĐỐI
```

Không phải target.

Đa số thao tác thường ngày phải dưới 2 giây.

## SPEC-PERF-002 — Mục tiêu p95

| Luồng | p95 mục tiêu |
|---|---:|
| Admin shell/filter | < 300 ms |
| Dashboard KPI | < 1 giây |
| Dashboard nội dung hữu ích | < 2 giây |
| List/filter thông thường | < 1 giây |
| Drawer/detail | < 1 giây |
| Create/update đơn giản | < 1,5 giây |
| Command nội bộ quan trọng | < 2 giây |
| Báo cáo nặng | < 5 giây |

## SPEC-PERF-003 — Quá ngưỡng chờ không đồng nghĩa lệnh thất bại

Đến ngưỡng 10 giây, giao diện không tiếp tục spinner vô hạn. Với **đọc**, cho hủy/chạy lại truy vấn. Với **ghi**, không suy luận rollback chỉ vì client timeout/ngắt mạng:
- Giữ nguyên operation_id/idempotency key của lần thao tác đó.
- Hiển thị "Chưa xác định kết quả — đang kiểm tra", tra cứu lệnh bằng quyền hiện hành.
- Chỉ trả success khi xác nhận commit; chỉ retry cùng khóa khi safe; không sinh khóa mới để thử lại.
- Bên server hủy query/rollback nếu thực sự còn trước commit và có cơ chế hỗ trợ. Client abort không được coi là đã hủy SQL.

Tác vụ xuất file/provider dài trả mã công việc bền vững rồi theo dõi trạng thái; không chạy kiểu fire-and-forget sau HTTP response. 10 giây là mốc phản hồi/trạng thái hữu ích của UX, không cam kết nhà mạng/provider hoàn tất dưới 10 giây.

## SPEC-PERF-004 — Điều kiện đo và hai quy mô dữ liệu

Mỗi kết quả phải ghi commit/build, vùng máy chủ/DB, cấu hình máy/thiết bị, độ trễ mạng, cache lạnh/ấm, số yêu cầu đồng thời, cỡ mẫu, lỗi, p50/p95/p99. Số trong SPEC-PERF-002 là mục tiêu, **chưa phải kết quả đo**.

Mức kiểm thử thường kỳ: dữ liệu đại diện đo từ R0, đã ẩn danh hoặc sinh giả. Mức chịu tải mở rộng trước R12: 10k khách, 20k công trình, 100k đơn, 500k dòng, 150k giao, 200k AR/AP, 200k thanh toán, 100k chi phí, 200k thu nhập, 1m tin nhắn. GPS đo riêng. Không chạy mức mở rộng sau mọi task.

Đo API từ lúc server nhận đến khi trả; đo UX từ click đến dữ liệu hữu ích. Vỏ giao diện có mục tiêu phản hồi cục bộ nhanh; không dùng thời gian vỏ làm bằng chứng API đạt. Ghi riêng tải lạnh; không loại các mẫu chậm/lỗi để làm đẹp p95.

## SPEC-PERF-005 — Query

Hot query:
- đo duration;
- row count;
- query plan khi cần;
- index usage;
- payload size.

---

# SPEC-380 — Cache & Projection

## SPEC-CACHE-001

Static metadata có thể cache.

## SPEC-CACHE-002

Financial/sensitive data mặc định không dùng shared cache xuyên user nếu chưa chứng minh cache key an toàn.

## SPEC-CACHE-003

Nếu cache sensitive projection:
- key gồm access scope;
- permission fingerprint;
- filters;
- TTL;
- invalidation;
- data timestamp.

## SPEC-CACHE-004

Projection không được trở thành ledger có thể chỉnh độc lập.

---

# SPEC-390 — Observability

## SPEC-OBS-001

Theo dõi tối thiểu:

- request id;
- route;
- duration;
- query duration;
- rows;
- success/error;
- connection acquisition;
- auth duration;
- lock/conflict;
- provider duration;
- dashboard snapshot duration.

## SPEC-OBS-002

Không log:
- mật khẩu;
- secret;
- private token;
- raw evidence nhạy cảm;
- PII không cần thiết.

## SPEC-OBS-003

Slow query threshold ban đầu có thể:

```text
>250ms → warning
>750ms → điều tra ưu tiên
```

Ngưỡng này là operational diagnostic, không thay performance budget ở trên.

---

# SPEC-400 — Migration & Production Safety

## SPEC-MIG-001

Không reset Production database chỉ vì application source được rebuild.

## SPEC-MIG-002

Không replay migration V1 mù để tạo V2.

Flow:

```text
audit Production
→ thiết kế schema V2
→ mapping
→ transform
→ migrate copy
→ reconcile
→ UAT
→ final delta
→ cutover
```

## SPEC-MIG-003 — Classification

Mỗi dataset được phân loại:

```text
KEEP_DATA
TRANSFORM
RECALCULATE
ARCHIVE_ONLY
DROP_FROM_V2
MANUAL_REVIEW
```

## SPEC-MIG-004 — Reconciliation

Trước cutover phải reconcile ít nhất:
- customer;
- supplier;
- material;
- inventory;
- open AR;
- open AP;
- posted payments;
- active SO;
- active PO;
- active delivery;
- approved unpaid earning.

## SPEC-MIG-005 — Production authorization

Không tự:
- deploy;
- merge release;
- apply destructive migration;
- change Production config;
- force push;
- cutover.

Cần chỉ thị Owner rõ.

---

# SPEC-410 — Testing Requirements

## SPEC-TEST-001

Không có lớp kiểm thử riêng tên `smoke test`.

## SPEC-TEST-002

Các loại kiểm tra:

- lint;
- typecheck;
- unit;
- integration;
- database/concurrency;
- security/RLS;
- targeted E2E;
- performance khi liên quan.

Cách chọn check do `plan.md` sở hữu.

## SPEC-TEST-003

Critical invariant phải có test phù hợp trước khi phase liên quan được coi là hoàn tất.

---

# SPEC-420 — Acceptance Registry

## SPEC-ACCPT-001 — Dashboard

Phải chứng minh:
- Revenue đúng kỳ;
- AR/AP đúng as-of;
- payment giảm AR không giảm Revenue;
- AP payment giảm AP không tạo Expense mới;
- direct cost vào Gross Profit một lần;
- Opex vào Operating Profit một lần;
- commission payable không double;
- debt row drill-down exact;
- filter/back giữ context;
- field permission không leak;
- no N+1/over-fetch;
- p95 đạt ngân sách.

## SPEC-ACCPT-002 — Sales

- quote sent immutable;
- exact revision acceptance;
- snapshot đúng;
- SO confirm idempotent;
- SO confirm không tạo AR.

## SPEC-ACCPT-003 — Inventory

- reservation không giảm on-hand;
- concurrent reservation không oversubscribe;
- stock adjustment qua ledger.

## SPEC-ACCPT-004 — Finance

- allocation không overallocate;
- reversal giữ history;
- PaymentNotice không giảm debt;
- AR/AP không double.

## SPEC-ACCPT-005 — Workforce

- one claim winner;
- same retry idempotent;
- DONE không tự confirm Delivery;
- Earning không phải Payment.

## SPEC-ACCPT-006 — Customer access

- Customer A không xem B;
- browser-supplied ownership id không bypass access.

## SPEC-ACCPT-007 — Invoice

- issue idempotent;
- timeout reconcile;
- không duplicate AR.

---

# SPEC-440 — Ma trận sự kiện và hậu quả nghiệp vụ

## SPEC-OPS-001 — Thời điểm ghi nhận đề xuất

Đây là hợp đồng kỹ thuật để chạy thử và để chủ duyệt POLICY-CUSTODY/BILLING trước sử dụng thật. Không phải diễn giải thời điểm thuế.

| Sự kiện có quyền thực hiện | Tồn kho/custody | Phải thu/phải trả | Doanh thu/chi phí | Điều bắt buộc |
|---|---|---|---|---|
| Chốt SO | Chưa trừ kho; có thể giữ hàng riêng | Không AR/AP; giữ cam kết hạn mức | Không doanh thu | Snapshot giá/UOM |
| Chốt PO | Chưa nhập kho | Không AP | Không giá vốn đã bán | Snapshot giá mua |
| Nhận hàng NCC vào kho | Tăng on-hand từ lượng thực đã duyệt | Tạo AP từ cùng nguồn nhận | Tăng giá trị hàng tồn, chưa vào giá vốn bán | Hóa đơn NCC đến sau chỉ đối soát |
| Bàn giao hàng kho lên xe | Chuyển kho → vị trí đang giao, tiêu thụ reservation | Chưa AR | Chưa doanh thu/giá vốn đã bán | Kho khả dụng giảm ngay, không chờ khách xác nhận |
| Thợ gửi kết quả | Chỉ kết quả đề xuất | Không tự ghi tiền | Không tự ghi lãi/lương | Ảnh/phiếu và quantity |
| Xác minh giao thành công | Xuất lượng chấp nhận khỏi đang giao; phần còn lại chờ trả/hao hụt | Tạo AR và chuyển cam kết hạn mức; AP direct riêng căn cứ NCC | Doanh thu/giá vốn ghi một lần | Liên kết lượng thực/chấp nhận/tính tiền |
| NCC giao thẳng được xác minh | Không kho giả | AP theo căn cứ NCC được duyệt | Chi phí trực tiếp hoặc tạm chờ khớp doanh thu | Khách chấp nhận khác lượng NCC không ghi đè |
| Xác minh dịch vụ tính tiền | Không tồn vật tư trừ khi có tiêu hao riêng | AR theo khối lượng tính tiền | Doanh thu và chi phí trực tiếp xác định | Giờ thực, giờ tính khách, giờ trả công tách nhau |
| Ghi nhận tiền thu/chi | Không stock | Phân bổ giảm khoản nợ đúng đối tượng | Không ghi doanh thu/chi phí lần hai | Số dư chưa phân bổ riêng |
| Duyệt chi phí hoặc thu nhập | Không stock tùy loại | Tạo nghĩa vụ phù hợp nếu chưa trả | Một cost fact duy nhất theo DIRECT/OPEX | Chi tiền sau này chỉ tất toán |
| Phát hành hóa đơn | Không stock | Không AR/AP mới | Không ghi P&L lần hai | Liên kết nguồn đã ghi nhận |

Vị trí "đang giao" là một loại vị trí trong cùng ledger tồn/custody, không một hệ kho mới. Theo dõi theo phiếu giao; không cần tạo kho thực cho mỗi xe. Tổng lượng thuộc Hiền Xa = tại kho + đang giao + các vị trí sở hữu được định nghĩa. Chuyển vị trí không đổi tổng tài sản; giao bán làm giảm tài sản theo lượng/giá vốn đúng.

## SPEC-OPS-002 — Nguồn, revision và khóa duy nhất

Các tác động có thẩm quyền về tiền/kho/thu nhập phải trỏ tới **nguồn nghiệp vụ bằng khóa ngoại tường minh** đối với các loại nguồn đã biết. Không dùng cặp `source_type/source_id` đa hình làm quan hệ chính rồi bù bằng trigger/registry phức tạp.

Ví dụ: khoản phải thu do giao hàng có `delivery_verification_id`; do dịch vụ có `service_verification_id`; số dư đầu kỳ có `opening_balance_id`. Có thể dùng trường loại nguồn để hiển thị/log, nhưng tính toàn vẹn authoritative phải dựa vào FK/check/unique phù hợp. Một khóa duy nhất theo nguồn–revision–tác động ngăn double-post kể cả client gửi idempotency key khác.

Chỉ log/audit không có thẩm quyền mới được dùng tham chiếu đa hình khi không cần FK. Không dựng `BusinessEvent`/registry chung chỉ để mọi bảng trỏ vào một ID trung gian.

Tổng hợp không JOIN thẳng đơn nhiều dòng với nhiều payment rồi SUM (nhân bản doanh thu). Tổng hợp từng nguồn ở đúng grain trước khi JOIN.

## SPEC-OPS-003 — Ngoại lệ giao, trả hàng và hủy

| Tình huống | Hành vi |
|---|---|
| Đơn chưa thực hiện bị hủy | Giải phóng phần reservation/credit commitment còn lại, không AR/stock giả |
| Đơn giao một phần, hủy phần còn lại | Giữ delivery/AR đã ghi; khóa lại lượng còn thực hiện |
| Đã lên xe nhưng thất bại | Ghi kết quả FAILED, giữ hàng đang giao; chỉ tăng lại kho khi xác minh nhận trả |
| Khách nhận ít hơn NCC giao | Lưu cả hai căn cứ; sai khác vào hồ sơ đối soát, không sửa một lượng cho bằng nhau |
| Khách trả sau khi đã xác minh | Tạo ReturnCase liên kết delivery gốc; nhận hàng, credit điều chỉnh AR và hoàn tiền là các bước riêng |
| Hàng không thể nhập lại | Phê duyệt hao hụt/hỏng theo bằng chứng; không tự cộng tồn |
| Sửa giá/khối lượng đã ghi sổ | Chứng từ điều chỉnh delta/reversal được duyệt; không UPDATE quá khứ |

Trả hàng không tự hoàn tiền. Hoàn tiền không tự coi đã nhận hàng. Hóa đơn điều chỉnh là luồng pháp lý riêng liên kết hồ sơ trả hàng; không ghi AR giảm lần hai.

## SPEC-OPS-004 — Công việc phải có điều kiện sẵn sàng

SO CONFIRMED chỉ tạo nhu cầu thực hiện. Chỉ publish WorkItem khi có delivery/service hợp lệ, nguồn hàng khả dụng/được NCC xác nhận, địa chỉ/người nhận, số lượng, khung thực hiện và eligibility người/xe. Không đẩy đơn thiếu nguồn vào bể để thợ tự đoán.

Mỗi WorkItem có phiên bản assignment. Hai claim khác việc nhưng cùng thợ/xe phải kiểm lịch và workload dưới cùng khóa tài nguyên; không chỉ test hai người bấm một việc. Hết hạn claim chưa bắt đầu có thể đưa lại bể nếu an toàn. Đang làm quá một giờ chưa xong: cảnh báo và cho xác nhận "Vẫn đang làm" khi dừng an toàn; mất heartbeat không tự hủy/đổi người/khấu trừ lương.

# SPEC-450 — Cấu hình dễ dùng, tài liệu và liên kết nguồn

## SPEC-CONFIG-001 — Đơn vị nhập tay có kiểm soát

Chủ/quản lý tự tạo UOM và quy cách qua form. Hệ thống không cho gõ tên đơn vị tự do trên từng transaction. Ví dụ: 1 bao xi măng loại A = 50 kg; 20 bao = 1.000 kg = 1 tấn = 10 tạ. Bao 40kg của loại B là conversion riêng. "Xe nhỏ" và "xe lớn" chỉ gợi ý m³ theo xe/vật tư, phiếu giao lưu lượng thực riêng. Đổi conversion không sửa snapshot cũ.

Không tự quy đổi m³ ↔ tấn khi chưa có số đo/mật độ được duyệt; nhãn ước tính không được trở thành căn cứ quyết toán mà không xác nhận.

## SPEC-CONFIG-002 — Nhập giá không bắt hiểu phần trăm

Cách mặc định là nhập **giá bán cuối theo đơn vị**. Người được xem giá vốn có thêm lựa chọn "Cộng thêm X đồng/đơn vị"; % nằm trong phần nâng cao, phân biệt tỷ lệ cộng trên vốn và biên lãi trên bán. Nhân viên không có quyền giá vốn vẫn chọn giá khách được phép, không nhận giá vốn trong DTO.

Không có giá hợp lệ: cho nhập giá thủ công với đúng quyền, nguồn `MANUAL_APPROVED`; không tự dùng 0. Khi tạo từ PO giao thẳng và chưa có SO: một thao tác nghiệp vụ tạo hai bản nháp liên kết, rồi chốt từng phía; giá bán chỉ sở hữu ở SO.

## SPEC-CONFIG-003 — Mẫu in và ảnh bằng chứng

Mẫu có sẵn: báo giá A4, phiếu giao, phiếu thu/chi, bảng đối chiếu công nợ. Báo giá PDF cố định theo revision; đổi mẫu không đổi file đã gửi. Tệp xuất không bị gọi là hóa đơn thuế khi chỉ là báo giá/phiếu giao.

**Thông tin doanh nghiệp trên chứng từ (D10, FB2 Đợt 7, 17/10/2026):** bảng `company_profile` một dòng (tên doanh nghiệp bắt buộc; mã số thuế 10
hoặc 13 số dạng `0101234567-001`, địa chỉ, điện thoại, email, ngân hàng, số tài khoản, chủ tài khoản — tùy chọn), RLS bật, mọi người đã đăng nhập
được đọc (in trên chứng từ gửi khách), `anon` không có quyền; chỉ ghi qua `save_company_profile(branch, profile, version_đã_đọc, op)` với
`roles.manage`, đối chiếu version, idempotent, audit `company_profile.saved`. PDF đơn bán, đơn mua, phiếu giao, phiếu thu/chi, bảng đối chiếu công
nợ, bản xem hóa đơn in tên + địa chỉ + MST/điện thoại/email + tài khoản ngân hàng thay chữ cố định "Hiền Xa ERP"; chưa khai báo thì giữ chữ cũ;
lỗi đọc hồ sơ không chặn xuất chứng từ. Migration `20261017140000_company_profile`, test native `130_company_profile.sql`.
**Logo (Owner 17/10/2026):** một ảnh PNG hoặc JPEG ≤ 300 KB lưu trong chính dòng `company_profile` (`logo_mime`, `logo_base64`,
`logo_sha256`; không dùng Storage, không dùng khóa bí mật), ghi qua `save_company_logo(branch, mime, base64, sha_đã_đọc, op)` với
`roles.manage`: kiểm chữ ký tệp khớp loại, cần đã có tên doanh nghiệp, thay/xóa đối chiếu logo đã đọc (không đổi `version` hồ sơ), idempotent,
audit `company_profile.logo_saved`/`logo_removed`. PDF in logo cạnh tên doanh nghiệp; logo không đọc được thì bỏ logo, vẫn in chứng từ.
Migration `20261017150000_company_logo`, test native `140_company_logo.sql`. **Giao diện theo thiết bị** (sáng/tối/theo thiết bị, cỡ chữ, phông) lưu ở cookie `hx-appearance`, không ghi DB.

Điều chỉnh công nợ, stock adjustment, reversal tiền và ngoại lệ lượng tính tiền cần lý do + tài liệu/bằng chứng. Bằng chứng là object Storage private với owner/nguồn/audience/checksum, không chỉ URL công khai. Upload lỗi phải thử lại riêng, không mất form. Giao nội bộ có thể lưu nháp thiếu ảnh; muốn duyệt thiếu chứng cứ cần quyền ngoại lệ, lý do và audit, không được lặng lẽ bỏ qua.

## SPEC-CONFIG-004 — Cảnh báo nhập thêm

Ngưỡng tối thiểu theo vật tư/kho do người có quyền đặt. Cảnh báo khi available xuống dưới ngưỡng, gộp theo vật tư/kho và có thời gian chống lặp; dẫn thẳng tới tồn và bản nháp PO. Không tự đặt hàng. Thông báo trong ứng dụng là nền bắt buộc; push trình duyệt là lựa chọn cần xin quyền, từ chối push không mất cảnh báo.

# SPEC-460 — Hợp đồng báo cáo và chi phí không bị lệch

## SPEC-REPORT-001 — Bộ lọc áp dụng theo khả năng phân bổ

| Phạm vi lọc | Doanh thu/giá vốn | Opex/lợi nhuận hoạt động | Công nợ | Lương/hoa hồng |
|---|---|---|---|---|
| Kỳ + chi nhánh | Theo fact trong kỳ/branch | Theo fact cùng kỳ/branch | Số dư đến thời điểm, gồm nợ đầu kỳ | Nghĩa vụ đã duyệt còn nợ đến thời điểm |
| Sales/khách/công trình/loại hoạt động | Phần có nguồn gắn dimension chính xác | Chỉ phần chi phí có phân bổ được duyệt; nếu chưa đủ thì operating_profit/margin = NOT_APPLICABLE | AR gắn nguồn tương ứng; AP direct đã gắn nguồn mới lọc được | Chỉ phần có source/dimension; không suy lương chung theo sales |

Không rải Opex toàn công ty theo tỷ lệ doanh thu tự phát. UI phải ghi "Chi phí chung chưa phân bổ theo bộ lọc này" thay vì dựng ra một lợi nhuận hoạt động giả. Không gộp tổng khác phạm vi trong cùng công thức. Nợ không gắn công trình hiển thị nhóm "Chưa gắn công trình", không bị bỏ khỏi tổng.

## SPEC-REPORT-002 — Trạng thái chất lượng dữ liệu

Mỗi metric: `READY / INCOMPLETE / NOT_APPLICABLE / FORBIDDEN / UNAVAILABLE` + lý do an toàn. `READY` có thể là 0 thật; các trạng thái khác không được serialize thành 0. Doanh thu hiển thị số đã ghi; lợi nhuận thiếu giá vốn hiển thị chưa đủ dữ liệu. Top-N không bằng tổng; click "Tất cả" dùng cùng filter/quyền.

Dashboard không cho user không có quyền thấy giá vốn qua phép trừ Revenue − Profit. Quyền xem profit bao gồm quyền xem tổng cost tương ứng; bảng lương cá nhân cần quyền chi tiết riêng. Chọn nhiều branch với quyền khác nhau không union quyền rồi áp cho tất cả; mỗi phép tính chỉ dùng branch được phép cho metric đó và ghi rõ phạm vi, hoặc từ chối bộ lọc không đồng nhất.

## SPEC-REPORT-003 — Một nguồn chi phí, không tính hai lần

Chi phí trực tiếp đã nằm ở nguồn canonical của giao dịch không được lại đưa vào Opex. Payment chi lương/hoa hồng chỉ giảm nghĩa vụ; chi phí vật tư chưa bán nằm trong tồn, không coi toàn PO/AP là chi phí kỳ.

Mặc định **không tạo bảng `cost_fact` tổng quát từ sớm**. R7 trước hết tổng hợp giá vốn/chi phí từ các nguồn đã có snapshot chính xác (movement xuất bán, giao thẳng NCC, dịch vụ, earning được duyệt). Chỉ tạo projection/fact chuẩn hóa nếu truy vấn thực tế chứng minh cần để bảo toàn grain hoặc hiệu năng; projection đó phải tái tạo được và không thành nguồn chi phí thứ hai.

Hoa hồng dựa trên lợi nhuận phải quy định "lợi nhuận trước hoa hồng đang tính" để tránh vòng lặp. Quy tắc được chốt ngày hiệu lực, gắn một sales hoặc tỷ lệ chia được duyệt. Chưa có rule approved → chưa tính, không mặc định 0%/5%. Hủy/hoàn tiền/điều chỉnh lãi tạo điều chỉnh earning theo policy, không sửa earning đã trả.

# SPEC-470 — Bảo mật truy cập, tệp và tác vụ nền

## SPEC-SEC-001 — Vòng đời tài khoản

Bắt buộc luồng đăng nhập nội bộ, đăng nhập worker, đăng nhập customer, đăng xuất, mời/cấp tài khoản, đặt lại mật khẩu/OTP theo phương thức Auth được chọn. Không chung tài khoản cho cả đội. Phương thức xác thực cần provider hỗ trợ; không tự làm OTP tự chế. Khách nhận hàng không tự có quyền xem công nợ khách; membership có quyền `RECEIVER`/`FINANCE_CONTACT` tách khi cần.

Thu hồi nhân viên/membership phải chặn lần đọc/ghi nhạy cảm tiếp theo bằng kiểm quyền hoạt động từ DB; không đợi JWT cũ hết hạn. Không xóa actor lịch sử. MFA cho tài khoản quản trị/tiền nếu provider hỗ trợ, recovery có xác minh. Chưa được kiểm tra session/provider thì không claim secure.

## SPEC-SEC-002 — Server-only không tự đồng nghĩa RLS bảo vệ

DB superuser/BYPASSRLS hoặc service role có thể bỏ qua RLS [SRC-SB-RLS]. Client nghiệp vụ dùng user context xác minh; cấm lấy actor_id từ body rồi tin. R2 phải chọn và kiểm chứng đường ghi ít quyền: domain RPC chặt hoặc DB runtime role không bypass và context giao dịch được thiết lập an toàn.

Nếu cần `SECURITY DEFINER` để raw DML ledger bị khóa, xem đó là ngoại lệ bảo mật: owner quyền tối thiểu, search_path cố định, không dynamic SQL tùy ý, kiểm auth/quyền/branch/resource trong hàm, REVOKE EXECUTE khỏi PUBLIC và chỉ GRANT tập cần thiết; test direct API/function call. Không dùng definer để chữa lỗi SELECT một cách mù.

RLS là quyền theo hàng, không mặc định chặn cột giá vốn/lương. Kiểm views, column grants, functions, Storage và Realtime cùng API; không chỉ test trang.

## SPEC-SEC-003 — Tệp và audience

Cho phép loại tệp/kích thước được định nghĩa và giới hạn; kiểm MIME thực, quota, quyền upload/finalize/download. Dùng object key khó đoán, signed URL ngắn hạn; signed URL đã cấp có thể còn dùng đến hết TTL, cần ghi rõ ranh giới thu hồi. Không render HTML/SVG tùy ý từ file người dùng. Chặn tài liệu chứa secret bị gửi vào log/Git/telemetry.

Chat nội bộ và chat khách là hai audience riêng, không đổi audience cuộc chat cũ để lộ lịch sử. Xóa quyền hiện tại phải ngăn đọc mới kể cả websocket đang mở theo cơ chế được kiểm thử.

## SPEC-SEC-004 — Chỉ dùng công việc nền khi thật sự có ranh giới bất đồng bộ

Không dựng hàng đợi/outbox/runner ở nền tảng ban đầu chỉ để chuẩn bị cho tương lai. Luồng nội bộ cùng cơ sở dữ liệu ưu tiên gọi hàm trực tiếp trong một transaction ngắn.

Chỉ khi có nhu cầu thật như gọi nhà cung cấp bên ngoài sau commit, xuất tệp dài, hoặc công việc phải tiếp tục sau HTTP response mới dùng **một cơ chế công việc nền dùng chung** trong cùng PostgreSQL: trạng thái, attempt, next_run_at, lease_until, last_error_safe, dedupe_key. Không thêm Kafka/Redis/queue riêng nếu chưa có bằng chứng cần.

Khi đã cần job: intent được ghi bền vững trước hoặc cùng transaction nguồn; runner nhận bằng lease, retry có backoff và idempotent, hết lượt chuyển cần can thiệp. Không dùng biến bộ nhớ làm hàng đợi và không hứa code tiếp tục sau response nếu nền tảng không bảo đảm. Test/build/preview không được dùng kết nối Production. Runner Production chỉ bật sau phê duyệt riêng về môi trường, quyền và loại công việc.

## SPEC-SEC-006 — Thông báo trong ứng dụng và tự động hóa không tốn phí (FB3 R3, F5, 18/10/2026)

- **Thông báo:** bảng `notifications` (chi nhánh, loại, đối tượng, tiêu đề, nội dung, link nội bộ, `required_permission`, người nhận cụ thể nếu có,
  `dedupe_key`) và `notification_reads` (đã đọc theo từng tài khoản). Chỉ ghi qua `private.notify(...)` **trong cùng transaction** của lệnh nguồn;
  RLS: thấy khi có quyền tương ứng ở chi nhánh (và đúng người nhận nếu có). `notification_feed`, `mark_notifications_read`. Chuông trên thanh trên
  cùng nội bộ, trang `/admin/notifications`; Realtime chỉ là tín hiệu làm mới.
- **Quy tắc tự động** (`automation_rules`, `roles.manage`): Khi [loại thông báo trong danh sách trắng] · Nếu [tổng tiền đơn/đơn mua từ … | chỉ giao
  thiếu / không giao được] · Thì [thông báo đẩy tới người có quyền xem | Telegram | email | webhook]. Quy tắc là dữ liệu, không chạy mã tùy ý.
  Nơi nhận được kiểm: mã Telegram, email, webhook chỉ `https` công khai (chặn localhost, mạng nội bộ). Quy tắc mẫu: đơn khách mới, đơn mua nháp cần
  duyệt, giao thiếu/không giao được, việc mới cho thợ, thợ từ chối việc (đều qua thông báo đẩy).
- **Một cơ chế công việc nền (SPEC-SEC-004):** thông báo khớp quy tắc ghi `outbound_jobs` (state PENDING/SENDING/SENT/FAILED/DEAD, attempt,
  next_run_at, lease_until, last_error_safe, dedupe_key) trong cùng transaction; `pg_net` gửi ngay sau commit; `pg_cron` mỗi phút đối chiếu kết quả
  (2xx → SENT; thiết bị đã hủy đăng ký → DEAD và xóa thiết bị; lỗi → gửi lại sau 2^n phút, tối đa 6 giờ, quá 6 lần → DEAD) và 07:00 mỗi sáng tạo
  thông báo tóm tắt: nợ quá hạn, tồn dưới ngưỡng, đơn mua chưa gửi NCC. Không có pg_net/pg_cron thì việc chờ ở PENDING, ứng dụng vẫn chạy.
- **Bí mật** chỉ ở Supabase Vault (`hx_telegram_bot_token`, `hx_webhook_secret`, `hx_app_url`, `hx_automation_secret`) và biến môi trường ứng
  dụng (`HX_AUTOMATION_SECRET`, `SMTP_*`, `VAPID_*`), không lưu trong bảng. Telegram và webhook gửi thẳng từ cơ sở dữ liệu; webhook gửi
  `{ data, signature }` với chữ ký HMAC-SHA256 của `data`. Email (SMTP, ví dụ Gmail mật khẩu ứng dụng) và thông báo đẩy (Web Push VAPID) đi qua
  route `/api/automation/deliver`: chỉ nhận yêu cầu ký HMAC còn hạn 15 phút, chỉ gửi, không đọc/ghi cơ sở dữ liệu, không dùng khóa bí mật Supabase.
- **Thông báo đẩy:** PWA (manifest, service worker `/sw.js`, không cache), "Bật thông báo trên máy này" ở trang Thông báo (nội bộ) và Hồ sơ (cổng
  thợ); iPhone cần "Thêm vào MH chính". `push_subscriptions` mỗi trình duyệt một dòng, người dùng chỉ đọc của mình; máy dùng chung chuyển sang tài
  khoản đăng nhập sau. Gửi tới người có quyền xem thông báo đó (và đúng người nhận nếu có).
- Runner Production (pg_cron) bật khi áp migration; không gửi gì ra ngoài cho tới khi Owner cấu hình Vault/biến môi trường và tạo quy tắc có kênh ngoài.

## SPEC-SEC-005 — Một Production không có nghĩa test trên Production

Khóa DB URL thật khỏi local test, CI, preview, seed, build. Một test phải xác minh host/project allowlist local trước DDL/DML; nếu không xác định được thì dừng. Production audit read-only có quyền riêng và hạn mức thời gian/truy vấn. Supabase local không phải một Cloud project thứ hai.

Push `main` có thể kích hoạt Vercel tự deploy [SRC-VERCEL]. Mỗi checkpoint phải kiểm cơ chế deploy đang tắt/có gate trước push; chỉ ghi "không deploy" trong prompt là chưa đủ. Không tự thay cấu hình hạ tầng để bypass blocker.

# SPEC-480 — Tình huống nghiệm thu xuyên luồng

## SPEC-EXAMPLE-001 — Đơn xi măng và hàng trả về

Dữ liệu giả chuẩn: tồn 100 bao loại A, 50kg/bao, giá vốn 60.000đ/bao. Chốt 20 bao, giá bán 3.000.000đ/tấn (=150.000đ/bao) rồi ngày sau đổi bảng giá. Đơn cũ vẫn 150.000đ/bao.

Giữ 20 bao: on-hand 100, reserved 20, available 80. Bàn giao 20: tại kho 80, đang giao 20, tổng sở hữu 100, reserved 0. Khách chấp nhận/tính tiền 19; một bao chưa giao trả kho: tồn kho cuối 81, đang giao 0; AR/doanh thu 2.850.000đ, giá vốn đã bán 1.140.000đ.

Thu 2.000.000đ: còn nợ 850.000đ, doanh thu không đổi. Phát hành hóa đơn không tăng AR. Chi phí trực tiếp nhân công 100.000đ được duyệt: lợi nhuận gộp quản trị 1.610.000đ. Chi phí văn phòng 100.000đ + hoa hồng thử nghiệm đã duyệt 80.500đ: lợi nhuận hoạt động 1.429.500đ. Đây là **dữ liệu test**, không tỷ lệ hoa hồng thực của Hiền Xa.

## SPEC-EXAMPLE-002 — NCC giao thẳng lệch lượng

NCC được duyệt giao 19,5m³ × 200.000đ = AP 3.900.000đ; khách chấp nhận/tính tiền 19m³ × 300.000đ = AR 5.700.000đ. Không movement kho. Chi phí 3.900.000đ đã bao gồm 0,5m³ lệch nếu Hiền Xa chịu, không cộng thêm một dòng hao hụt 100.000đ lần hai. Khoản đòi NCC nếu có là hồ sơ/điều chỉnh được duyệt riêng.

## SPEC-EXAMPLE-003 — Một khoản thu nhiều đơn

Khách có AR A=2.000.000đ, B=1.000.000đ; Payment 2.500.000đ phân bổ A=2.000.000đ, B=500.000đ. B còn 500.000đ, A còn 0. Payment 2.500.000đ đã dùng hết, không còn tiền khả dụng. Khoản AR B còn 500.000đ chỉ được thu bằng payment mới hoặc tiền trả trước còn khả dụng; hai người cùng phân bổ vào B phải khóa target và không vượt số dư. Undo/đảo payment thêm lịch sử đảo, không xóa 2 allocation.

## SPEC-EXAMPLE-004 — Chỉ tiêu lịch sử và bộ lọc

AR 100 triệu trước kỳ, thu 60 triệu sau kỳ: mở kỳ cũ không được chỉ còn 40 triệu. Lọc một công trình có Revenue 20 triệu, DirectCost 15 triệu và chi phí văn phòng toàn công ty 10 triệu chưa phân bổ: GP=5 triệu, OperatingProfit=`NOT_APPLICABLE`, không báo lỗ 5 triệu cho công trình.

## SPEC-EXAMPLE-005 — Timeout và claim cũ

Payment đã commit nhưng response mất: lần retry cùng operation_id trả payment cũ, không ghi tiền hai lần. Claim thợ A hết hạn, B đã nhận: A gửi kết quả offline với assignment_version cũ phải conflict, không tự VERIFIED cho B hoặc A.

# SPEC-490 — Nguồn kiểm chứng kỹ thuật và giới hạn

Các tài liệu sau được dùng để kiểm tra nguyên tắc, không thay kết quả test dự án. Mọi API/version cụ thể phải kiểm lại tại phase triển khai.

- [SRC-DESIGN] Stanford d.school, Design Thinking Bootleg: https://dschool.stanford.edu/tools/design-thinking-bootleg — căn cứ quy trình hiểu nhu cầu, định nghĩa, ý tưởng, mẫu thử, kiểm chứng.
- [SRC-SAPO] Sapo, phân quyền vai trò: https://help.sapo.vn/phan-quyen-vai-tro-tai-khoan-nhan-vien — tham chiếu cách cấp một vai trò mỗi chi nhánh, không copy luật bán lẻ.
- [SRC-SB-RLS] Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security — quyền bảng/hàng và bypass.
- [SRC-SB-CONN] Supabase connections: https://supabase.com/docs/guides/database/connecting-to-postgres — chọn đường kết nối theo workload.
- [SRC-PG] PostgreSQL transaction isolation: https://www.postgresql.org/docs/18/transaction-iso.html — snapshot nhiều SELECT; áp dụng đúng phiên bản DB thật.
- [SRC-NEXT] Next.js authentication: https://nextjs.org/docs/app/guides/authentication — kiểm quyền ở DAL/action/handler.
- [SRC-VERCEL] Vercel Git deployments: https://vercel.com/docs/git — push và triển khai tự động.
- [SRC-WCAG] W3C WCAG 2.2: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ — truy cập bàn phím/đăng nhập/drag/target; không được claim tuân thủ chỉ từ tài liệu.
- [SRC-CODEX] Codex AGENTS instructions: https://developers.openai.com/codex/guides/agents-md — kiểm tệp chỉ dẫn thực sự được nạp; tên Spec/plan không tự đảm bảo agent đọc.

---

# SPEC-495 — Bổ sung toàn vẹn dữ liệu và ranh giới vận hành

## SPEC-DATA-001 — Hợp đồng dữ liệu tối thiểu

Tên bảng vật lý do R1/R2 chốt, nhưng các quan hệ sau là bắt buộc: Customer→Site; SO→revision/lines; SourceAllocation→SO line/PO line/kho; DeliveryLine→SO line/allocation; ReturnLine→DeliveryLine; AR→customer/site/source revision; AP→supplier/source revision; Allocation→Payment và một target duy nhất; Earning→employee/rule/source; InvoiceLine→source line/coverage; Evidence→object/audience; WorkItem→Delivery hoặc ServiceJob.

Lõi nghĩa vụ phải thu/phải trả chỉ cung cấp primitive tối thiểu cần cho credit và các nguồn phát sinh sau này; không dựng hệ kế toán tổng quát. Fixture local được dùng để kiểm logic trước khi nguồn Sales/Delivery tồn tại. Khi domain nguồn được tạo, nối bằng FK tường minh và unique phù hợp trước mở command thật. Không cấp API generic cho client tự nhập `source_id` để tạo AR/AP.

Dùng FK và unique constraints cho liên kết quan trọng; ràng buộc branch/customer/source phải được kiểm cùng transaction. Các khóa idempotency chỉ là lớp chống retry, không thay nguồn-unique. Ledger thêm dòng, không DELETE posted row. Posted source không bị sửa về thời gian/tiền/lượng; điều chỉnh bằng event mới có lý do.

Tiền tính toán/đơn giá có scale định nghĩa, tiền phải thu/chi VND chốt theo quy tắc làm tròn được duyệt. Quantity `numeric(20,6)` là cấu hình khởi điểm, kiểm phạm vi thực trước chốt. Không cấm Number cho counter/độ trễ/chart presentation; cấm dùng binary float tạo số tiền/quyết toán authoritative. UI số thập phân dùng dấu phẩy, DTO exact dùng chuỗi decimal chuẩn. Ledger điều chỉnh được phép delta âm có loại rõ; không áp `amount>=0` cho mọi loại bút toán đảo.

Không cho tổng phân bổ nguồn vượt phần cần thực hiện của đơn nếu chưa có revision/ngoại lệ được duyệt. Mọi lượng đưa vào so sánh phải quy đổi cùng đơn vị cơ sở từ snapshot. Lượng giao/nhận/trả phải tham chiếu đúng dòng nguồn, phần đã tiêu thụ và phần còn lại; không nhận trả vượt lượng có thể trả của giao dịch gốc. `billable_quantity` khác `accepted_quantity` cần căn cứ tính tiền/lý do và quyền rõ, không dùng sự khác biệt này để ngầm sửa lượng tồn. Sai khác/hỏng/hao hụt được ghi một lần theo source, không vừa nằm trong giá vốn toàn bộ hàng vừa cộng lần nữa như chi phí riêng.

## SPEC-DATA-002 — Giá theo đơn vị và nguồn quy tắc

Rule giá khớp khách + vật tư + đơn vị/phiên bản conversion. Rule nhóm vật tư chỉ dùng khi có đơn vị/cơ sở chung hợp lệ; không lấy cùng một số tiền/bao áp cho mọi vật tư khác quy cách. Giá nhóm/tier dạng điều chỉnh phải có base-price material hợp lệ; không có base thì require manual approved price.

Lưu snapshot `ordered_uom`, `base_uom`, ratio, rounding, price_basis_uom và unit_price. Chuyển một đơn cũ từ tấn sang bao chỉ là cách hiển thị tương đương, không sửa tổng đã chốt. Người dùng có thể nhập trực tiếp giá bán, không bị ép phần trăm.

## SPEC-DATA-003 — Khóa đối soát và migration

`RECALCULATE` chỉ cho projection/derived summaries tái tạo từ source được duyệt. Không tính lại giá giao dịch, công nợ, lương đã duyệt, hóa đơn lịch sử theo bảng giá/quy tắc mới. Snapshot bất biến và ID map giữ truy vết V1.

Legacy schema và V2 schema có thể cùng tồn tại tạm trong một database qua namespace/bảng tách đã review; không gọi đây là project staging. Cấm ghi song song hai ledger cùng có thẩm quyền. R0/R1 phải nêu rõ canonical writer ở mỗi giai đoạn. Migrations mới incremental, V1 history không xóa/repair mù. Dữ liệu rehearsal là copy cục bộ ẩn danh; không backup PII/secret lên Git.

## SPEC-DATA-004 — GPS và lộ trình ở mức khả thi

Tracking chỉ trong lần giao active được giao đúng worker/vehicle, user cho phép và browser foreground. Phiên có `assignment_version`, sequence hoặc timestamp + accepted-ordering; không tin clock client hoàn toàn. Điểm cũ/offline không ghi đè vị trí mới; nhận telemetry sau thu hồi phải deny. Ngưỡng gửi/freshness/retention do cấu hình vận hành, không GPS 24/7; không giữ lịch sử vô hạn, case tranh chấp có hold được kiểm soát.

Route có giờ khởi hành thực theo múi giờ, thời gian chạy/chờ/bốc dỡ, capacity theo từng chặng pickup/drop và road restrictions provider thực hỗ trợ. Không hardcode giờ UTC hoặc coi dữ liệu thiếu thành 0 phút/tải trọng vô hạn. Provider unavailable: gợi ý thứ tự thủ công với nhãn rõ. Apply kiểm lại assignment_version/readiness dưới lock; không tự claim công việc trong bể.

**Giờ dự kiến từng điểm dừng (FB2 Đợt 7, 17/10/2026):** khi lập lộ trình, điều phối nhập giờ khởi hành và "thời gian mỗi điểm" (phút, gồm chạy xe
và bốc dỡ; 10–480, gợi ý sẵn 60, sửa được); điểm thứ n có khung `[giờ đi + (n−1)×phút, giờ đi + n×phút)` lưu ở `route_plan_stops.planned_start_at/
planned_end_at` (DB kiểm: bắt đầu không trước giờ đi, theo đúng thứ tự, không chồng nhau, mỗi khung ≤ 24 giờ). Áp dụng: phiếu **chưa có lịch** nhận
khung của điểm dừng (`assign_delivery_scheduled`), phiếu **đã có lịch** giữ nguyên lịch (`assign_delivery`) — không âm thầm dời lịch đã hẹn khách
(SPEC-JOURNEY-003). Chồng lịch trên cùng xe/tài xế vẫn bị từ chối nguyên khối như trước; lộ trình cũ không có khung cho phiếu chưa lịch → báo
`route_stop_schedule_required`, tạo lại đề xuất. Migration `20261017130000_route_plan_stop_schedule`, test native `120_route_plan_schedule.sql`.

## SPEC-DATA-005 — Thiết bị yếu và an toàn người dùng

Cho lưu nháp cục bộ dữ liệu nhập chưa gửi khi có policy phù hợp, hiển thị "Chưa gửi". Không offline post tiền/quyền/kho, không lưu token/chứng từ nhạy cảm tùy ý; logout xóa cache ứng dụng nhạy cảm. Người dùng được upload lại ảnh riêng mà không gửi lại command đã commit. Batch lớn, import, xuất file có giới hạn và trạng thái bền vững theo SPEC-SEC-004.

---

# SPEC-500 — Yêu cầu hiệu quả thao tác xuyên nghiệp vụ

## SPEC-JOURNEY-001 — Nghiệp vụ nhiều thực thể không có nghĩa phải nhập nhiều màn

Mục tiêu: xử lý một yêu cầu bán/mua/giao/thu tiền mà không nhập lại dữ liệu hệ thống đã biết. Danh sách → tạo mới → chi tiết là cấu trúc điều hướng; không phải yêu cầu buộc người dùng mở từng module trong chuỗi công việc.

Mỗi hành trình phải có: người thao tác, điểm bắt đầu, thông tin đầu vào, dữ liệu được gợi ý, hành động quyết định, kết quả đã lưu, người xử lý tiếp theo và đường phục hồi khi lỗi. UX-FLOW-001 đến UX-FLOW-010 sở hữu biểu hiện trên giao diện.

Một thao tác có thể tạo các **bản nháp** liên kết để giảm nhập lại. Không suy ra đã duyệt, đã nhận hàng, đã thu tiền hoặc đã phát hành hóa đơn từ việc tạo bản nháp. Các hành động có hậu quả khác nhau phải kiểm từng quyền và trạng thái; không dùng nút gộp để bỏ qua kiểm soát.

## SPEC-JOURNEY-002 — Hai điểm vào bán/mua, một liên kết nghiệp vụ

Bán hàng có thể bắt đầu từ danh sách đơn hoặc hồ sơ khách/công trình. Báo giá là nhánh khi khách cần; không bắt mọi đơn đã chốt qua điện thoại đi vòng tạo báo giá.

Mua giao thẳng có thể bắt đầu từ đơn bán còn thiếu nguồn hoặc từ màn đơn mua. Nếu đã có đơn bán, chọn đúng dòng còn cần hàng; nếu chưa có, dùng quy tắc hai bản nháp liên kết tại SPEC-CONFIG-002. Không nhập lại độc lập giá bán, không tạo đơn bán thứ hai khi người dùng chọn lại nguồn hoặc gửi lại yêu cầu sau mất mạng.

Khách, công trình, dòng vật tư, quy cách, liên hệ, kỳ/phạm vi công nợ được mang theo bằng định danh có kiểm quyền. Không dùng tên giống nhau để tự liên kết hoặc dựa duy nhất vào số điện thoại để gộp khách.

## SPEC-JOURNEY-003 — Gợi ý an toàn, không âm thầm thay giao dịch

Tự điền giá/quy cách/chi nhánh từ dữ liệu hợp lệ giúp giảm gõ. Trước chốt, phải thấy nguồn giá, đơn vị và tổng. Công trình có thể được gợi ý gần nhất nhưng người bán phải xác nhận đúng điểm giao; không tự chọn công trình cũ chỉ vì khách trùng.

Đổi khách, công trình có chính sách khác, hoặc đơn vị sau khi đã nhập dòng: tính lại phần phụ thuộc có kiểm soát và trình bày chênh lệch trước xác nhận. Giá nhập tay và snapshot đã chốt không được thay ngầm bởi giá gợi ý. Thiếu giá/quy đổi không tự dùng 0 hoặc hệ số 1.

Dữ liệu có quyền đọc hạn chế phải được lọc trước khi trả về giao diện; gợi ý tồn kho không có nghĩa đã giữ hàng, gợi ý nguồn không có nghĩa NCC đã đồng ý giao.

## SPEC-JOURNEY-004 — Bàn giao giữa người dùng phải nhìn thấy được

Sau mỗi hành động chính, giao diện nêu việc tiếp theo và người/nhóm được phép xử lý. Một người có thể kiêm nhiều vai trò nếu được cấp quyền; không yêu cầu thêm nhân sự chỉ để mô phỏng sơ đồ tổ chức.

Các danh sách "Chờ chọn nguồn", "Chờ phân giao", "Chờ xác minh" là bộ lọc/mô hình đọc từ trạng thái gốc, không bảng trạng thái nghiệp vụ thứ hai. Không tự chuyển sang "đã giao" chỉ vì không còn việc trong bể công việc.

Trường hợp giao thẳng do xe của NCC thực hiện không được giả tạo tài xế nội bộ/claim nội bộ. Hiền Xa vẫn theo dõi chuyến, đầu mối NCC, bằng chứng và phần xác minh của mình theo quyền.

## SPEC-JOURNEY-005 — Đo kết quả công việc, không thay bằng tốc độ API

Thành công trải nghiệm được kiểm bằng đúng khách/công trình, đúng giá/đơn vị, đúng nguồn, đúng khoản thu/chi và không mất thao tác khi lỗi. Thời gian người dùng hoàn thành nhiệm vụ khác thời gian phản hồi hệ thống tại SPEC-PERF-002.

Tiêu chí thời gian thao tác thử nghiệm thuộc UX-TEST-002, là mục tiêu đề xuất chưa phải kết quả đã đo hoặc bảo đảm dùng được. Không duyệt bằng việc đếm màn đã tạo, số dòng tài liệu hoặc kiểm tra header/ID.

## SPEC-JOURNEY-006 — Giới hạn thay đổi lần rà soát luồng

Đợt 3.1 làm rõ luồng đã được yêu cầu, không mở thêm CRM pipeline, POS độc lập, chatbot/AI điều phối, hệ thống workflow cấu hình, loyalty hoặc cơ chế thu tiền tự động. Không đổi POLICY-CREDIT/CUSTODY/BILLING/COST/PAYROLL/COMMISSION/INVOICE sang approved. Không bỏ các module đã chốt; chỉ giảm số thao tác và số thông tin hiển thị mặc định.

# SPEC-430 — Điều kiện hoàn tất, không tự tuyên bố an toàn

Hoàn tất tài liệu không đồng nghĩa hoàn tất phần mềm. Để dùng thật cần đồng thời: prototype các vai trò được người dùng thử/duyệt; các căn cứ ghi kho/công nợ/chi phí được chủ duyệt; test thực trên schema/command thật; quyền + dữ liệu + retry/concurrency đạt; đối soát migration; bằng chứng hiệu năng/UAT đúng build; các tích hợp đã xác minh, không mock; và Owner phê duyệt phát hành.

Có thể `READY_FOR_DESIGN` trước khi có quyền DB thật; không được biến thành `READY_FOR_SCHEMA` hoặc `READY_FOR_RELEASE`. Hạng mục provider chưa sẵn sàng giữ khóa; không đánh dấu toàn hệ thống hoàn tất bằng ngoại lệ "đã code adapter giả".

# SPEC-EXEC-003 — Bàn giao code khác nghiệm thu

Theo yêu cầu điều chỉnh 3.3, không còn 678 DoD lặp ở task. Đây là thay đổi nhịp thực thi, không xóa chức năng, invariant hoặc mục tiêu chất lượng. BUILD_ONLY làm code và kiểm kỹ thuật tối thiểu theo plan.md; nghiệm thu toàn diện do chủ tự thực hiện hoặc yêu cầu QA sau khi phần triển khai hoàn thành. Không tự dựng lại checklist đã bỏ.

PHASE_IMPLEMENTED chỉ là bàn giao kỹ thuật. Chưa QA/duyệt thì không coi sản phẩm đã nghiệm thu hay sẵn sàng Production. Những điều kiện dữ liệu/quyền/tiền/kho/phát hành ở SPEC-430 vẫn áp dụng trước dùng thật. Giữ kiểm bắt lỗi trực tiếp cho thay đổi nhạy cảm; hoãn QA không cho phép bỏ lỗi nghiêm trọng đã biết.

# SPEC-EXEC-004 — Nghiệm thu tách khỏi việc lập trình

`acceptance.md` sở hữu cách chọn và thực hiện các ca nghiệm thu theo hành trình, không sở hữu công thức, mục tiêu hiệu năng hoặc điều kiện nghiệp vụ mới. Yêu cầu và giới hạn vẫn lấy từ Spec; cách tương tác lấy từ UXUI. Khi có mâu thuẫn, ghi DOC_CONFLICT để sửa đúng nguồn, không thay yêu cầu bằng một bài test dễ hơn.

Trong BUILD_ONLY không đọc `acceptance.md` mặc định, không biến các ca trong đó thành checklist của backlog triển khai và không khôi phục DoD lặp đã bỏ. Kiểm kỹ thuật trực tiếp tiền/kho/quyền theo plan vẫn giữ. Chỉ khi chủ yêu cầu nghiệm thu/QA mới mở đúng phạm vi; chủ tự thử giao diện không được dùng thay bằng chứng kỹ thuật tiền/kho/quyền.

Trạng thái nghiệm thu và phạm vi đang mở thuộc tasks; log và bằng chứng thuộc implementation. `PHASE_IMPLEMENTED` khác `ACCEPTED`, và cả hai không tự cấp phép deploy, thay dữ liệu Production hoặc phát hành hóa đơn thật.



# SPEC-505 — Mandatory Recovery Audit trước implementation tiếp theo

## SPEC-GAP-001 — Audit trước khi sửa source

HEAD hiện tại đã có implementation R1–R9 nhưng chưa được coi là hoàn tất contract chỉ dựa trên commit message hay phase checkpoint.

Trước mọi source write sau khi nạp DOCSET 4.4, Codex phải chạy `GA-01..GA-06` trong `tasks.md` ở chế độ **READ-ONLY**.

Audit phải đối chiếu:

```text
Spec + UXUI
→ route/navigation
→ page/form
→ command/RPC
→ migration/schema
→ current task/implementation state
```

Audit chỉ `GA_COMPLETE` khi toàn bộ gap seed ở SPEC-GAP-002 có verdict:
`CONFIRMED / PARTIAL / DISPROVED / BLOCKED`.

`UNKNOWN` ở bất kỳ known gap nào → chưa được implement.

## SPEC-GAP-002 — Known gaps bắt buộc phải kiểm lại

1. Execution state/document drift so với HEAD.
2. Master-data CRUD/configuration coverage.
3. Quote/SO multi-line create.
4. Quote/SO/PO DRAFT edit.
5. Quick Customer/Site create trong Sales.
6. Price preview + authorized `MANUAL_APPROVED` override.
7. PO multi-line receive/direct fulfillment.
8. Delivery multi-line result/verify/return.
9. Customer 360/contextual actions.
10. Core list search/filter/server pagination.
11. Dashboard expense + commission + contextual drill-down.
12. Real actor/branch/org identity trong admin shell.
13. PaymentNotice discoverability.
14. Customer order debt/payment/documents.
15. Access management: role/branch/revoke/reactivate/permissions.
16. Settings/master-data entry surface.
17. Reports surface.
18. Audit-log surface.
19. Low-stock threshold + in-app alert.
20. Print/export: delivery note, receipt/payment voucher, debt reconciliation statement.
21. R10 Routing/GPS/Messaging.
22. R11 Electronic Invoice.
23. R12 Release/Migration/QA/Cutover scope.

Audit được phép thêm `NEW_GAP-*`.

## SPEC-GAP-003 — Severity

- **P0**: chặn core business flow hoặc có thể làm sai money/inventory/authorization/source-of-truth.
- **P1**: flow chạy nhưng không đạt contract UX/performance/operability quan trọng.
- **P2**: polish không chặn công việc.

Không nâng severity chỉ vì code style.

## SPEC-GAP-004 — Gate trước R10

R10 chỉ được mở khi:
- P0 từ R3–R9 = 0 open;
- P1 core contract = FIXED hoặc Owner-deferred;
- `tasks.md` và `implementation.md` đồng bộ HEAD;
- Sales → Sourcing → Delivery → AR/Payment có UI thao tác hoàn chỉnh;
- core lists không fetch toàn bảng không giới hạn;
- shell không hard-code identity/branch sample.

---

# SPEC-506 — Recovery Functional Requirements

## SPEC-REC-001 — Master data phải tự vận hành được

Actor có quyền phải create/edit/deactivate được tối thiểu:
- Customer;
- Site;
- Supplier;
- Material;
- UOM;
- material conversion;
- Warehouse;
- Vehicle;
- Machine;
- Branch;
- pricing/config cần cho transaction.

Không cần generic settings engine.

## SPEC-REC-002 — Quote/SO/PO nhiều dòng

Một chứng từ DRAFT hỗ trợ nhiều lines.

Mỗi line:
- material;
- UOM;
- quantity;
- resolved price/cost;
- source;
- line total.

Document hiển thị total exact.

Không dùng `lines[0]` như business contract khi schema cho nhiều lines.

## SPEC-REC-003 — DRAFT editable

DRAFT:
- add line;
- remove line;
- edit quantity/UOM;
- edit terms/date;
- price override theo quyền.

SENT quotation và CONFIRMED order/PO không sửa lịch sử; dùng revision/adjustment/cancel đúng contract.

## SPEC-REC-004 — Price preview

Trước Save, Sales user thấy:
- unit price;
- source;
- line total;
- document total.

Nếu không có pricing rule:
- không mặc định 0;
- actor có quyền được nhập manual price + reason;
- snapshot source = `MANUAL_APPROVED`;
- actor không có quyền không nhận cost/internal pricing data.

## SPEC-REC-005 — Quick Customer/Site

Từ create Quote/SO:
- create Customer;
- create Site;
- quay lại form;
- giữ draft input;
- auto-select entity mới khi an toàn.

## SPEC-REC-006 — Bounded core lists

Orders/Quotes/PO/Customers/Suppliers/Deliveries/AR/AP/ServiceJob:
- server-side search;
- relevant filters;
- server-side bounded page/cursor;
- deterministic sort;
- URL state.

Không fetch toàn branch dataset rồi render toàn bộ.

## SPEC-REC-007 — Operational workspaces

Customer workspace phải nối:
Sites → Prices → Quotes → Orders → Deliveries → AR → Payments/Documents.

Supplier workspace phải nối:
PO → Receipt/Direct Fulfillment → AP → Payment.

CTA contextual theo permission.

## SPEC-REC-008 — System operations surfaces

Phải có điểm vào permission-aware cho:
- Settings;
- Reports;
- Audit log;
- PaymentNotice queue;
- Low-stock alerts.

Không tạo generic builders.

## SPEC-REC-009 — Print/export

Ngoài quotation PDF:
- delivery note;
- receipt/payment voucher;
- debt reconciliation statement.

Các file dùng source/snapshot có trace, không tự gọi tax invoice.


# SPEC-510 — Ranh giới kiến trúc chống xây thừa

## SPEC-ARCH-001 — Nguyên khối theo mô-đun, gọi trực tiếp trong tiến trình

Hệ thống là **một ứng dụng, một cơ sở dữ liệu giao dịch chính**. Các mô-đun là ranh giới mã và quyền sở hữu dữ liệu, không phải dịch vụ mạng.

Mặc định:

```text
route / server action
→ xác thực + AccessContext
→ hàm use-case/command
→ transaction DB
→ hàm mô-đun liên quan
→ commit
→ response
```

Không gọi HTTP nội bộ giữa các mô-đun. Không dựng service mesh, message bus, saga hoặc distributed transaction cho các effects cùng DB.

## SPEC-ARCH-002 — Hàm trước, lớp trừu tượng sau

Mặc định dùng hàm/kiểu dữ liệu/module cục bộ. Không tạo:

- `BaseService`;
- `IRepository<T>` tổng quát;
- một lớp controller/service/repository cho mỗi bảng;
- interface chỉ có một implementation;
- dependency injection container riêng;
- aggregate/event/domain-object ceremony không bảo vệ invariant thực.

Chỉ tách abstraction khi có ít nhất hai nơi dùng thật hoặc một seam cần để test/provider.

## SPEC-ARCH-003 — Không biến toàn hệ thống thành event sourcing hoặc CQRS

Append-only bắt buộc chỉ cho các dữ liệu cần lịch sử bất biến như:

- inventory movement;
- posted obligation/payment/allocation/reversal;
- earning đã ghi nhận/duyệt;
- audit hành động nhạy cảm.

Customer, Site, Material, draft Quote/PO/SO, cấu hình và dữ liệu vận hành bình thường là bảng trạng thái thông thường với audit phù hợp. `read service`/`command` là cách tổ chức code, **không** có nghĩa tạo hai database, event store hoặc projection bền vững cho mọi bảng.

## SPEC-ARCH-004 — Projection và cache chỉ sau nhu cầu thật

Mặc định read model là query/view/RPC có chỉ mục phù hợp. Không tạo bảng projection riêng, materialized view, cache phân tán hoặc invalidation framework trước khi:

1. query đúng đã tồn tại;
2. dữ liệu đại diện được đo;
3. kết quả không đạt ngân sách;
4. giải pháp đơn giản hơn như index/query rewrite không đủ.

Dashboard có thể dùng query tổng hợp chuyên biệt vì đó là một read model thật; không suy ra mọi list cần projection.

## SPEC-ARCH-005 — Cấu hình có kiểu, không rules engine

Các policy đã biết dùng cột/enum/bảng có kiểu và phiên bản hiệu lực. Không tạo DSL, expression engine, workflow builder hoặc JSON rule interpreter để dự phòng chính sách tương lai.

Compensation hỗ trợ các basis đã chốt bằng calculator tường minh; thêm basis mới khi có yêu cầu thật.

## SPEC-ARCH-006 — JSON chỉ cho metadata không authoritative

Dữ liệu cốt lõi dùng cột quan hệ có kiểu, FK/check/unique. JSON/JSONB phù hợp cho:

- payload provider cần lưu nguyên trạng;
- metadata hiếm không tham gia invariant;
- audit context phụ.

Không nhét line items, quyền, công nợ, trạng thái hoặc số lượng authoritative vào JSON để tránh thiết kế schema.

## SPEC-ARCH-007 — Idempotency đúng chỗ

Không mọi CRUD đều cần idempotency framework. Bắt buộc ở lệnh có thể bị gửi lại và gây hậu quả như confirm, reservation, verify, payment, claim, route apply, message retry, invoice issue.

Draft autosave/update thông thường dùng optimistic version/conflict khi phù hợp, không bắt mọi request qua một operation table.

## SPEC-ARCH-008 — Một cơ chế job khi xuất hiện nhu cầu đầu tiên

R1 không triển khai job/outbox runner tổng quát. Đến lần đầu có ranh giới bất đồng bộ bắt buộc, triển khai **một** cơ chế tối thiểu theo SPEC-SEC-004 và dùng lại. Không mỗi mô-đun có queue riêng.

## SPEC-ARCH-009 — Migration theo lát cắt, không theo mỗi bảng

Trong local development có thể lặp schema. Khi chốt một lô liên quan, tạo migration sạch/coherent cho lát cắt đó. Không bắt một migration cho mỗi task nhỏ nếu chỉ làm lịch sử nhiễu; cũng không gom toàn hệ thống vào một migration khổng lồ.

## SPEC-ARCH-010 — Không đa tenant, đa provider hoặc đa branding nếu chưa có yêu cầu

Branch là phạm vi vận hành, không tenant. Không thêm tenant abstraction, plugin architecture, nhiều provider cùng lúc, white-label/theme engine hoặc feature-flag platform chỉ vì có thể cần sau này.

---

# SPEC-520 — Quyền sở hữu domain và effects xuyên mô-đun

| Mô-đun | Sở hữu authoritative | Không sở hữu |
|---|---|---|
| Identity/Access | tài khoản, nhân viên, branch access, role/permission, membership | số dư, trạng thái giao |
| Catalog/CRM | vật tư/UOM, customer/site, supplier, pricing metadata | quote/order ledger, công nợ |
| Sales | báo giá/revision, SO, snapshot thương mại, credit commitment | stock movement, payment |
| Purchasing | PO, giá mua, supply allocation, căn cứ mua | warehouse balance, AR |
| Inventory | movement, reservation, custody position, costing snapshot | trạng thái thanh toán |
| Delivery | delivery, assignment thực thi, actual/accepted/billable quantity, proof link | ledger tiền |
| Finance | AR/AP, payment/allocation/advance/reversal, expense, reconciliation | chỉnh sửa quantity nguồn |
| Workforce/Service | WorkItem, ServiceJob, WorkLog, earning basis | payment, customer AR trực tiếp ngoài source command |
| Invoicing | invoice intent/status/document/coverage | tạo doanh thu hoặc AR lần hai |
| Routing/GPS/Messaging | kế hoạch/telemetry/conversation | tự đổi order/delivery/payment |

## SPEC-ARCH-011 — Orchestrator use-case được phép ghi nhiều mô-đun trong cùng transaction

Một hành động người dùng có thể cần effects ở nhiều mô-đun. Không dùng event bus để né transaction.

Ví dụ:

```text
verifyDelivery
→ khóa Delivery
→ xác minh quantity
→ hoàn tất custody Inventory
→ tạo Receivable/Revenue source effect
→ audit
→ COMMIT
```

Các mô-đun vẫn sở hữu invariant riêng; orchestrator gọi hàm domain cục bộ trong cùng transaction. Không một mô-đun tự UPDATE bảng của mô-đun khác bằng SQL rải rác.

## SPEC-ARCH-012 — Effects bên ngoài luôn sau commit

Gọi provider bản đồ/hóa đơn/tin nhắn ngoài hệ thống không nằm trong transaction giữ lock. Nếu cần bảo đảm tiếp tục sau commit, ghi intent/job bền vững theo SPEC-SEC-004; nếu chỉ là đọc/gợi ý có thể gọi đồng bộ với timeout/fallback.

---

# SPEC-530 — Lát cắt backend chuẩn để Codex triển khai

Khi implement một luồng, ưu tiên đủ một lát cắt nhỏ thay vì dựng hạ tầng chung trước:

```text
schema tối thiểu
→ command/query thật
→ quyền
→ UI cần thiết
→ check rủi ro của lát cắt
```

Thứ tự này không bắt mọi task phải có UI. Nó ngăn tình trạng tạo hàng chục bảng/service chưa có hành trình dùng.

Các lát cắt ưu tiên:

1. Customer/Site/Price → tạo SO.
2. SO → nguồn kho/NCC.
3. Warehouse → bàn giao → verify Delivery → AR/cost.
4. Supplier Direct → supplier verification/AP + customer verification/AR.
5. AR → Payment/Allocation → Dashboard.
6. ServiceJob → Verification → AR/Earning.
7. Return/Adjustment → stock/AR/cost delta.
8. Invoice intent → external provider → reconciliation.

Mỗi lát cắt dùng cùng entity/source hiện có; không tạo bản ghi “workflow state” thứ hai chỉ để theo dõi tiến độ.

# SPEC-FB7 — Góp ý Owner 22/10/2026 (D27)

## 1. Thợ lấy hàng và giao hàng, giao xong là xác minh
- Luồng phiếu giao: Lập phiếu → **Phân người & xe** (nhân viên; việc tự sang cổng thợ, trạng thái việc CLAIMED) → **Thợ lấy hàng lên xe** →
  **Thợ đã giao** (Hoàn tất). Không còn bước "Tới nơi" trên trang phiếu giao.
- "Đã lấy hàng lên xe" (`portal_delivery_loaded`): chỉ người đang được giao việc, phiếu ở ASSIGNED, 1–5 ảnh (ảnh `WORK_RESULT`, mỗi ảnh gắn một nơi,
  bảng `delivery_handoff_portal_evidence`); số lượng mặc định theo kế hoạch, "Lấy thiếu" nhập số thực lấy. Ghi bàn giao như `handoff_delivery_actual`
  (trừ kho, phiếu DISPATCHED); việc → IN_PROGRESS. Idempotent (command_receipts + payload hash).
- "Đã giao" (`submit_portal_delivery_done`): ghi kết quả rồi **tự xác minh** (số khách nhận = số tính tiền = số thợ báo): công nợ, doanh thu, giá vốn
  như `verify_delivery`; phần còn trên xe nhập lại kho xuất (return case TRANSIT_REMAINDER → RETURNED); việc VERIFIED (thu nhập theo quy tắc sẵn có).
  Giao thiếu / không giao được cũng tự xác minh; ghi chú không bắt buộc. Xác minh lỗi kế toán (vd thiếu hạn mức) không chặn thợ: phiếu giữ
  RESULT_SUBMITTED và nhân viên nhận thông báo "Cần xác minh tay …".
- Trang quản lý: form bàn giao / báo kết quả nằm trong "Làm thay thợ (khi thợ không dùng được điện thoại)"; báo thay thợ bởi người có `delivery.verify`
  cũng tự xác minh. Phiếu đổi trạng thái từ trang quản lý thì việc bên cổng thợ đổi theo (RESULT_SUBMITTED/VERIFIED → DONE/VERIFIED, CANCELLED →
  CANCELLED); việc treo của phiếu đã xác minh/hủy được đóng một lần (CANCELLED, không tạo thu nhập hồi tố).
- Cổng khách: đơn giao đủ (FULFILLED) hiện **"Hoàn tất"**.

## 2. Bước tiếp theo luôn hiện
- Đơn bán CONFIRMED/CLOSED luôn có khung "Tiến độ đơn …" (ngay sau xác nhận: "Đã xác nhận … — bước tiếp theo"; giao đủ: "… đã giao xong") với từng
  phiếu giao và trạng thái mới, nút Thu tiền / In đơn / Tạo đơn mới cho khách này. Đơn mua CONFIRMED luôn có `PurchaseNextSteps`.

## 3. Cổng khách — Tài khoản
- `customer_portal_account(target_customer_id)` (security definer, theo membership, không cấp anon): mã, tên, loại, SĐT, email, địa chỉ, MST, hạn
  thanh toán (chỉ Chủ tài khoản/Kế toán), vai trò cổng, công trình đang dùng. Trang `/customer/profile` "Tài khoản": đăng nhập bằng, thông tin khách,
  quyền, địa chỉ giao hàng, Đổi mật khẩu (tự nguyện), Đăng xuất.

## 4. Trang chủ chọn cổng
- `/` chưa đăng nhập nội bộ: ba thẻ **Khối vận hành** (`/login`), **Thợ & tài xế** (`/work/login`), **Khách hàng** (`/customer/login` + **Đăng ký**
  `/customer/register`). Nhân viên đã đăng nhập vẫn chuyển thẳng vào trang làm việc. Màn đăng nhập ghi tên cổng và "← Chọn cổng khác".

## 5. Hao hụt kiểm kho
- Duyệt phiếu kiểm có dòng giảm: trigger `stock_counts_record_loss` ghi **một** chi phí APPROVED, `settlement = NON_CASH`, loại "Hao hụt kiểm kho"
  (tự tạo nếu chi nhánh chưa có), số tiền = tổng giá trị các movement giảm (giá vốn bình quân × số lượng), mô tả "Kiểm kho KK-…: {vật tư} −{SL} {đvt}
  ({ghi chú})", người nhận "Kho {tên kho}", gắn `stock_count_id` (duy nhất). Không tạo phiếu chi, không tạo công nợ NCC. Lệch tăng không ghi.
- Lợi nhuận trừ khoản này (chi phí đã duyệt, tính lợi nhuận). Sổ quỹ hiện khung "Chi phí không dùng tiền trong kỳ (hao hụt kho)", không tính vào số dư.
- Ghi chú lệch không bắt buộc; để trống thì lưu "Lệch khi kiểm kho".

## 6. Công trình
- Form công trình bỏ vĩ độ, kinh độ, khung giờ nhận; cột DB giữ nguyên, dữ liệu cũ không mất.

## 7. Lý do không bắt buộc
- Danh mục, giá bán/mua, bảng giá, nhóm giá, đơn vị, hàng cùng loại, quyền, cài đặt: **không còn ô lý do**.
- Hủy chứng từ, điều chỉnh công nợ, đảo phiếu, giá tay, vượt hạn mức, chuyển kho, trả NCC, tín dụng khách, hoa hồng, hóa đơn, trả hàng, thợ từ chối
  việc, tài khoản cổng khách, kiểm kho: ô **"Ghi chú (không bắt buộc)"**.
- DB vẫn đòi lý do ≥ 3 ký tự ở các RPC và `audit_events`; server gửi `reasonOrDefault(ghi chú, câu mặc định)` (`src/lib/core/reason.ts`).

## 8. Chi phí kiểu KiotViet
- `expenses`: `supplier_id` không bắt buộc; `payee_kind` OTHER/SUPPLIER/EMPLOYEE, `payee_name`, `employee_id`, `settlement` PAYABLE/PAID_NOW/NON_CASH,
  `counts_in_profit`, `stock_count_id`. Ràng buộc: SUPPLIER ⇒ có NCC; PAYABLE ⇒ SUPPLIER. Dữ liệu cũ = SUPPLIER/PAYABLE.
- `record_operating_expense(...)` (quyền `finance.expense.manage`; trả ngay cần thêm `finance.payment.post`): ghi + duyệt một bước; loại chi chọn hoặc
  gõ mới (tự tạo, so tên không phân biệt hoa thường); **Đã trả ngay** → phiếu chi trong Sổ quỹ từ quỹ chọn (tiền mặt → CASH, ngân hàng →
  BANK_TRANSFER), với NCC thì cấn ngay khoản phải trả vừa tạo; **Ghi nợ NCC** → công nợ phải trả theo hạn NCC. Idempotent.
- `payments` cho phép phiếu chi không đối tác khi có `expense_id` + `payee_name`; `payment_read`/`expense_read` hiện tên người nhận.
- Lợi nhuận (`finance_dashboard_snapshot`) chỉ cộng chi phí `counts_in_profit` (bỏ chọn khi mua tài sản dùng lâu như xe). Chi phí chuyến giữ nguyên.

## 9. Form lỗi
- `ReliableCommandForm` không còn "Bắt đầu thao tác mới": từ chối → giữ giá trị, đổi `operationId`, đánh dấu + focus ô lỗi (`field` trong kết quả);
  thành công → tự sẵn sàng nhập mới; chưa rõ kết quả (mất mạng) → vẫn "Tra cứu kết quả" / "Thử lại cùng thao tác".

# KẾT THÚC Spec.md


## SPEC-OPMOD-001: Owner-approved operational enhancements (2026-10-09)

Catalog CRUD belongs to the owning ERP module. Products own materials/groups/UOM/conversions and Sales pricing; Customers own customers/sites; Suppliers own supplier master; Inventory owns warehouses; Dispatch owns vehicles/machines; Settings owns branches and access. Reuse existing editors, RPCs, validation, permissions, RLS and audit. Legacy catalog URLs must redirect with record/search context preserved. Manage-only permissions retain their existing authorized workspace; no reader or price permission is inferred.

Follow in six scoped PRs: PR00 module ownership; PR01 read-only material detail using canonical price/UOM/inventory readers; PR02 automatic authoritative price preview without changing saved snapshots; PR03 warehouse availability and existing reservation/handoff integration, never extra stock posting; PR04 audited draft cancellation, never hard-delete posted history; PR05 optional final discounted Sales unit price, exact VND arithmetic and authorized/audited adjustments, retaining reasons for floor/approval exceptions. No independent price/stock store or new ERP architecture.

Production UAT cleanup is independently PASS; real opening balances are not supplied or approved as zero. Real compensation remains inactive pending Owner policy. No synthetic business writes are permitted on clean HX for feature acceptance. QA and read-only live acceptance remain separate release gates.


## OP-CUTOVER-01: Bảo vệ nhập lịch sử tùy chọn; rule opening pending đã bỏ

Giao dịch mới không phụ thuộc dữ liệu đầu kỳ, trạng thái đối chiếu lịch sử hoặc kích hoạt thủ công. Chi nhánh mới không tự tạo quy trình opening pending. Quyền và phạm vi chi nhánh, trạng thái chứng từ, phiên bản, nguồn, lượng khả dụng, giới hạn tiền và chống ghi lặp vẫn được giữ tại RPC/RLS/trigger. Lịch sử chưa biết vẫn chưa đối chiếu; không được giả định bằng 0 hoặc tự đánh dấu đã xác minh.

The accepted importer is unchanged. A private adapter prepares related masters and an exact mapped opening manifest without posting openings or recording an import receipt. A protected package registry verifies source bytes/hash, canonical parsed package, branch/run, supported writer payloads, actor, expiration and recovery evidence. Separate authenticated canonical Owner confirmation is required. Opening ledger effects must match the approved source manifest; historical import authorization is separate from ordinary source-backed posting. Failed runs roll back; exact committed retries are read-only. Independent committed source/ledger readback is required to verify an optional historical import. No operational activation follows or is required. No generic admin or session-flag bypass. M/N unsupported and O decision boundaries remain unchanged.

UI shows the historical data scope, never treats an empty ledger as verified opening-zero, and has no activation control. Production opening foundation remains unapplied; when eventually authorized, its new source tables must receive gate triggers before the secure importer can run. REAL_IMPORT_AUTHORIZATION=NOT_GRANTED; PRODUCTION_OPENING_WRITES=0; PRODUCTION_BUSINESS_ACTIVATION=NOT_EXECUTED.

Implementation: 20261009173806_secure_operational_posting_gate.sql; scripts/operational/authorized_openings.mjs; src/modules/operations; /admin/operations. Managed QA: 53 targeted checks PASS, including 31/31 present guarded boundaries, strict package authorization, rollback, fresh logical-client committed readback, same/new-run idempotency, READY/ACTIVE audit, and concurrent activation/posting serialization. Gate migration SHA256 f03146a6ad1b98003b34f0d6793ee51654bf763abf7f476668606c18cc60d50e applied once in QA; no historical replay. Wrapper 8/8 and UI state 3/3 tests, typecheck, lint (no errors), webpack Production build PASS. Production has a different migration history and lacks the optional opening inventory/cash foundation: deploy only this gate, protect all 29 currently present boundaries, and keep the opening importer fail-closed until the separately authorized foundation/guard installation. CI, Production recovery/apply and deployment remain pending; no Production openings, import approval or activation.


## OP-UPDATES-QA-20261010: remaining operational gaps and release barrier

Authoritative main baseline: 0e1a68ba21c01c92a37437daa0a50087f551e8b9. Dedicated branch codex/operational-updates-qa-gated. Production access, migrations, writes, main merge and deployment are forbidden until the complete final QA gate passes; previous PR39 Production evidence is context only. No real openings, real import approval or HX activation.

| Requirement | Verified existing implementation | Actual remaining gap |
|---|---|---|
| Native catalogs | PR33 shared catalog editor, scoped RPCs, legacy redirects | Supplier purchase-rule management has no route or canonical writer |
| Material detail | PR34 canonical material/UOM/pricing/warehouse readers | Recent movements and contextual Sales/Purchase draft actions missing |
| Automatic prices | PR35 canonical engines and stale-preview checks | Raw bigint price columns lose precision in JS JSON transport |
| Inventory | PR36 authoritative on-hand/reserved/available and source commands | Reuse unchanged; never edit balances or add stock storage |
| Safe removal | PR37 canonical SO/PO cancellation and history | Reuse; quotation cancellation is not an invented workflow |
| Optional Sales price | PR38 exact final-unit price and permission/audit | Linked Direct Sales still requires routine note |
| Posting gate/importer | PR39 and separate direct-Draft forward | Reuse unchanged; no opening foundation/activation in this feature scope |

Purchase manual-cost routine note is also still mandatory. Ordinary authorized amounts at/below a valid current reference receive deterministic before/after/rule/version metadata; no-reference/increased-price cases retain explicit exception justification. Existing permission and SQL approval guards remain authoritative. This is not a new price-floor policy or generic automatic approval. Actor, transaction timestamp, document and line provenance remain in canonical snapshot/receipt/audit relations.

Use existing purchase_price_rules, shared PricingRuleEditor and existing permissions; add only scoped, audited version/create/deactivate commands with optimistic version, operation idempotency and source-level serialization. No new price table, stock table, generic repository or workflow engine. Recent material movements use inventory_movement_read, branch/material filters and a 20-row bound, with no cost columns. VND reads are text, calculations remain Decimal/BigInt.

Source evidence confirms OPUP_PRICE_PRECISION_01: synthetic QA PostgreSQL JSON bigint 9007199254740993 arrives as JS number 9007199254740992. No business write was needed to reproduce. Other gaps are confirmed from routes, shared editor, action builders and managed QA RPC definitions. QA Preview config is separately verified: QA URL, matching publishable-key fingerprint, no shared variables and no Production server credential; hosted runtime identity must still be pinned before browser tests.

QA01..QA20 are all required and currently PENDING in this new acceptance run: module routes; catalog CRUD; material/pricing visibility; Sales auto-price; Purchase auto-price; effective/version snapshots; warehouse quantities; reservation integrity; receipt/handoff stock accounting; safe draft cancellation; posted-history protection; optional discounted price; routine-reason UX; override permission/audit; finance/report totals; posting gate; branch isolation; cost confidentiality; retry effects; Supplier Direct. Reuse only exact unchanged valid evidence; modified seams require fresh managed and genuine browser evidence (Owner, Sales, Purchasing, Warehouse, unauthorized; desktop/mobile/error/stale/confirmation).

Forward candidate: 20261009224842_supplier_purchase_price_commands.sql. SHA256 03a836fe1aef1ab1f683260bd03e407f3fe9ee1657c9593e9e95545ffb7097e2. Managed rollback rehearsal 25/25 PASS; exact QA apply once, independent committed readback, old history/RLS/table grants/triggers unchanged PASS. Local targeted tests 84/84, typecheck, lint and QA-configured webpack build PASS. FINAL_QA_ACCEPTANCE remains PENDING until QA01..20 and genuine role/desktop/mobile UI evidence complete. No historical migration rewrite or QA-to-Production history blanket sync. Local checks, managed QA, browser UAT, security/data integrity and CI must all pass on the reviewed source before Production preflight. HX can record valid new transactions without opening data or activation. Optional historical import and Production release safeguards remain separate requirements.


## REM-G01-G23 contract

Owner G01–G23 prompt authorizes source/schema, isolated QA, commits and Draft PR; no Production/merge/deploy. Supersedes OP-CUTOVER-01 mandatory opening/manual activation for new operations; protected historical import/immutability retained, not expanded. Single agent, sequential packages; stage1 G01/G05/G21 active. Track decisions/status/evidence in reports/business-flow-remediation. Old acceptance is reference only, not repair PASS.
