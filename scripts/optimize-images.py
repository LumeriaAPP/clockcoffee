"""
Orijinal PNG-ləri (assets/img/src) veb üçün WebP-yə çevirir.

    python scripts/optimize-images.py

Şəffaflıq saxlanılır; ölçülər aşağıdakı MAX_SIZE cədvəlinə görə kiçildilir.
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "img" / "src"
OUT = ROOT / "assets" / "img"

# fayl adı (uzantısız): maksimum tərəf (px)
MAX_SIZE = {
    "hero-cup": 1100,
    "iced-latte": 760,
    "croissant": 820,
    "coffee-beans": 520,
    "coffee-branch": 820,
    "alarm-clock": 820,
    "sandwich": 820,
    "caesar": 1000,
    "work": 1600,
    "meet": 1600,
}
DEFAULT_MAX = 900


def saucer_center(img: Image.Image):
    """Fincan nəlbəkisinin mərkəzini (0..1 nisbətində) tapır, saat əqrəbləri üçün."""
    alpha = img.getchannel("A").point(lambda a: 255 if a > 40 else 0)
    box = alpha.getbbox()
    if not box:
        return 0.5, 0.5
    left, top, right, bottom = box
    diameter = bottom - top
    cx = left + diameter / 2
    cy = top + diameter / 2
    return cx / img.width, cy / img.height


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    SRC.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in SRC.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"})
    if not files:
        print("assets/img/src qovluğunda şəkil yoxdur")
        return
    for src in files:
        name = src.stem
        img = Image.open(src)
        has_alpha = img.mode in ("RGBA", "LA") or "transparency" in img.info
        img = img.convert("RGBA" if has_alpha else "RGB")
        limit = MAX_SIZE.get(name, DEFAULT_MAX)
        img.thumbnail((limit, limit), Image.LANCZOS)
        out = OUT / f"{name}.webp"
        img.save(out, "WEBP", quality=86, method=6, lossless=False)
        extra = ""
        if name == "hero-cup" and has_alpha:
            cx, cy = saucer_center(img)
            extra = f"  nəlbəki mərkəzi: x={cx:.4f} y={cy:.4f}"
        print(f"{src.name:28} -> {out.name:22} {img.width}x{img.height}  {out.stat().st_size // 1024} KB{extra}")


if __name__ == "__main__":
    main()
