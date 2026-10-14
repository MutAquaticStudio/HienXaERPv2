# Ma trận nghiệm thu hiện tại

Phạm vi đánh giá: ứng viên local, MVP1 XLSX; tạo SO nháp và PO nhập kho nháp. Kết quả local không đại diện browser/QA thật.

| ID | Thao tác / vai trò | Nguồn → đích và kỳ vọng | Kết quả | Bằng chứng còn thiếu |
|---|---|---|---|---|
| BI-01 | Mở import khi feature off; người dùng SO/PO | Chưa ghi run/file; trang không lộ nút nhập; tạo đơn thủ công vẫn dùng được | PASS trong native DB cho DB gate; build nhận routes. UI chưa chạy browser | Browser theo đúng role trên Supabase QA |
| BI-02 | Đăng ký `.xlsx`; actor có quyền tạo/đọc theo branch | Tạo run và file trong một transaction; owner/branch/kind khớp; quá hạn mức bị từ chối, không để run rỗng | PASS trong Auth shim native, gồm limit | Supabase Auth/RLS/Storage thật; hai actor cùng browser |
| BI-03 | Tải/verify tệp; nhân viên được phép import | Private object ≤10MB, digest khớp, parser có giới hạn, không đọc file actor/branch khác | Parser 5/5; actor boundary/Storage policy trên bảng mock PASS | Upload signed URL Supabase thật, oversized/chunked HTTP browser tests |
| BI-04 | Ghép nhiều đơn; bán hàng hoặc mua hàng | Người dùng chọn một đơn, mã nguồn hoặc cột nhóm; không mặc định một file = một đơn | Mã/UI được rà soát; native save review PASS | Browser UAT với XLSX thực tế của doanh nghiệp; mapping nhiều sheet |
| BI-05 | Đối chiếu master data | Mã ERP exact; tên chưa chắc là NEEDS_REVIEW; trùng là AMBIGUOUS; không tạo master; branch/customer/site/warehouse đúng scope | Kiểm tra mã; không có browser/Auth DB test trực tiếp | Ma trận cross-branch và master inactive trên Supabase QA |
| BI-06 | Preview SO/PO | Dùng helper giá/lượng canonical; source price chỉ tham khảo; manual price cần permission và lý do | Code đã kiểm tra; SO/PO canonical line path chạy native | Unit/integration action với bảng giá/role thật, giá stale giữa preview và submit |
| BI-07 | Bấm tạo SO nháp; bán hàng | Candidate payload/operation ID → `create_sales_order_draft`; retry cùng ý định không sinh SO thứ hai | PASS; SO được tạo một lần, retry trả kết quả cũ | Browser action timeout/mất mạng thật |
| BI-08 | Bấm tạo PO nhập kho nháp; mua hàng | Candidate payload → `create_purchase_order_draft`; direct linked PO bị chặn; không receive stock | PASS cho PO kho nháp qua native RPC | Browser role mua hàng và quyền giá thật |
| BI-09 | Nhập lại mã nguồn; người tạo có quyền | Cùng branch/kind/namespace/period/reference phát hiện duplicate; tạo lại cần chọn chứng từ trước và ghi lý do | PASS; duplicate bị chặn, repeat có occurrence 2 và audit | Đối chiếu manual SO/PO cũ không có source lineage: hiện chưa nhận diện được nếu không có bulk metadata |
| BI-10 | Hai yêu cầu tạo cùng source đồng thời | Khóa DB/unique occurrence; chỉ một chứng từ chiếm occurrence tiếp theo | PASS: một CREATED, một DUPLICATE | Race qua hai phiên Supabase thật |
| BI-11 | Lưu phần rà soát chưa hợp lệ rồi sửa | NEEDS_REVIEW không có candidate; sửa mã/đơn vị/lượng → xem lại → READY, không tạo run mới | PASS native; harness bắt lỗi JSON null/state và đã kiểm tra lại | Browser giữ input và hướng dẫn sửa sau lỗi mạng |
| BI-12 | Một file nhiều chứng từ, một số tạo được/một số lỗi | Từng chứng từ độc lập; created/duplicate được giữ khi lưu review tiếp; lỗi không rollback chứng từ khác | PASS về lưu/trạng thái metadata | Browser E2E tạo nhiều chứng từ trên QA, thao tác tiếp từng nhóm |
| BI-13 | Reload/mất phản hồi sau commit | Run/file/document/operation receipt cho phép tra cứu và không lặp ghi | PASS native lookup/retry; route/action có readback | Mất mạng thực trên trình duyệt/Supabase và Storage |
| BI-14 | Tạo DRAFT SO/PO | Chỉ chứng từ thương mại nháp; không stock movement/reservation/supply/AR/AP/cash/revenue/opening giả | PASS native, các ledger count không đổi | Xác nhận trên database QA thực có nguồn dữ liệu cô lập |
| BI-15 | Hết hạn 30 ngày | Không đọc/reverify; cron service role xóa object và đánh dấu file/run | PASS logic RPC local; route/build PASS | Cron Vercel thật, Supabase Storage thật, log lỗi/retry và cấu hình secrets |
| BI-16 | SO/PO hiện hữu không qua import | Các trang tạo thủ công/RPC canonical giữ hành vi; recovery adapter cũ giữ grants | Test hồi quy 669 PASS; native so public ACL PASS | CI theo commit PR và UAT thủ công |

**Chưa nghiệm thu:** giao diện browser desktop/mobile theo role; upload/download Supabase thật; signed URL, RLS Storage thật; production/QA migration thực tế; review độc lập và CI. Không chuyển các mục này thành PASS từ build hoặc native harness.
