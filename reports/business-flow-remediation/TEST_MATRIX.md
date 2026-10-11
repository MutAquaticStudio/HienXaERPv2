# T01–T42 — kết quả bản sửa

Expected/source ở audit07; không PASS từ evidence cũ.

| Test | DB | Auth HTTP | Browser | Concurrent/fault | Commit/evidence | Kết quả/giới hạn |
|---|---|---|---|---|---|---|
| T01 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T02 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T03 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T04 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T05 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T06 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T07 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T08 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T09 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T10 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T11 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T12 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T13 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T14 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T15 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T16 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T17 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T18 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T19 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T20 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T21 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T22 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T23 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T24 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T25 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T26 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T27 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T28 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T29 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T30 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T31 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T32 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T33 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T34 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T35 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T36 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T37 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T38 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T39 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T40 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T41 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |
| T42 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | Chưa chạy bản sửa |

## Package1 — fresh scope

T28: stale/current/reservation, real two-approver and count/handoff lock races PASS; T40: count open/record/approve audit and fault-after-ledger rollback PASS; T05: real QA Auth/Sales/Finance/Worker cost boundaries and raw filter/order endpoints PASS. These are scoped, not full T05/T06/T07/T08/T13/T40 for all modules. Native5checks, AuthHTTP12checks, Browser4checks/5images1280+390/0consoleerrors, native2races with distinct actors/PIDs and observed blockers. Typecheck PASS;6files34affected tests PASS; targeted lint0issues. Build/full tests/CI final NOT_RUN.

Evidence outside repo: /Users/nox/Downloads/HienXaERP/outputs/business-flow-remediation. No token/password recorded. Browser plugin absent, installed Playwright used; real UI forms/login/actions/reload and independent DB readback.

## Package3 — phạm vi mới được kiểm chứng

T14/T15/T42: native pre-start reassignment, immutable assignment facts, old assignee denial/new eligible assignee, GPS old revoke/new session, after-start deny. Auth HTTP thật: old Worker403; new assigned Owner (có work.claim thực, không bypass is-current-assignee) start/report/retry một result. Warehouse là người điều phối/bàn giao thực; không cấp role/cloud quyền để test đạt.

T13: hai actor/PID thật cạnh tranh employee/vehicle lock, observed pg_blocking_pids, chỉ một assignment. Trùng lịch bị chặn trước publish; negative max/missing conversion/window, khai căn cứ tải và xác minh lại cap không đổi trên phiếu đang mở.

T20/T23/T40: native6 scenarios, actual14/plan15, release residual, zero unloaded line without movements or false cost, FULL15/accepted14 board until return resolved, fault after custody insert rolls all effects back and permits retry. AuthHTTP precision/missing/permission/nullversion/positive/retry/source read. Browser warehouse4 checks/6desktop+390 images/0consoleerrors final; reload/independent SQL readback.

Package3 schema103 từ0 native/Auth shim PASS; upgrade95–103 giữ nguyên cột/dòng nghiệp vụ cũ. 7 files/67 affected unit tests, typecheck, targeted lint PASS. Package1 native5 và Package2 native3 regression PASS tại101; new102/103 eligibility/capacity không tác động các external-only cases đó. Full42 matrix, seven business scenarios, build/CI final vẫn NOT_RUN.

Failure evidence được giữ: reader invoker mất dòng Warehouse đã sửa bằng forward100; screenshot caret style injection và lịch fixture trùng được phân loại harness, chạy fresh unique schedules + caret initial đạt. Không bỏ qua console errors.
