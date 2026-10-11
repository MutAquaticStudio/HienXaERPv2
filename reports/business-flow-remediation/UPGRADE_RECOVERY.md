# Nâng cấp/khôi phục — đang hoàn thiện

Chỉ forward migrations mới; không sửa lịch sử đã áp dụng. QA: fresh schema từ0 và upgrade clone có dữ liệu86 migrations PR41. Gói apply transactional, data/effect/hash và recovery archive; không Production.

Old OPEN count thiếu basis mới phải đếm lại, giữ history; old APPROVED/posted không tính lại/overwrite. Dữ liệu cũ cần quyết định xuất impact list, không tự sửa số dư.

Sau source refund/transfer/vendor-return mới, down migration/xóa bảng không phải recovery. Diễn tập QA restore; Production recovery/cutover cần phê duyệt riêng và reconcile dữ liệu mới.

## Package1 evidence

89 migrations từ0 PASS trên native17 application schema + Auth shim; không phải managed Auth/Storage recovery. Upgrade86→89 giữ nguyên columns/rows business đã có; 3 forward files, gồm qualifier correction trước nghiệm thu. Archive native trước gói restore102 public tables/86 history, hash/count khớp. Không Production.

Các87..89 phải triển khai như gói trước mở lưu lượng mới; không cho phép operator dùng chức năng giữa file87 và88. Source87 không sửa sau QA apply; correction88 giữ lịch sử forward. Old OPEN count phải ghi lại basis; old APPROVED không tính lại.

## Package3 — dữ liệu đang mở

Gói95–103 chỉ forward, old public columns/rows giữ nguyên per-apply manifests. Fresh103 từ0 PASS. File95–98 có sửa tiếp theo cho immutable assignment/zero load/read boundary; phải triển khai toàn gói trước mở lưu lượng. Không rewrite forward đã áp dụng QA.

Existing vehicles giữ cap/UOM nhưng căn cứ xác minh mới NULL, không được tự gắn đã xác minh. Owner chủ động nhập căn cứ qua danh mục; cap/UOM không đổi được xác minh kể cả xe đang được phân. Người trên assignment cũ thiếu work.claim phải được rà: trước bắt đầu có thể reassign người đủ quyền; đã bắt đầu không đơn giản đổi, cần quyết định/bàn giao có căn cứ. Không tự đổi role, phiếu hoặc số dư lịch sử để thông qua. Nhiều warehouse trong một phiếu cũ phải review/tách trước xuất; không giả tất cả đã lấy cùng lúc.

## G07 — forward104–109

Toàn gói giữ nguyên dữ liệu/cột nghiệp vụ cũ theo mỗi apply manifest; không tự tính lại advance hoặc sửa lịch sử. Advance consumption mới chỉ phân loại allocation thực, không tạo cash event. Giữ compatibility canonical RPC, cho phép nhiều partial intents cùng nguồn/nợ. Read permission phân AR customer/AP supplier; private balance helpers không mở EXECUTE. Forward109 sửa caller EXECUTE của function trong view qua guarded public reader, không mở raw helper.

Fresh109 từ0 PASS native PG17/Auth shim. Triển khai cùng gói trước mở chức năng mới vì các forward reader/permission correction phải có đủ. Backups pre-apply riêng tư600; không claim đã diễn tập restore109 hay Managed Auth/Storage recovery. Không Production apply.

## Tổng cargo110–112 và archive109

Loading legacy/actual khóa xe trước warehouse custody; tính cargo của vehicle tại handoff thực, không dựa vào lịch hoặc execution state để xóa hàng. Return/loss terminal giải phóng lượng thực; direct không có inventory transit giả. Catalog cap/UOM/active giữ nguyên khi xe còn cargo, cập nhật lại cùng cap/căn cứ vẫn theo contract cũ. Exception board lấy loaded−accepted−terminal resolved, giữ report gốc.

Apply110/111/112 mỗi gói transactional, hash/count tất cả cột/dòng cũ giữ nguyên. Fresh112 từ0 PASS. Backup pre110109 restore104public tables +109history khớp; bổ sung này supersedes giới hạn restore109 ở đoạn trên, vẫn không Managed Auth/Storage/PITR. Scan existing QA phát hiện3xe giả20 vớicargo42/28/28 từ test cũ. Migration không tự sửa; bản nâng cấp cần đọc impact và xử lý nguồn/mức nhận/trả/loss bằng nghiệp vụ trước lấy thêm. Không gọi dataset cũ sạch bằng cách rewrite hàng đã ghi.

Advisors111 và restored109 cùng11definer view ERROR/5permissive policy WARN; không có finding mới110/111 nhưng advisor chưa clean. Không đổi views sang invoker mù quáng vì masked/cost-column reader cần contract và negative role tests; broad cross-branch/cost sweep cuối còn chờ.
