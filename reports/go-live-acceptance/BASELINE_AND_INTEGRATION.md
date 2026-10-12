# Nền và quyết định tích hợp

Ngày2026-10-12. Candidate branch `codex/go-live-acceptance` tại worktree riêng; nền `e7f17406e0fdf380f24df5e33b9cadd025bf7f99`, source `ad364cb`. Remote main `e3b3524`; PR41/42 chưa merge.

Checkout gốc79b0b91 vẫn61 tracked/67 untracked entries,19migration. Bản sao riêng tư12534file/542338186byte đã tạo, tar117762194byte mode600; manifest SHA từngfile nằm ngoài repo. Không mang credential hoặc outputs doanh nghiệp vào Git.

Code/schema nghiệm thu: cây PR42, phần local được giữ theo bảng dưới và các forward175–177. Không hạ về main/PR41. Người dùng đã cho phép merge/Production sau khi đạt đầy đủ cổng; hiện các cổng chưa đạt.

Đích Production cần người dùng chọn vì có hai URL lịch sử. `hien-xa-erp-v2-nu.vercel.app` hiện200, Vercel project prj_o6ya9YI1b3fTFC8nxiOtjHiwaS3W/team hienxa/account thunderekt-6020, deployment dpl_EBjgf4qEUdv3BjnfqwECN4A32V8v. `app.hienxavlxd.com` hiện402/DEPLOYMENT_DISABLED. Supabase nbwynrwkdbtfsitafsxa history78,last20261009224842,2branches,1SO,0payments,0Storageobjects — chỉ đọc; chưa schema drift/backup/recovery.

Kiểm tra lại khi tiếp tục: main vẫn `e3b3524d6da3ced2a8269f444721aa7fe91a1be8`, PR42 vẫn `e7f17406e0fdf380f24df5e33b9cadd025bf7f99`, nháp/chưa merge. Production vẫn78 migration,1 SO,0 phiếu tiền,0 object Storage,0 metadata minh chứng portal/nội bộ. Chưa suy rằng URL doanh nghiệp đã được sửa.

Môi trường native trong thư mục tạm đã mất sau gián đoạn. Bản sao riêng `browser-pre177.dump` được phục hồi sang cụm riêng lưu bền; hash nội dung122 bảng public khớp. Bản sao ở mốc schema176, trước các ca boundary/service/multi sau đó; giữ bằng chứng các ca ấy, không replay ghi sổ để tái tạo lịch sử. Chỉ áp dụng forward177 cho bản phục hồi. Fresh177 và bản phục hồi177 khớp toàn bộ289 hàm/ACL;23 contract Storage/Realtime đã ghi ở174 không đổi. Đây không phải chứng minh khôi phục Production hoặc Managed Auth/Storage.

## Đối chiếu từng tệp nguồn local

