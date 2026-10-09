#!/usr/bin/env python3
"""Draw the Neon Draw app icons (needs Pillow: pip install pillow).

    python tools/make-icons.py
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'icons')


def bez(p0, p1, p2, p3, n=160):
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append(((1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0] + 3 * (1 - t) * t * t * p2[0] + t ** 3 * p3[0],
                    (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1] + 3 * (1 - t) * t * t * p2[1] + t ** 3 * p3[1]))
    return pts


def icon(size, maskable, path):
    S = 1024
    base = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    bg = Image.new('RGBA', (S, S))
    bd = ImageDraw.Draw(bg)
    for y in range(S):
        t = y / S
        bd.line([(0, y), (S, y)], fill=(int(32 - 16 * t), int(34 - 16 * t), int(44 - 18 * t), 255))
    mask = Image.new('L', (S, S), 0)
    md = ImageDraw.Draw(mask)
    if maskable:
        md.rectangle([0, 0, S, S], fill=255)
    else:
        md.rounded_rectangle([24, 24, S - 24, S - 24], radius=220, fill=255)
    base.paste(bg, (0, 0), mask)
    sc = 0.74 if maskable else 0.9
    T = (470, 600)
    ang = math.radians(-45)

    def Q(u, v):
        return (T[0] + u * math.cos(ang) - v * math.sin(ang), T[1] + u * math.sin(ang) + v * math.cos(ang))

    hx, hy = Q(565, 0)
    minx, maxx = min(150, hx), max(hx, T[0])
    miny, maxy = min(hy, 560), 860
    ox, oy = 512 - (minx + maxx) / 2, 512 - (miny + maxy) / 2

    def P(p):
        return (S / 2 + (p[0] + ox - 512) * sc, S / 2 + (p[1] + oy - 512) * sc)

    end = Q(45, 0)
    stroke = [P(p) for p in bez((150, 830), (230, 560), (360, 900), end)]
    n = len(stroke)
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i, p in enumerate(stroke):
        w = (40 + 70 * min(1, i / n * 2)) * sc
        gd.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=(255, 60, 150, 150))
    base = Image.alpha_composite(base, glow.filter(ImageFilter.GaussianBlur(40)))
    lay = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lay)
    for i, p in enumerate(stroke):
        w = (26 + 52 * min(1, i / n * 2)) * sc
        ld.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=(255, 95, 162, 255))
    for p in stroke[int(n * 0.08):int(n * 0.8)]:
        w = 11 * sc
        q = (p[0] - 6 * sc, p[1] - 6 * sc)
        ld.ellipse([q[0] - w / 2, q[1] - w / 2, q[0] + w / 2, q[1] + w / 2], fill=(255, 200, 225, 255))
    base = Image.alpha_composite(base, lay)
    br = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dd = ImageDraw.Draw(br)

    def R(u, v):
        return P(Q(u, v))

    dd.polygon([R(235, -34), R(535, -24), R(565, 0), R(535, 24), R(235, 34)], fill=(109, 179, 255, 255))
    dd.polygon([R(245, -30), R(530, -20), R(540, -6), R(245, -12)], fill=(175, 212, 255, 255))
    dd.polygon([R(165, -44), R(245, -40), R(245, 40), R(165, 44)], fill=(200, 206, 216, 255))
    dd.polygon([R(165, -44), R(245, -40), R(245, -20), R(165, -22)], fill=(238, 240, 245, 255))
    tip = [R(165, -44)]
    for i in range(1, 30):
        t = i / 30
        tip.append(R(165 - 165 * t, -44 * (1 - t ** 1.6)))
    tip.append(R(0, 0))
    for i in range(29, 0, -1):
        t = i / 30
        tip.append(R(165 - 165 * t, 44 * (1 - t ** 1.6)))
    tip.append(R(165, 44))
    dd.polygon(tip, fill=(255, 95, 162, 255))
    dd.polygon([R(163, -30), R(50, -8), R(163, -6)], fill=(255, 165, 205, 255))
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sh.putalpha(br.split()[3].filter(ImageFilter.GaussianBlur(18)).point(lambda v: int(v * 0.5)))
    base = Image.alpha_composite(base, sh)
    base = Image.alpha_composite(base, br)
    final = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    final.paste(base, (0, 0), mask)
    final.resize((size, size), Image.LANCZOS).save(path)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    icon(192, False, os.path.join(OUT, 'icon-192.png'))
    icon(512, False, os.path.join(OUT, 'icon-512.png'))
    icon(512, True, os.path.join(OUT, 'icon-maskable-512.png'))
    icon(180, True, os.path.join(OUT, 'apple-touch-icon.png'))
    icon(48, False, os.path.join(OUT, 'favicon-48.png'))
    print('icons written to', OUT)
