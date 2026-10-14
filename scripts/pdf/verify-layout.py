"""Check generated, explicitly synthetic samples; requires pdfplumber."""
from pathlib import Path
import json
import pdfplumber
root = Path.cwd()
checks = []
for file in [*root.glob('output/pdf/*.pdf'), *root.glob('reports/document-pdf-forms/visual/*.pdf')]:
    with pdfplumber.open(file) as pdf:
        text = '\n'.join(p.extract_text() or '' for p in pdf.pages)
        for page in pdf.pages:
            for c in page.chars:
                if c['text'].strip():
                    assert c['x0'] >= 40 and c['x1'] <= 556 and c['top'] >= 25 and c['bottom'] <= 829, (file.name, c['text'])
        if file.name != 'delivery-before.pdf':
            assert 'MẪU MINH HỌA' in text and 'Ký, ghi rõ họ tên' in text
            assert all(label not in text for label in ['Chứng từ nghiệp vụ -', 'Xuất lúc:', 'Nguồn:'])
            assert 'Nguồn:' in pdf.metadata.get('Subject', '') and 'xuất lúc:' in pdf.metadata.get('Subject', '')
            assert all(not any(c['text'].strip() and c['x0'] < p.width / 2 and c['top'] > p.height - 65 for c in p.chars) for p in pdf.pages)
            assert all(f'Trang {i + 1}/{len(pdf.pages)}' in (p.extract_text() or '') for i, p in enumerate(pdf.pages))
        if file.name == 'PO-no-price.pdf':
            assert '2.100.000' not in text and '150.000' not in text
        if file.name == 'SO-many-pages.pdf':
            # Read this table column in draw order. Global reading order interleaves
            # other columns and running headers when this long cell spans pages.
            column = ''.join(c['text'] for p in pdf.pages for c in p.chars if c['x0'] >= 70 and c['x1'] <= 243 and 180 < c['top'] < 755)
            assert '1234567890' * 35 in column
            assert '124.200.000' in text and '36' in text
        checks.append({'file': str(file.relative_to(root)), 'pages': len(pdf.pages), 'margins': 'PASS', 'pagination': 'PASS', 'leftFooterEmpty': file.name != 'delivery-before.pdf'})
report = {'status': 'PASS_TEXT_AND_PAGE_BOUNDS', 'syntheticSamplesOnly': True, 'checks': checks}
(root / 'reports/document-pdf-forms/LAYOUT_CHECKS.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False))
