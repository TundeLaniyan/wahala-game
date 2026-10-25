"""Builds the menu artwork (src/assets/ui/*.webp) from the founder-approved Google Stitch exports.

Deterministic (Pillow only): run `python3 tools/ui/build_menu_art.py` after changing a master or a rule
below and commit the outputs. Never hand-edit the .webp files.

Masters (tools/ui/masters/) are the Stitch PNG exports re-saved as quality-95 JPEG. The script:
  * crops the mock fighting-game HUD (fake level badges, "VS", a tagline) baked into the Campus Queen art;
  * blends real-world brand marks into their surroundings (telecom / bank / beer signs in the key art,
    sportswear logos on the Street Baller kit) so the game ships no third-party trademarks;
  * writes two widths of each image as WebP for responsive `srcset` loading.
"""

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
MASTERS = ROOT / "tools" / "ui" / "masters"
OUT = ROOT / "src" / "assets" / "ui"

# (left, top, right, bottom) in master pixels
KEYART_MARKS = [
    (130, 184, 168, 286),  # vertical beer sign, left
    (1084, 152, 1121, 218),  # vertical beer sign, right
    (1196, 158, 1262, 232),  # telecom sign
    (1210, 28, 1376, 160),  # beer billboard + bank sign, top right
    (1252, 244, 1376, 326),  # bank sign
]
STREET_BALLER_MARKS = [
    (296, 370, 344, 400),  # sportswear mark on the jersey
    (383, 620, 462, 657),  # league badge on the jersey hem
    (416, 666, 474, 697),  # sportswear mark on the shorts
]

FIGHTER_CROPS = {
    # top: fake HUD bar with level badges; bottom: "VS" and a tagline plate
    "campusQueen": (0, 126, 768, 1222),
    "lekkiBoy": (0, 40, 768, 1376),
    "streetBaller": (0, 40, 768, 1376),
}


def blend_out(img: Image.Image, box: tuple[int, int, int, int], darken: float = 0.55) -> None:
    """Replaces `box` with a heavy blur of its surroundings, dimmed so it reads as an unlit, unreadable sign."""
    l, t, r, b = box
    pad = 18
    region = img.crop((max(0, l - pad), max(0, t - pad), min(img.width, r + pad), min(img.height, b + pad)))
    blurred = region.filter(ImageFilter.GaussianBlur(14)).filter(ImageFilter.GaussianBlur(8))
    blurred = Image.eval(blurred, lambda v: int(v * darken))
    inner = blurred.crop((l - max(0, l - pad), t - max(0, t - pad), r - max(0, l - pad), b - max(0, t - pad)))
    mask = Image.new("L", inner.size, 0)
    # feathered mask so the patch has no hard edge
    core = Image.new("L", (max(1, inner.width - 8), max(1, inner.height - 8)), 255)
    mask.paste(core, (4, 4))
    mask = mask.filter(ImageFilter.GaussianBlur(3))
    img.paste(inner, (l, t), mask)


def save_widths(img: Image.Image, name: str, widths: list[int], quality: int) -> None:
    for w in widths:
        h = round(img.height * w / img.width)
        out = img if w == img.width else img.resize((w, h), Image.LANCZOS)
        path = OUT / f"{name}-{w}.webp"
        out.save(path, "WEBP", quality=quality, method=6)
        print(f"{path.relative_to(ROOT)}  {out.width}x{out.height}  {path.stat().st_size // 1024} KB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    key = Image.open(MASTERS / "keyart_lagos_night.jpg").convert("RGB")
    for box in KEYART_MARKS:
        blend_out(key, box)
    save_widths(key, "keyart", [768, 1376], 72)

    for fighter, crop in FIGHTER_CROPS.items():
        img = Image.open(MASTERS / f"fighter_{fighter}.jpg").convert("RGB")
        if fighter == "streetBaller":
            for box in STREET_BALLER_MARKS:
                blend_out(img, box, darken=0.9)
        img = img.crop(crop)
        save_widths(img, f"fighter-{fighter}", [360, 720], 78)


if __name__ == "__main__":
    main()
