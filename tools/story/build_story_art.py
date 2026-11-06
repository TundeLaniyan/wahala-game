"""Builds the campaign story panels (src/assets/story/*.webp) from the game's own captures.

Deterministic (numpy, scipy and Pillow only): run `python3 tools/story/build_story_art.py` after changing a master or a
grade below and commit the outputs. Never hand-edit the .webp files. See docs/STORY_VISUALS.md.

Masters (tools/story/masters/<id>.jpg) are raw, HUD-free 1280 x 720 stills of the real scenes made by
scripts/story-shots.mjs from tools/story/shots.config.mjs. For each one this script:
  * crops to 16:9 around an optional focal box and resizes to 960 x 540;
  * strips any overlay: boxes listed in `BLANK` are replaced by a blurred, dimmed copy of their surroundings (the
    capture already hides the HUD; this is the safety net for anything that slips through);
  * applies one grounded-cinematic Lagos grade per mood (warm amber dusk, deep night, hazy afternoon): split-toned
    shadows and highlights, a gentle S-curve, a soft highlight bloom, a vignette and fine film grain;
  * a light graphic-novel pass: a soft posterise of the luminance and a thin darkening of strong edges, so the blocky
    in-engine geometry reads as drawn art and stays legible when small;
  * writes WebP at the highest quality that keeps each file under TARGET_BYTES.
No text, name or logo is ever added to a picture: captions are drawn by the UI over a scrim.
"""

from __future__ import annotations

import io
import os
import sys
import zlib
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
# STORY_MASTERS / STORY_OUT override the folders (scouting and tests); the defaults are the committed ones
MASTERS = Path(os.environ.get("STORY_MASTERS", ROOT / "tools" / "story" / "masters"))
OUT = Path(os.environ.get("STORY_OUT", ROOT / "src" / "assets" / "story"))

WIDTH, HEIGHT = 960, 540
TARGET_BYTES = 62 * 1024
HARD_BYTES = 88 * 1024


@dataclass(frozen=True)
class Mood:
    """One consistent look. Colours are linear-ish multipliers / additions in 0..1 RGB."""

    shadow: tuple[float, float, float]  # multiplies the shadows (cool or deep)
    highlight: tuple[float, float, float]  # added to the highlights (warm light)
    sat: float = 1.0
    gamma: float = 1.0  # < 1 brightens
    contrast: float = 1.1
    exposure: float = 1.0
    bloom: float = 0.22
    vignette: float = 0.42
    grain: float = 0.022
    posterise: float = 0.16  # mix of the posterised luminance
    ink: float = 0.2  # strength of the edge darkening


MOODS: dict[str, Mood] = {
    # the default: low sun through dust and exhaust
    "dusk": Mood(shadow=(0.80, 0.84, 1.0), highlight=(0.30, 0.15, 0.02), sat=1.08, gamma=0.96, contrast=1.14, exposure=1.02),
    # hazy bright afternoon, a little less theatrical
    "day": Mood(shadow=(0.86, 0.88, 0.98), highlight=(0.22, 0.12, 0.02), sat=1.04, gamma=0.98, contrast=1.1, exposure=1.0, vignette=0.36),
    # lit signs and lamps in a blue dark
    "night": Mood(shadow=(0.70, 0.78, 1.0), highlight=(0.26, 0.16, 0.05), sat=1.1, gamma=0.88, contrast=1.16, exposure=1.18, bloom=0.34, vignette=0.5, grain=0.026),
}


@dataclass(frozen=True)
class Panel:
    # the master file (without .jpg) when it is not named like the panel
    master: str = ""
    mood: str = "dusk"
    # focal crop in master pixels (left, top, width); height follows 16:9. None = the whole frame
    crop: tuple[int, int, int] | None = None
    # an extra tint (RGB 0..1) blended softly over the picture: the boss or district colour
    tint: tuple[float, float, float] | None = None
    tint_amount: float = 0.0
    # boxes (left, top, right, bottom) in master pixels to blank out
    blank: tuple[tuple[int, int, int, int], ...] = ()
    exposure: float = 1.0
    # the sky (painted the key colour #ff00ff by scripts/story-shots.mjs) is replaced by a graded gradient of this kind
    sky: str = "dusk"
    # where the low sun glows, as fractions of the frame (x, y); None = no glow
    sun: tuple[float, float] | None = None


