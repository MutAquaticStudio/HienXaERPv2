# Nâng cấp/khôi phục — đang hoàn thiện

Chỉ forward migrations mới; không sửa lịch sử đã áp dụng. QA: fresh schema từ0 và upgrade clone có dữ liệu86 migrations PR41. Gói apply transactional, data/effect/hash và recovery archive; không Production.

Old OPEN count thiếu basis mới phải đếm lại, giữ history; old APPROVED/posted không tính lại/overwrite. Dữ liệu cũ cần quyết định xuất impact list, không tự sửa số dư.

Sau source refund/transfer/vendor-return mới, down migration/xóa bảng không phải recovery. Diễn tập QA restore; Production recovery/cutover cần phê duyệt riêng và reconcile dữ liệu mới.

## Package1 evidence

89 migrations từ0 PASS trên native17 application schema + Auth shim; không phải managed Auth/Storage recovery. Upgrade86→89 giữ nguyên columns/rows business đã có; 3 forward files, gồm qualifier correction trước nghiệm thu. Archive native trước gói restore102 public tables/86 history, hash/count khớp. Không Production.

Các87..89 phải triển khai như gói trước mở lưu lượng mới; không cho phép operator dùng chức năng giữa file87 và88. Source87 không sửa sau QA apply; correction88 giữ lịch sử forward. Old OPEN count phải ghi lại basis; old APPROVED không tính lại.