| Tệp | Kết luận | Căn cứ |
|---|---|---|
| `scripts/qa/ensure-worker-uat.mjs` | TRÙNG | SHA nội dung local = candidate. |
| `scripts/qa/perf.mjs` | TRÙNG/ĐÃ GIỮ | 3-way trên baseline79b0b91 không thêm delta vào candidate. |
| `scripts/qa/uat.mjs` | TRÙNG | SHA nội dung local = candidate. |
| `scripts/qa/verify-uat-repairs.mjs` | TRÙNG | SHA nội dung local = candidate. |
| `scripts/sql/postgres-storage-audit.sql` | TRÙNG | SHA nội dung local = candidate. |
| `scripts/test-r2-database.mjs` | ĐÃ GIỮ Ý NGHĨA VÀ KIỂM CHỨNG | LOCAL_DELTA_SEAMS177: finite/zero count; helper+RPC terms/replay; changed payload bị chặn; một chữ ký5args hiện hành. Không chép6args/hotfix cũ vào schema mới. |
| `src/app/admin/audit/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/cashbook/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/catalog/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/compensation/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/customers/[id]/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/customers/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/deliveries/[id]/cancel/page.tsx` | TRÙNG | SHA nội dung local = candidate. |
| `src/app/admin/deliveries/[id]/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/deliveries/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/dispatch/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/inventory/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/orders/[id]/order-detail.module.css` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/orders/[id]/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/orders/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/payables/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/purchase-orders/[id]/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/purchase-orders/new/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/quotations/[id]/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/receivables/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/reports/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/service-jobs/[id]/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/admin/service-jobs/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/api/customers/[id]/debt-statement/pdf/route.ts` | ĐÃ THAY THẾ | Giữ source/permission/export local, dùng binding/verification/origin và nhãn ngày của candidate. |
| `src/app/api/deliveries/[id]/note/pdf/route.ts` | ĐÃ THAY THẾ | Giữ source/permission/export local, dùng binding/verification/origin và nhãn ngày của candidate. |
| `src/app/api/finance/obligations/route.ts` | TRÙNG | SHA nội dung local = candidate. |
| `src/app/api/payments/[id]/voucher/pdf/route.ts` | ĐÃ THAY THẾ | Giữ source/permission/export local, dùng binding/verification/origin và nhãn ngày của candidate. |
| `src/app/api/purchasing/evidence/[id]/signed/route.ts` | TRÙNG | SHA nội dung local = candidate. |
| `src/app/api/purchasing/evidence/upload/route.ts` | ĐÃ THAY THẾ | Giữ source/permission/export local, dùng binding/verification/origin và nhãn ngày của candidate. |
| `src/app/api/quotation-revisions/[id]/pdf/route.ts` | ĐÃ THAY THẾ | Giữ source/permission/export local, dùng binding/verification/origin và nhãn ngày của candidate. |
| `src/app/api/reports/export/route.ts` | TRÙNG | SHA nội dung local = candidate. |
| `src/app/customer/layout.tsx` | TRÙNG | SHA nội dung local = candidate. |
| `src/app/customer/orders/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/customer/page.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/globals.css` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/app/recovery/confirm/page.tsx` | TRÙNG | SHA nội dung local = candidate. |
| `src/components/access/invite-employee-form.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/components/access/manage-access-form.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/components/app-shell.test.tsx` | CẦN GIỮ MỘT PHẦN | Giữ ca focus sau inert; ca Reports cần theo server hiện tại cho finance sources, không đưa điều kiện dashboard cũ trở lại. |
| `src/components/app-shell.tsx` | CẦN GIỮ MỘT PHẦN | Giữ focus trả về sau khi inert được gỡ; giữ navigation/quyền/màn hình mới PR42. |
| `src/components/auth/recovery-confirm-form.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/components/delivery/open-return-case-form.test.tsx` | ĐÃ THAY THẾ | Test candidate theo contract/nhãn/quyền mới; giữ ý nghĩa nghiệp vụ local trong danh mục kiểm chứng, không khôi phục oracle cũ. |
| `src/components/delivery/open-return-case-form.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/components/delivery/work-item-bridge.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/components/portal/portal-shell.tsx` | TRÙNG | SHA nội dung local = candidate. |
| `src/components/purchasing/purchase-evidence-upload.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/components/purchasing/purchase-order-form.test.tsx` | ĐÃ THAY THẾ | Test candidate theo contract/nhãn/quyền mới; giữ ý nghĩa nghiệp vụ local trong danh mục kiểm chứng, không khôi phục oracle cũ. |
| `src/components/purchasing/purchase-order-form.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/components/purchasing/quick-supplier-form.test.tsx` | TRÙNG | SHA nội dung local = candidate. |
| `src/components/purchasing/quick-supplier-form.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/components/report-export-button.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/components/sales/commercial-document-form.test.tsx` | ĐÃ THAY THẾ | Test candidate theo contract/nhãn/quyền mới; giữ ý nghĩa nghiệp vụ local trong danh mục kiểm chứng, không khôi phục oracle cũ. |
| `src/components/sales/commercial-document-form.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/components/sales/credit-override.tsx` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/components/sales/quick-create-focus-guard.tsx` | TRÙNG | SHA nội dung local = candidate. |
| `src/lib/auth/actions.ts` | TRÙNG/ĐÃ GIỮ | 3-way trên baseline79b0b91 không thêm delta vào candidate. |
| `src/lib/core/business-time.test.ts` | ĐÃ THAY THẾ | Test candidate theo contract/nhãn/quyền mới; giữ ý nghĩa nghiệp vụ local trong danh mục kiểm chứng, không khôi phục oracle cũ. |
| `src/lib/core/business-time.ts` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/lib/core/quantity.ts` | ĐÃ THAY THẾ | Giữ thao tác/màn hình local; candidate có nhãn Việt, ngày/tiền/quantity chính xác, quyền độc lập và hành động G01–G23. Không ghi đè bằng UI cũ. |
| `src/lib/supabase/browser.ts` | TRÙNG | SHA nội dung local = candidate. |
| `src/modules/audit/server.ts` | TRÙNG | SHA nội dung local = candidate. |
| `src/modules/delivery/actions.ts` | ĐÃ THAY THẾ | Giữ parse thời gian/lý do/hủy nguồn local qua implementation PR42; actual handoff và scheduled assignment thay lệnh plan cũ, không merge delta cũ trực tiếp. |
| `src/modules/delivery/cancel-planned-action.ts` | TRÙNG | SHA nội dung local = candidate. |
| `src/modules/delivery/result-routing.test.ts` | TRÙNG | SHA nội dung local = candidate. |
| `src/modules/delivery/return-case-actions.test.ts` | TRÙNG | SHA nội dung local = candidate. |
| `src/modules/finance/actions.ts` | ĐÃ THAY THẾ | PR42 giữ quy trình nguồn và bổ sung lượng exact, outcome/intent, masking hoặc phạm vi lịch sử; bản local cũ không có các contract này. |
| `src/modules/finance/payment-form.tsx` | ĐÃ THAY THẾ | PR42 giữ quy trình nguồn và bổ sung lượng exact, outcome/intent, masking hoặc phạm vi lịch sử; bản local cũ không có các contract này. |
| `src/modules/inventory/actions.ts` | ĐÃ THAY THẾ | PR42 giữ quy trình nguồn và bổ sung lượng exact, outcome/intent, masking hoặc phạm vi lịch sử; bản local cũ không có các contract này. |
| `src/modules/portal/actions.ts` | TRÙNG | SHA nội dung local = candidate. |
| `src/modules/portal/customer-snapshot.test.ts` | TRÙNG | SHA nội dung local = candidate. |
| `src/modules/portal/types.ts` | TRÙNG/ĐÃ GIỮ | 3-way trên baseline79b0b91 không thêm delta vào candidate. |
| `src/modules/pricing/editor.test.tsx` | ĐÃ THAY THẾ | Test candidate theo contract/nhãn/quyền mới; giữ ý nghĩa nghiệp vụ local trong danh mục kiểm chứng, không khôi phục oracle cũ. |
| `src/modules/pricing/editor.tsx` | ĐÃ THAY THẾ | PR42 giữ quy trình nguồn và bổ sung lượng exact, outcome/intent, masking hoặc phạm vi lịch sử; bản local cũ không có các contract này. |
| `src/modules/purchasing/actions.test.ts` | ĐÃ THAY THẾ | Test candidate theo contract/nhãn/quyền mới; giữ ý nghĩa nghiệp vụ local trong danh mục kiểm chứng, không khôi phục oracle cũ. |
| `src/modules/purchasing/actions.ts` | ĐÃ THAY THẾ | PR42 giữ quy trình nguồn và bổ sung lượng exact, outcome/intent, masking hoặc phạm vi lịch sử; bản local cũ không có các contract này. |
| `src/modules/purchasing/form-options.ts` | ĐÃ THAY THẾ | PR42 giữ quy trình nguồn và bổ sung lượng exact, outcome/intent, masking hoặc phạm vi lịch sử; bản local cũ không có các contract này. |
| `src/modules/reports/server.ts` | ĐÃ THAY THẾ | PR42 giữ quy trình nguồn và bổ sung lượng exact, outcome/intent, masking hoặc phạm vi lịch sử; bản local cũ không có các contract này. |
| `src/modules/sales/actions.ts` | ĐÃ THAY THẾ | PR42 giữ quy trình nguồn và bổ sung lượng exact, outcome/intent, masking hoặc phạm vi lịch sử; bản local cũ không có các contract này. |
| `src/modules/sales/credit-override-actions.test.ts` | ĐÃ THAY THẾ | Test candidate theo contract/nhãn/quyền mới; giữ ý nghĩa nghiệp vụ local trong danh mục kiểm chứng, không khôi phục oracle cũ. |
| `src/modules/sales/credit-override-actions.ts` | ĐÃ THAY THẾ | PR42 giữ quy trình nguồn và bổ sung lượng exact, outcome/intent, masking hoặc phạm vi lịch sử; bản local cũ không có các contract này. |
| `src/modules/sales/payment-state.test.ts` | ĐÃ THAY THẾ | Test candidate theo contract/nhãn/quyền mới; giữ ý nghĩa nghiệp vụ local trong danh mục kiểm chứng, không khôi phục oracle cũ. |
| `src/modules/sales/presentation.ts` | ĐÃ THAY THẾ | PR42 giữ quy trình nguồn và bổ sung lượng exact, outcome/intent, masking hoặc phạm vi lịch sử; bản local cũ không có các contract này. |
| `src/modules/workforce/actions.ts` | TRÙNG/ĐÃ GIỮ | 3-way trên baseline79b0b91 không thêm delta vào candidate. |
| `src/modules/workforce/delivery-actions.test.ts` | ĐÃ THAY THẾ | Test candidate theo contract/nhãn/quyền mới; giữ ý nghĩa nghiệp vụ local trong danh mục kiểm chứng, không khôi phục oracle cũ. |
| `src/modules/workforce/delivery-actions.ts` | ĐÃ THAY THẾ | PR42 giữ quy trình nguồn và bổ sung lượng exact, outcome/intent, masking hoặc phạm vi lịch sử; bản local cũ không có các contract này. |
| `src/test/acceptance-repairs.test.ts` | ĐÃ ĐỐI CHIẾU Ý NGHĨA | Quantity/version seams177, unit/business-time, LOCAL_DELTA_SEAMS177 giữ các oracle receipt/fulfillment, count hữu hạn/0 và ngày hợp lệ; không chép test contract cũ. |
| `supabase/migrations/20260925000100_customer_sensitive_column_boundary.sql` | TRÙNG | SHA nội dung local = candidate. |
| `supabase/migrations/20260927000100_cashbook_full_scope_summary.sql` | TRÙNG | SHA nội dung local = candidate. |
| `supabase/migrations/20260927000200_dispatch_scheduled_lookup.sql` | TRÙNG | SHA nội dung local = candidate. |
| `supabase/migrations/20260927000300_report_export_jobs.sql` | TRÙNG | SHA nội dung local = candidate. |
| `supabase/migrations/20260927000400_report_export_retry_accounting.sql` | TRÙNG | SHA nội dung local = candidate. |
| `supabase/migrations/20260927000500_dashboard_dispatch_scoped_reads.sql` | TRÙNG | SHA nội dung local = candidate. |
| `supabase/migrations/20260927000600_cashbook_summary_permission.sql` | TRÙNG | SHA nội dung local = candidate. |
| `supabase/migrations/20260927205002_uat_earning_read_boundary.sql` | TRÙNG | SHA nội dung local = candidate. |
| `supabase/migrations/20260930000100_credit_exposure_net_allocations.sql` | TRÙNG | SHA nội dung local = candidate. |
| `supabase/migrations/20260930023428_return_case_supplier_direct_cost.sql` | TRÙNG | SHA nội dung local = candidate. |
| `supabase/migrations/20260930024101_cancel_planned_delivery_release_reservations.sql` | TRÙNG | SHA nội dung local = candidate. |
| `supabase/migrations/20260930025839_audit_notice_quote_transitions.sql` | TRÙNG | SHA nội dung local = candidate. |
| `supabase/migrations/20260930050137_cancel_scheduled_service_job.sql` | TRÙNG | SHA nội dung local = candidate. |
| `supabase/migrations/20260930081621_replace_custom_serialization_errors.sql` | TRÙNG | SHA nội dung local = candidate. |
| `supabase/migrations/20260930101520_custom_rpc_conflicts.sql` | TRÙNG | SHA nội dung local = candidate. |
| `supabase/migrations/20261001084145_fix_sales_order_payment_state.sql` | TRÙNG | SHA nội dung local = candidate. |
| `supabase/migrations/20261001182059_sales_order_confirmation_credit_override.sql` | TRÙNG | SHA nội dung local = candidate. |
| `supabase/migrations/20261002071813_index_quotation_and_customer_credit_lookups.sql` | TRÙNG | SHA nội dung local = candidate. |
| `supabase/migrations/20261002114730_acceptance_count_guard_and_direct_po_terms.sql` | ĐÃ THAY THẾ | Không thêm migration cũ ngoài thứ tự. Canonical20261003161428 reconcile hotfix/terms; G01/G02 forwards giữ count basis và finite/precision. QA giữ history riêng đã áp dụng; Production không tự repair history. |


Sau7c62d9a: PR42 baseđãchuyểnmain, mainancestor vàmergetree bằngHEADtreeb54daede...;PR41changes đãtrongứng viên, khôngmergePR41riêng trướcgates. Bổ sung forwards178Auth/179workforce khi tìm lỗi qua QA; khôngchỉnh file đãapply. Source179cầnCIcommit mới. Checkoutgốc vẫn giữ; mọibackup/credential ởprivate ngoàiGit.
