# Concept Astryx × Hiền Xa ERP (dự án tham chiếu, không thuộc ứng dụng)

Dự án Vite + React 19 + `@astryxdesign/core` với **261 màn hình mẫu** (dữ liệu hư cấu). Danh sách màn: `meta.json` (`id`, `route`, `tpl` = mẫu Astryx, `note` = quy tắc nghiệp vụ).

```bash
cd docs/astryx/concept
npm install
npx vite            # mở http://localhost:5173/#/admin-orders (đổi id theo meta.json)
node shot.js admin-orders   # chụp ảnh (cần Playwright; xem shot.js để đặt BASE/OUT)
```

- Mã màn: `src/s1.jsx` (danh sách admin), `src/b1/*.jsx` (bán/mua/kho + popup), `src/s2b.jsx` (giao hàng, tài chính, nhân công, hệ thống, mẫu in, popup), `src/s3a.jsx` (cổng Thợ, công khai), `src/s3b.jsx` (cổng Khách, kể cả bản `-pc`).
- Khung và kit: `src/lib.jsx`, `src/hx.css`. `src/viewer.jsx` + `viewer.html` + `vite.viewer.js`: trang xem một cửa (`npx vite build -c vite.viewer.js`).
- Tài liệu quyết định: `BRIEF.md`, `FACTS.md`, `DECISIONS.md`, `REVIEW-admin.md`, `REVIEW-portal.md`, `IMPL.md`, `ROLES.md`.
- **Chỉ là hình thức.** Concept có chỗ tự đặt nhãn/nghiệp vụ; khi lệch, `Spec.md`, `UXUI.md` và `presentation.ts` của app thắng (xem `../HANDOFF.md`).
