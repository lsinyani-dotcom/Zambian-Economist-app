"""Builds the Android launcher icons and splash images from the site logo.

Usage: python3 scripts/make_icons.py path/to/logo.png
Writes into android/app/src/main/res. The logo is placed on white.
"""
import os
import sys
from PIL import Image, ImageDraw

RES = os.path.join(os.path.dirname(__file__), '..', 'android', 'app', 'src', 'main', 'res')
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
WHITE = (255, 255, 255, 255)


def load_logo(path):
    logo = Image.open(path).convert('RGBA')
    # Trim empty or white margins so the mark fills the icon properly.
    bg = Image.new('RGBA', logo.size, WHITE)
    flat = Image.alpha_composite(bg, logo).convert('RGB')
    inv = Image.eval(flat, lambda v: 255 - v)
    box = inv.getbbox()
    if box:
        logo = logo.crop(box)
    return logo


def fit(logo, size, scale, bg=WHITE):
    """Logo centred on a square `size` wide, filling `scale` of it."""
    canvas = Image.new('RGBA', (size, size), bg)
    target = int(size * scale)
    w, h = logo.size
    r = target / max(w, h)
    lg = logo.resize((max(1, int(w * r)), max(1, int(h * r))), Image.LANCZOS)
    canvas.alpha_composite(lg, ((size - lg.width) // 2, (size - lg.height) // 2))
    return canvas


def round_mask(img):
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).ellipse([0, 0, img.width - 1, img.height - 1], fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def main(src):
    logo = load_logo(src)
    # A logo that is a solid block (like the ZE monogram) gets its own colour as the
    # icon background, so the launcher icon is a full navy tile rather than a box on white.
    corner = logo.getpixel((2, 2))
    solid = corner[3] > 250 and logo.getpixel((logo.width - 3, logo.height - 3))[:3] == corner[:3]
    bg = corner if solid else WHITE
    hexbg = '#%02X%02X%02X' % bg[:3]
    with open(os.path.join(RES, 'values', 'ic_launcher_background.xml'), 'w') as fh:
        fh.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">%s</color>\n</resources>\n' % hexbg)
    for name, d in DENSITIES.items():
        folder = os.path.join(RES, 'mipmap-' + name)
        os.makedirs(folder, exist_ok=True)
        legacy = int(48 * d)
        fit(logo, legacy, 1.0 if solid else 0.80, bg).save(os.path.join(folder, 'ic_launcher.png'))
        round_mask(fit(logo, legacy, 1.0 if solid else 0.68, bg)).save(os.path.join(folder, 'ic_launcher_round.png'))
        # Adaptive icon foreground: 108dp canvas, keep the mark inside the 66dp safe zone.
        fg = int(108 * d)
        fit(logo, fg, 0.78 if solid else 0.56, bg).save(os.path.join(folder, 'ic_launcher_foreground.png'))

    # Splash images (older Android versions): white with the logo in the middle.
    for root, _dirs, files in os.walk(RES):
        for f in files:
            if f == 'splash.png':
                p = os.path.join(root, f)
                w, h = Image.open(p).size
                canvas = Image.new('RGBA', (w, h), WHITE)
                side = int(min(w, h) * 0.32)
                mark = fit(logo, side, 1.0)
                canvas.alpha_composite(mark, ((w - side) // 2, (h - side) // 2))
                canvas.convert('RGB').save(p)
    print('Icons and splash images written from', src)


if __name__ == '__main__':
    main(sys.argv[1])
