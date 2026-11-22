"""Generate degraded variants of the pack photos for the OCR benchmark.

Usage (needs Pillow):  python scripts/ocr-fixtures.py
Then:                  OCR_BENCH=1 pnpm test        (PowerShell: $env:OCR_BENCH=1; pnpm test)

Reads test-fixtures/packs/*.webp|png|jpg and writes test-fixtures/packs/variants/<name>__<variant>.png.
Aimed-crop variants (crop_*) imitate a person holding the number inside the on-screen box; full_*
variants are whole frames, which the live reader does not rely on.
Crop boxes are per photo in CROPS (fractions of width and height).
"""
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent / "test-fixtures" / "packs"
OUT = ROOT / "variants"
OUT.mkdir(exist_ok=True)

# name -> (left, top, right, bottom) of the NAFDAC line as fractions of the photo
CROPS = {"b4-6953": (0.0, 0.02, 0.62, 0.18)}
BG = (200, 190, 200)


def variants(im: Image.Image, crop_box):
    w, h = im.size
    out = {
        "full_orig": im,
        "full_half": im.resize((w // 2, h // 2)),
        "full_blur": im.filter(ImageFilter.GaussianBlur(1.8)),
        "full_rot6": im.rotate(6, expand=True, fillcolor=BG),
        "full_dim": ImageEnhance.Contrast(ImageEnhance.Brightness(im).enhance(0.55)).enhance(0.6),
    }
    if crop_box:
        l, t, r, b = crop_box
        c = im.crop((int(w * l), int(h * t), int(w * r), int(h * b)))
        out.update(
            {
                "crop_orig": c,
                "crop_half": c.resize((c.width // 2, c.height // 2)),
                "crop_blur": c.filter(ImageFilter.GaussianBlur(1.4)),
                "crop_rot5": c.rotate(5, expand=True, fillcolor=BG),
                "crop_dim": ImageEnhance.Contrast(ImageEnhance.Brightness(c).enhance(0.5)).enhance(0.55),
            }
        )
    return out


for path in sorted(ROOT.iterdir()):
    if path.suffix.lower() not in {".webp", ".png", ".jpg", ".jpeg"}:
        continue
    im = Image.open(path).convert("RGB")
    for name, v in variants(im, CROPS.get(path.stem)).items():
        v.save(OUT / f"{path.stem}__{name}.png")
    print("wrote variants for", path.name)
