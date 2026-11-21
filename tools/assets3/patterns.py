"""Tileable fabric pattern tiles (PIL) for printed garments: Ankara, brocade, lace, agbada embroidery, resort print, plaid.
Greyscale-ish motif tiles are tinted by the garment's vertex colour; colourful tiles (Ankara) are used with white vertex colour."""
from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw


def _tile(base, size=256):
    return Image.new("RGB", (size, size), base)


def _wrap_draw(img, fn):
    """Draw with wrap-around so the tile is seamless: draw the motif at the 3x3 offsets."""
    s = img.width
    d = ImageDraw.Draw(img)
    for ox in (-s, 0, s):
        for oy in (-s, 0, s):
            fn(d, ox, oy)


def ankara(c1=(236, 176, 34), c2=(22, 124, 122), c3=(34, 58, 62), size=256, seed=2) -> Image.Image:
    """Bold leaf / medallion print in yellow + teal on dark teal."""
    img = _tile(c3, size)
    rng = np.random.default_rng(seed)

    def motif(d, ox, oy):
        for (cx, cy, r, col) in ((64, 64, 52, c1), (192, 192, 52, c1), (192, 64, 38, c2), (64, 192, 38, c2)):
            d.ellipse([cx - r + ox, cy - r + oy, cx + r + ox, cy + r + oy], fill=col)
            d.ellipse([cx - r * 0.62 + ox, cy - r * 0.62 + oy, cx + r * 0.62 + ox, cy + r * 0.62 + oy], fill=c3)
            d.ellipse([cx - r * 0.30 + ox, cy - r * 0.30 + oy, cx + r * 0.30 + ox, cy + r * 0.30 + oy], fill=col)
        for k in range(8):
            ang = k * np.pi / 4
            d.line([128 + ox + 22 * np.cos(ang), 128 + oy + 22 * np.sin(ang), 128 + ox + 52 * np.cos(ang), 128 + oy + 52 * np.sin(ang)], fill=c1, width=6)

    _wrap_draw(img, motif)
    return img


def brocade(motif=(120, 120, 120), size=256) -> Image.Image:
    """Tone-on-tone diamond brocade (white ground, grey motif; tinted by vertex colour)."""
    img = _tile((255, 255, 255), size)

    def m(d, ox, oy):
        for (cx, cy) in ((64, 64), (192, 192), (192, 64), (64, 192)):
            d.polygon([(cx + ox, cy - 46 + oy), (cx + 46 + ox, cy + oy), (cx + ox, cy + 46 + oy), (cx - 46 + ox, cy + oy)], outline=motif, width=5)
            d.ellipse([cx - 12 + ox, cy - 12 + oy, cx + 12 + ox, cy + 12 + oy], fill=motif)
        d.line([ox, 128 + oy, 256 + ox, 128 + oy], fill=(200, 200, 200), width=3)

    _wrap_draw(img, m)
    return img


def lace(size=256) -> Image.Image:
    img = _tile((255, 255, 255), size)

    def m(d, ox, oy):
        for (cx, cy) in ((64, 64), (192, 192), (192, 64), (64, 192), (128, 128)):
            for r in (30, 18, 8):
                d.ellipse([cx - r + ox, cy - r + oy, cx + r + ox, cy + r + oy], outline=(150, 150, 150), width=4)
        for k in range(0, 256, 32):
            d.arc([k - 20 + ox, -20 + oy, k + 20 + ox, 20 + oy], 0, 180, fill=(170, 170, 170), width=3)

    _wrap_draw(img, m)
    return img


def embroidery(size=256, ground=(255, 255, 255), motif=(95, 95, 95), line=(110, 110, 110)) -> Image.Image:
    """Dense scrolled agbada embroidery.  Defaults are tone-on-tone (tinted by vertex colour); pass colours for a printed look."""
    img = _tile(ground, size)

    def m(d, ox, oy):
        for (cx, cy) in ((64, 64), (192, 64), (64, 192), (192, 192), (128, 128)):
            d.ellipse([cx - 26 + ox, cy - 26 + oy, cx + 26 + ox, cy + 26 + oy], outline=motif, width=5)
            d.ellipse([cx - 9 + ox, cy - 9 + oy, cx + 9 + ox, cy + 9 + oy], fill=motif)
            for k in range(6):
                a_ = k * np.pi / 3
                d.line([cx + ox + 26 * np.cos(a_), cy + oy + 26 * np.sin(a_), cx + ox + 44 * np.cos(a_), cy + oy + 44 * np.sin(a_)], fill=line, width=4)

    _wrap_draw(img, m)
    return img


def resort(base=(255, 255, 255), motif=(110, 110, 110), size=256) -> Image.Image:
    img = _tile(base, size)

    def m(d, ox, oy):
        for (cx, cy) in ((32, 32), (96, 96), (160, 32), (224, 96), (32, 160), (96, 224), (160, 160), (224, 224)):
            d.polygon([(cx + ox, cy - 16 + oy), (cx + 14 + ox, cy + 8 + oy), (cx - 14 + ox, cy + 8 + oy)], fill=motif)
            d.ellipse([cx + 18 + ox, cy + 12 + oy, cx + 26 + ox, cy + 20 + oy], fill=motif)

    _wrap_draw(img, m)
    return img


def plaid(c1=(255, 255, 255), c2=(150, 150, 150), size=256) -> Image.Image:
    img = _tile(c1, size)
    d = ImageDraw.Draw(img)
    for k in range(0, size, 64):
        d.rectangle([k, 0, k + 18, size], fill=c2)
        d.rectangle([0, k, size, k + 18], fill=c2)
    return img