def load_panels() -> dict[str, Panel]:
    """The per-panel table lives in tools/story/panels.py so the capture plan and the grade stay side by side."""
    sys.path.insert(0, str(Path(__file__).parent))
    import panels  # type: ignore

    return panels.PANELS


# ---------------------------------------------------------------------------------------------------- image steps


def crop_16_9(img: Image.Image, crop: tuple[int, int, int] | None) -> Image.Image:
    if crop is None:
        w = img.width
        h = round(w * 9 / 16)
        if h > img.height:
            h = img.height
            w = round(h * 16 / 9)
        left = (img.width - w) // 2
        top = (img.height - h) // 2
        return img.crop((left, top, left + w, top + h))
    left, top, w = crop
    h = round(w * 9 / 16)
    return img.crop((left, top, left + w, top + h))


def blank_out(img: Image.Image, box: tuple[int, int, int, int]) -> None:
    """Replaces `box` with a heavy blur of its surroundings, dimmed (same idea as tools/ui/build_menu_art.py)."""
    l, t, r, b = box
    pad = 16
    region = img.crop((max(0, l - pad), max(0, t - pad), min(img.width, r + pad), min(img.height, b + pad)))
    blurred = region.filter(ImageFilter.GaussianBlur(10)).filter(ImageFilter.GaussianBlur(6))
    ox, oy = max(0, l - pad), max(0, t - pad)
    inner = blurred.crop((l - ox, t - oy, r - ox, b - oy))
    mask = Image.new("L", inner.size, 0)
    core = Image.new("L", (max(1, inner.width - 8), max(1, inner.height - 8)), 255)
    mask.paste(core, (4, 4))
    img.paste(inner, (l, t), mask.filter(ImageFilter.GaussianBlur(3)))


SKIES: dict[str, tuple[tuple[float, float, float], ...]] = {
    # top -> horizon
    "dusk": ((0.16, 0.22, 0.38), (0.55, 0.42, 0.52), (0.95, 0.62, 0.40), (1.0, 0.78, 0.52)),
    "day": ((0.42, 0.56, 0.72), (0.70, 0.76, 0.80), (0.93, 0.84, 0.70), (0.98, 0.88, 0.72)),
    "night": ((0.015, 0.03, 0.09), (0.05, 0.08, 0.18), (0.14, 0.16, 0.30), (0.38, 0.26, 0.24)),
}


def key_mask(a: np.ndarray) -> np.ndarray:
    """How much of the pixel is the magenta key colour (1, 0, 1): 1 on clear sky, partial on soft or dithered edges.

    Red and blue must be equal and far above green. The key stays balanced however dark the renderer's glass or fade makes it,
    while a lit magenta or pink jersey (blue clearly below red) and a purple kit (red clearly below blue) are not balanced,
    so costume colours are never mistaken for sky.
    """
    lo = np.minimum(a[..., 0], a[..., 2])
    hi = np.maximum(a[..., 0], a[..., 2])
    chroma = smoothstep(lo - a[..., 1], 0.35, 0.55)
    bright = smoothstep(lo, 0.3, 0.6)
    balanced = 1.0 - smoothstep(np.abs(a[..., 0] - a[..., 2]) / (hi + 1e-3), 0.06, 0.16)
    return chroma * bright * balanced


