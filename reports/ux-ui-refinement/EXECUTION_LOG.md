# Nhật ký thực hiện

Thời gian dưới đây là UTC từ các kết quả thật; Asia/Ho_Chi_Minh cộng7 giờ. Một agent thực hiện; các subagent cũ ở trạng thái interrupted. Không chạy Production ghi dữ liệu.

| Thời điểm | Môi trường / bước | Kỳ vọng | Thực tế / bằng chứng |
|---|---|---|---|
| Đầu đợt | Git và Taste | Đúng nền, bảo toàn gốc, chỉ một skill Codex | BASELINE.json; BASELINE_AND_SKILL.md; source d237dd3 và installed hash khớp |
| 2026-10-12T16:59:33.878Z | BEFORE | Kiểm đúng phạm vi và dữ liệu | PASS_CAPTURE_READONLY; [BEFORE.json](BEFORE.json) |
| 2026-10-12T16:59:32.844Z | AFTER | Kiểm đúng phạm vi và dữ liệu | PASS_CAPTURE_READONLY; [AFTER.json](AFTER.json) |
| 2026-10-12T17:03:38.513Z | QA_ISOLATION | Kiểm đúng phạm vi và dữ liệu | PASS_RESTORED_IN_DISPOSABLE_QA; [QA_ISOLATION.json](QA_ISOLATION.json) |
| 2026-10-12T17:13:30.630Z | UX_BROWSER | Kiểm đúng phạm vi và dữ liệu | PASS; [UX_BROWSER.json](UX_BROWSER.json) |
| 2026-10-12T17:16:20.365Z | QA_CLEANUP | Kiểm đúng phạm vi và dữ liệu | PASS; [QA_CLEANUP.json](QA_CLEANUP.json) |
| 2026-10-12T17:11:23.891759+00:00 | ORIGINAL_PRESERVATION | Kiểm đúng phạm vi và dữ liệu | PASS; [ORIGINAL_PRESERVATION.json](ORIGINAL_PRESERVATION.json) |
| 2026-10-12T17:19:24.399Z | COMPARISON | Kiểm đúng phạm vi và dữ liệu | PASS_PRESENTATION_SCOPE_AND24_PAIRS; [COMPARISON.json](COMPARISON.json) |
| 2026-10-12T17:16:30.512Z | Local typecheck | Exit0 | Exit0; [log](checks/typecheck.log) |
| 2026-10-12T17:16:40.862Z | Local lint | Exit0 | Exit0; [log](checks/lint.log) |
| 2026-10-12T17:17:28.026Z | Local build | Exit0 | Exit0; [log](checks/build.log) |

64/64 kiểm thử liên quan: checks/relevant-tests.log. Một assertion cũ tìm cả đoạn lượng trong một text node không còn phù hợp khi tách dòng; cập nhật assertion existing sang accessible description của input, giữ kiểm max14/mặc định trống và các kiểm recovery.

Các lần sửa hạ tầng/kịch bản: baseline node_modules symlink bị Turbopack từ chối, cài frozen dependencies vào baseline riêng; thêm đường dẫn libpq có sẵn khi mở PostgREST riêng. Ba lần browser tiếp tục đều giữ nguyên nguồn/intent: (1) tìm mã phiếu trong nhãn nguồn chung nên không thấy; (2) locator form lồng sai; (3) đọc trạng thái đối soát từ bảng thay vì view. UX_BROWSER_ATTEMPT1–3.json và checks/browser-attempt1–3.log giữ lỗi thật. Đối soát đã lưu ở lần3 được đọc lại, không gửi lại thành tác động mới.

Ca15→14→13 đã hoàn thành một lần trên DB riêng. Hoàn tất các bước còn thiếu bằng cùng nguồn, không tạo lại nguồn hoặc gọi hai race ứng trước. Testdb bị drop sau khi dừng đúng3 dịch vụ UX; 122 bảng QA nguồn so với snapshot vẫn khớp toàn bộ nội dung.

Các lệnh chính (thông tin đăng nhập chỉ đọc từ tệp riêng, không ghi vào log):

```sh
node scripts/qa/ux-refinement-survey.mjs [tham số QA cố định] --phase before|after
node scripts/qa/ux-refinement-browser.mjs [tham số DB riêng hx_remediation_ux_refinement186]
node scripts/qa/ux-refinement-scope.mjs
pnpm exec vitest run [14 tệp test liên quan, xem checks/relevant-tests.log]
pnpm typecheck
pnpm lint
pnpm build
```

Source của khảo sát là baseline e2a6393 hoặc e2a6393 cộng diff UI. Commit mã543a93e đã push và [PR44](https://github.com/MutAquaticStudio/HienXaERPv2/pull/44) đã tạo/attach. CI mã đạt tại run38283937185. Bản preview dùng next start đã chụp lại24 màn hình trên SHA543a93e, source sạch; bản ghi PREVIEW.json xác minh health và runtime hash. Commit chốt ảnh/tài liệu không đổi runtime; kiểm CI đúng head cuối riêng, kết quả chốt trong mô tả PR trước bàn giao. Không dùng SHA baseline để nói thay đổi đã có trên Production.

[CI_CODE.json](CI_CODE.json) ghi đầy đủ các bước CI đã thành công. Không có nâng cấp schema hoặc triển khai ứng dụng trong đợt này; vercel.json chỉ tắt tự triển khai nhánh UI. Checkout gốc vẫn giữ status/HEAD/nội dung.

Sau CI543a93e và af42bb5 đều đạt, kiểm viewport bổ sung phát hiện clipping phần trăm tại1024/1100/1180px. MetricNumber được sửa để cho phép ngắt ở dấu phẩy; chỉ thay hiển thị, không đổi formatter/tính toán. Cần CI mới; hai run trước không đại diện cho sửa này.

Đã kiểm lại7 viewport:0 clipping,0 document overflow, text các chỉ số không đổi. Typecheck, lint, build sau sửa đều exit0 (LOCAL_CHECKS.json). Sau sửa MetricNumber chỉ chạy lại đọc/hiển thị và CI; không replay ca ghi sổ hoặc hai race bị loại.
