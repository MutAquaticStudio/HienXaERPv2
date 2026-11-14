#!/usr/bin/env python3
"""Tạo câu SQL nhập sổ bán hàng hằng ngày (xem README.md cùng thư mục).

Dùng:
  python3 -I scripts/operational/so-ban-hang/tao-lenh-nhap.py <file-get_values.json> <tab> <tt-da-nhap> [--kho] > lenh.sql

  file-get_values.json  kết quả Google Sheets get_values của '<tab>'!A8:R (JSON {range, values}; có thể có chữ trước dấu '{').
  tab                   tên tab tháng, ví dụ 11.26.
  tt-da-nhap            TT đã có trong ERP, dạng "1-14,16-30,…" (lấy bằng câu truy vấn trong README).
  --kho                 chạy khô (tự hủy, chỉ báo cáo).

In ra: nội dung nhap-so-hang-ngay.sql + một dòng gọi hàm với các dòng sổ CHƯA nhập (bỏ dòng thu tiền).
"""
import json
import pathlib
import re
import sys

PAYMENT_ITEMS = {"", "thanh toán công nợ", "điều chỉnh v"}


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--kho" in sys.argv[1:]
    if len(args) != 3:
        sys.exit(__doc__)
    source, tab, imported = args
    if not re.fullmatch(r"[0-9]{1,2}\.[0-9]{2}", tab):
        sys.exit(f"tab sai: {tab}")
    raw = pathlib.Path(source).read_text(encoding="utf-8")
    values = json.loads(raw[raw.find("{"):])["values"]
    done = set()
    for part in re.findall(r"[0-9]+(?:-[0-9]+)?", imported):
        lo, _, hi = part.partition("-")
        done.update(range(int(lo), int(hi or lo) + 1))
    rows = []
    for r in values:
        if not r or not str(r[0]).strip().isdigit():
            continue
        cells = [str(c) for c in r[:18]]
        if int(cells[0].strip()) in done:
            continue
        if (cells[5].strip().lower() if len(cells) > 5 else "") in PAYMENT_ITEMS:
            continue
        rows.append(cells)
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    if "$rows$" in payload:
        sys.exit("dữ liệu sổ có chuỗi $rows$, dừng lại")
    body = (pathlib.Path(__file__).with_name("nhap-so-hang-ngay.sql")).read_text(encoding="utf-8")
    sys.stdout.write(body.rstrip() + "\n\n")
    sys.stdout.write(f"select pg_temp.hx_nhap_so('{tab}', $rows${payload}$rows$::jsonb, {'true' if dry else 'false'}) as bao_cao;\n")
    sys.stderr.write(f"{len(rows)} dòng chưa nhập được gửi đi\n")


if __name__ == "__main__":
    main()
