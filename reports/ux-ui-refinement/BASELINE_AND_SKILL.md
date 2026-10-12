# Phiên bản và skill

Kho: MutAquaticStudio/HienXaERPv2. Nhánh làm việc: `codex/ux-ui-refinement`, worktree `/Users/nox/.codex/worktrees/ux-ui-refinement/HienXaERP`.

| Nguồn | Trạng thái đã xác minh |
|---|---|
| Main GitHub, nền ứng viên | `e2a639324815f1c147c5b0744ec08d5d3e0dd885`; PR42 và PR43 đã merge |
| Checkout gốc | `codex/uat-role-navigation-20260923`, `79b0b918c7430bfd0e9d17e247ecba2be1fa0bf2`; 61 mục tracked sửa, 67 mục untracked theo status thường |
| Bảo toàn gốc | 12.534 tệp đối chiếu SHA-256, 0 khác biệt; HEAD, nhánh và status giữ nguyên. Chỉ fetch metadata Git để tạo worktree |
| Nguồn được chụp trước | Worktree baseline riêng, HEAD e2a6393, không có thay đổi `src` |
| Nguồn chụp sau và hồi quy | Commit mã543a93e5f2581ead5c6294a4cec4bdf5d42efc06; ảnh sau cuối đã chụp trên commit sạch bằng next start; COMPARISON.json ghi runtime hash. HEAD ảnh/tài liệu giữ cùng mã, CI cuối tại PR44 |
| QA cho ảnh và preview | Auth QA thật `ffrwiglcrlumfvhubaxg`, PostgREST và PostgreSQL 17.11 cục bộ có quyền/RPC thật; schema canonical186, max20261012110100 |
| QA ghi sổ hồi quy | Bản sao riêng `hx_remediation_ux_refinement186`; đã đối chiếu 122 bảng public rồi dọn DB sau khi lưu bằng chứng |
| Schema nguồn Git | Canonical187; migration187 có sẵn từ PR43, không chạy migration trong đợt UI. Các hợp đồng dùng trong ca này tương thích QA186 |
| Doanh nghiệp đang chạy | Deployment `dpl_EBjgf4qEUdv3BjnfqwECN4A32V8v`, READY; health không công bố SHA và metadata provider không có SHA. DB được đọc trước đợt UI có78 migration, max20261009224842 |

Không coi local, GitHub, QA và Production là cùng phiên bản. Đợt này không xác minh hay nâng cấp nghiệp vụ/schema của Production.

Đã đọc AGENTS.md và hướng dẫn CSS/accessibility của Next16.3.4 trong `node_modules/next/dist/docs/`; dự án không có README.md ở gốc. Dùng Noto Sans, CSS hiện có, React19.2.8 và thành phần đang có. Browser skill/plugin không được cung cấp; dùng Playwright1.63.0 đã cài trong dự án, không thêm phụ thuộc.

Taste được kiểm tra từ [README tại commit nguồn](https://github.com/Leonxlnx/taste-skill/blob/d237dd399d57524945c0c81327da5da19f7a468d/README.md) và skill trước khi cài. Chỉ chọn `redesign-existing-projects`; thư mục nguồn `skills/redesign-skill` chỉ chứa SKILL.md, không có script thực thi.

CLI skills1.7.2 hỗ trợ `--agent codex`, `--global`, `--copy` và chọn một skill. Lệnh đã dùng:

```sh
npx --yes skills add https://github.com/Leonxlnx/taste-skill --skill redesign-existing-projects --agent codex --global --yes --copy --json
```

Đã cài tại `/Users/nox/.agents/skills/redesign-existing-projects/SKILL.md`, đọc đầy đủ sau cài và đối chiếu byte với nguồn commit `d237dd399d57524945c0c81327da5da19f7a468d`. SHA-256: `a75d547d04595fe97a5d377dddf145d029d51487a4f2a0a5a9d3b532ca3b84cd`. Không ghi đè skill có sẵn, không cài cả bộ.

Chỉ áp dụng khảo sát trước, phân cấp lượng, nhãn, độ đọc và focus của Taste. Yêu cầu giữ giao diện của người dùng ưu tiên: không đổi phông, palette, sidebar, mật độ bảng, hệ thành phần hoặc thêm motion/ảnh trang trí.
