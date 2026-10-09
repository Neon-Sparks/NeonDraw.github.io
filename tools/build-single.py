#!/usr/bin/env python3
"""Bundle Neon Draw into one self-contained HTML file (dist/neon-draw.html).

The multi-file app already runs from disk and from any web host; this is only for
when you want a single file to e-mail or drop somewhere. No dependencies needed.

    python tools/build-single.py
"""
import base64
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()


def main():
    html = read('index.html')

    def css(m):
        return '<style>\n' + read(m.group(1)) + '\n</style>'

    def js(m):
        code = read(m.group(1)).replace('</script', '<\\/script')
        return '<script>/* ' + m.group(1) + ' */\n' + code + '\n</script>'

    # one file can't be installed or cached offline: drop the manifest, inline the favicon
    html = re.sub(r'\s*<link rel="(manifest|apple-touch-icon)"[^>]*>', '', html)

    def icon(m):
        with open(os.path.join(ROOT, m.group(1)), 'rb') as f:
            return '<link rel="icon" type="image/png" href="data:image/png;base64,' + base64.b64encode(f.read()).decode() + '" />'

    html = re.sub(r'<link rel="icon" type="image/png" sizes="\d+x\d+" href="([^"]+)"\s*/?>', icon, html)
    html = html.replace('</head>', '  <script>window.ND_SINGLE_FILE = true;</script>\n</head>', 1)
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)"\s*/?>', css, html)
    html = re.sub(r'<script src="([^"]+)"></script>', js, html)
    out_dir = os.path.join(ROOT, 'dist')
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, 'neon-draw.html')
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    print('wrote', out, round(os.path.getsize(out) / 1024), 'KB')


if __name__ == '__main__':
    main()
