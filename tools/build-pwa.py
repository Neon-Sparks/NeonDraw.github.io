#!/usr/bin/env python3
"""Regenerate sw.js (the offline service worker) with the current file list and version.

Run this after changing any app files, then upload. Users get an "Update ready" button
the next time they open the app.

    python tools/build-pwa.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INCLUDE_DIRS = ['css', 'js', 'icons']
INCLUDE_FILES = ['index.html', 'manifest.webmanifest']


def main():
    with open(os.path.join(ROOT, 'package.json'), encoding='utf-8') as f:
        version = json.load(f)['version']
    files = ['./'] + ['./' + f for f in INCLUDE_FILES]
    for d in INCLUDE_DIRS:
        for base, _dirs, names in os.walk(os.path.join(ROOT, d)):
            for n in sorted(names):
                rel = os.path.relpath(os.path.join(base, n), ROOT).replace(os.sep, '/')
                files.append('./' + rel)
    with open(os.path.join(ROOT, 'tools', 'sw-template.js'), encoding='utf-8') as f:
        tpl = f.read()
    out = tpl.replace('__VERSION__', 'neondraw-' + version).replace('__FILES__', json.dumps(sorted(set(files)), indent=2))
    with open(os.path.join(ROOT, 'sw.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('sw.js written:', len(files), 'files, cache', 'neondraw-' + version)


if __name__ == '__main__':
    main()
