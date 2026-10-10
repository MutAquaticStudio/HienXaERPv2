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