def sky_image(h: int, w: int, mask: np.ndarray, kind: str, sun: tuple[float, float] | None, rng: np.random.Generator) -> np.ndarray:
    """A vertical gradient across the sky rows, soft streaky clouds lit from below, and an optional sun glow."""
    rows = np.where(mask.max(axis=1) > 0.5)[0]
    y0, y1 = (int(rows.min()), int(rows.max())) if rows.size else (0, h - 1)
    t = np.clip((np.arange(h) - y0) / max(1, (y1 - y0)), 0, 1)[:, None]  # 0 = top of the sky, 1 = horizon
    stops = np.array(SKIES[kind])
    pos = np.linspace(0, 1, len(stops))
    grad = np.stack([np.interp(t[:, 0], pos, stops[:, c]) for c in range(3)], axis=-1)[:, None, :].repeat(w, axis=1)
    # clouds: low-frequency noise stretched horizontally
    n = ndimage.gaussian_filter(rng.standard_normal((h // 4 + 1, w // 4 + 1)), (3, 14))
    n = ndimage.zoom(n / (n.std() + 1e-6), 4, order=1)[:h, :w]
    cloud = smoothstep(n, 0.2, 1.6)[..., None]
    lit = np.array(SKIES[kind][-2]) * 1.15
    grad = grad * (1 - 0.45 * cloud) + lit * 0.45 * cloud * (0.55 + 0.45 * t[..., None])
    if sun is not None:
        yy, xx = np.mgrid[0:h, 0:w]
        d2 = ((xx / w - sun[0]) * 1.4) ** 2 + (yy / h - sun[1]) ** 2
        grad = grad + np.array([1.0, 0.7, 0.35]) * (np.exp(-d2 / 0.018) * 0.5)[..., None]
    return np.clip(grad, 0, 1)


def luminance(a: np.ndarray) -> np.ndarray:
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def smoothstep(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    t = np.clip((x - lo) / (hi - lo), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def grade(a: np.ndarray, mood: Mood, panel: Panel, rng: np.random.Generator) -> np.ndarray:
    a = np.clip(a * mood.exposure * panel.exposure, 0, 1.5)
    # soften the engine's hard pixel stair-steps a touch before the stylised passes
    a = np.stack([ndimage.gaussian_filter(a[..., c], 0.55) for c in range(3)], axis=-1)
    lum = luminance(np.clip(a, 0, 1))

    # graphic-novel pass: soft posterised luminance and thin ink edges
    if mood.posterise > 0:
        levels = 7
        q = np.round(lum * levels) / levels
        ratio = (q + 0.02) / (lum + 0.02)
        post = a * ratio[..., None]
        a = a * (1 - mood.posterise) + post * mood.posterise
    if mood.ink > 0:
        sm = ndimage.gaussian_filter(lum, 0.9)
        gx, gy = ndimage.sobel(sm, axis=1), ndimage.sobel(sm, axis=0)
        edge = smoothstep(np.hypot(gx, gy), 0.18, 0.55)
        a = a * (1 - mood.ink * edge[..., None])

    # split tone: cool-deep shadows, warm highlights
    lum = luminance(np.clip(a, 0, 1))
    sh = np.array(mood.shadow)
    a = a * (sh + (1 - sh) * smoothstep(lum, 0.0, 0.55)[..., None])
    hl = np.array(mood.highlight)
    a = a + hl * (smoothstep(lum, 0.45, 1.0) ** 1.5)[..., None]

    # a boss / district colour, softly
    if panel.tint is not None and panel.tint_amount > 0:
        t = np.array(panel.tint)
        lum = luminance(np.clip(a, 0, 1))[..., None]
        soft = a * (0.65 + 0.7 * t)  # soft-light-ish multiply keeps the shading
        a = a * (1 - panel.tint_amount) + soft * panel.tint_amount + t * 0.04 * panel.tint_amount * (1 - lum)

    # saturation, curve
    lum = luminance(np.clip(a, 0, 1))[..., None]
    a = lum + (a - lum) * mood.sat
    a = np.clip(a, 0, 1) ** mood.gamma
    a = 0.5 + (a - 0.5) * mood.contrast
    a = np.clip(a, 0, 1)
    # S-curve shoulder so highlights roll off instead of clipping
    a = a * a * (3 - 2 * a) * 0.35 + a * 0.65

    # bloom
    if mood.bloom > 0:
        bright = np.clip(luminance(a) - 0.72, 0, 1)[..., None] * a
        glow = np.stack([ndimage.gaussian_filter(bright[..., c], 11) for c in range(3)], axis=-1)
        a = 1 - (1 - a) * (1 - np.clip(glow * mood.bloom * 3.0, 0, 1))

    # vignette
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    r2 = ((xx - w / 2) / (w / 2)) ** 2 * 0.85 + ((yy - h * 0.46) / (h / 2)) ** 2
    vig = 1 - mood.vignette * smoothstep(r2, 0.35, 1.5)
    a = a * vig[..., None]

    # fine film grain: luminance noise, a little stronger in the shadows, blurred so it compresses well
    n = ndimage.gaussian_filter(rng.standard_normal((h, w)), 0.7)
    n = n / (n.std() + 1e-6)
    lum = luminance(a)
    a = a + (n * mood.grain * (1.15 - 0.6 * lum))[..., None]
    return np.clip(a, 0, 1)


def encode(img: Image.Image) -> bytes:
    """The highest WebP quality (method 6) that stays under TARGET_BYTES; the lowest tried if none does."""
    best = None
    for q in range(82, 38, -3):
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=q, method=6)
        best = buf.getvalue()
        if len(best) <= TARGET_BYTES:
            break
    assert best is not None
    return best


def build_one(name: str, panel: Panel) -> int:
    src = MASTERS / f"{panel.master or name}.jpg"
    img = Image.open(src).convert("RGB")
    for box in panel.blank:
        blank_out(img, box)
    img = crop_16_9(img, panel.crop)
    rng = np.random.default_rng(zlib.crc32(name.encode()))
    a = np.asarray(img, dtype=np.float64) / 255.0
    mask = key_mask(a)
    if mask.max() > 0.5:
        # the sky is a pure key colour: grow its matte by two pixels so no fringe survives the resize, unmix the key colour
        # from the soft edge pixels that stay, then paint the sky behind
        mask = np.clip(ndimage.gaussian_filter(ndimage.maximum_filter(mask, size=5), 0.8) * 1.1, 0, 1)
        key = np.array([1.0, 0.0, 1.0])
        keep = np.clip((a - mask[..., None] * key) / np.maximum(1 - mask[..., None], 0.25), 0, 1)
        # the sky shows through the renderer's dithered fade of near objects: near the sky, a leftover magenta cast is spill, so
        # pull red and blue back towards green there (costumes far from the sky are never touched)
        near = ndimage.maximum_filter(mask > 0.3, size=61)
        cast = smoothstep(np.minimum(keep[..., 0], keep[..., 2]) - keep[..., 1], 0.06, 0.2) * (
            1.0 - smoothstep(np.abs(keep[..., 0] - keep[..., 2]), 0.2, 0.4)
        )
        w = (cast * near)[..., None]
        g = keep[..., 1:2]
        keep = keep * (1 - w) + np.concatenate([g + (keep[..., 0:1] - g) * 0.2, g, g + (keep[..., 2:3] - g) * 0.2], axis=-1) * w
        sky = sky_image(a.shape[0], a.shape[1], mask, panel.sky, panel.sun, rng)
        a = keep * (1 - mask[..., None]) + sky * mask[..., None]
    a = np.asarray(
        Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB").resize((WIDTH, HEIGHT), Image.LANCZOS),
        dtype=np.float64,
    ) / 255.0
    out = grade(a, MOODS[panel.mood], panel, rng)
    final = Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGB")
    data = encode(final)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{name}.webp").write_bytes(data)
    return len(data)


def main(argv: list[str]) -> int:
    table = load_panels()
    names = argv or sorted(table)
    total = 0
    for name in names:
        if name not in table:
            print(f"skip {name}: not in panels.py")
            continue
        if not (MASTERS / f"{table[name].master or name}.jpg").exists():
            print(f"skip {name}: no master (run scripts/story-shots.mjs)")
            continue
        size = build_one(name, table[name])
        total += size
        flag = "" if size <= TARGET_BYTES else "  (over target)"
        print(f"{name:34s} {size / 1024:6.1f} KB{flag}")
    if not argv:
        # a full build leaves exactly the panels in the table: panels that were renamed or dropped do not linger as orphans
        for old in sorted(OUT.glob("*.webp")):
            if old.stem not in table:
                old.unlink()
                print(f"removed {old.name} (not in panels.py)")
    print(f"total {total / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
