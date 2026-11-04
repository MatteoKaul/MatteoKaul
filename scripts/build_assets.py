"""Rebuild the static images of the profile README.

    pip install pillow            # only needed for the banner
    python scripts/build_assets.py

Writes:
    assets/banner.jpg           title "MATREXX" on assets/src/background.webp
    assets/headings/<name>.svg  black section bars with dot-matrix text
    assets/icons/<name>.svg     black tiles: white logo + dot-matrix label

Logo shapes come from scripts/icons.json (24x24 SVG paths, taken from the
Simple Icons project; the Windows logo is hand-drawn). To add a tile, add its
path there and an entry to TILES below.

Only needed when changing the design. assets/stats.svg is made by stats.py.
"""
import json
from pathlib import Path

from dotmatrix import LARGE, layout, svg_text

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

HEADINGS = {
    "about": "ABOUT",
    "languages": "LANGUAGES",
    "systems": "SYSTEMS & TOOLS",
    "projects": "PROJECTS",
    "stats": "STATS",
}

# (file name / key in icons.json, label under the logo)
TILES = [
    ("c", "C"), ("javascript", "JAVASCRIPT"), ("typescript", "TYPESCRIPT"),
    ("openjdk", "JAVA"), ("python", "PYTHON"),
    ("apple", "MACOS"), ("cachyos", "CACHYOS"), ("windows", "WINDOWS"),
    ("ubuntu", "UBUNTU"), ("raspberrypi", "PI OS"), ("truenas", "TRUENAS"),
    ("docker", "DOCKER"), ("git", "GIT"), ("cmake", "CMAKE"),
]


def svg(width, height, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="0 0 {width} {height}">{body}</svg>')


def heading(label):
    """880px wide black bar, text left-aligned with 24px padding."""
    text, _, h = svg_text(label, 24, 16, pitch=5.6, r=2.1, fill="#fff")
    width, height = 880, int(h + 32)
    return svg(width, height, f'<rect width="{width}" height="{height}" rx="10" fill="#000"/>{text}')


def tile(path, label):
    """168x132 tile: logo (24x24 path scaled 2x) on top, label centred below.
    Long labels get a smaller pitch so they always fit with 10px margin."""
    width, height = 168, 132
    _, unit_w, _ = layout(label, 1)  # width at pitch 1 scales linearly
    pitch = min(3.0, (width - 20) / (unit_w + 1))
    r = round(pitch * 0.4, 2)
    _, w, h = layout(label, pitch)
    text, _, _ = svg_text(label, (width - w - 2 * r) / 2, 112 - (h + 2 * r) / 2, pitch, r, "#e0e0e0")
    return svg(width, height,
               f'<rect x=".5" y=".5" width="{width - 1}" height="{height - 1}" rx="12" fill="#000" stroke="#2a2a2a"/>'
               f'<g transform="translate({(width - 48) / 2} 22) scale(2)" fill="#fff"><path d="{path}"/></g>{text}')


def banner():
    """1600x420 JPEG. Drawn at 2x and scaled down for smooth dots."""
    from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

    W, H, S = 1600, 420, 2
    photo = Image.open(ASSETS / "src" / "background.webp").convert("L")
    # Crop a 1600:420 band starting at 30% of the photo height.
    pw, ph = photo.size
    top = int(ph * 0.30)
    img = photo.crop((0, top, pw, top + int(pw * H / W))).resize((W * S, H * S), Image.LANCZOS)
    img = ImageEnhance.Contrast(img).enhance(1.15).point(lambda p: int(p * 0.42))  # darken

    pitch, r = 15 * S, 5.9 * S
    points, w, h = layout("MATREXX", pitch, font=LARGE, gap=2, shear=0.16)
    x0, y0 = (W * S - w) / 2, (H * S - h) / 2
    dots = [(x0 + px, y0 + py) for px, py in points]

    def circles(radius, fill):
        layer = Image.new("L", img.size, 0)
        draw = ImageDraw.Draw(layer)
        for x, y in dots:
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)
        return layer

    # Shadow that follows the letter shapes: dot circles just large enough to
    # merge into continuous strokes, then blurred so it fades evenly within a
    # few pixels. Separates the dots from the grid without a dark area.
    shadow = circles(pitch * 0.62, 170).filter(ImageFilter.GaussianBlur(4 * S))
    img = Image.composite(Image.new("L", img.size, 0), img, shadow)
    img = Image.composite(Image.new("L", img.size, 255), img, circles(r, 255)).convert("RGB")
    img.resize((W, H), Image.LANCZOS).save(ASSETS / "banner.jpg", quality=92)


def main():
    (ASSETS / "headings").mkdir(parents=True, exist_ok=True)
    (ASSETS / "icons").mkdir(parents=True, exist_ok=True)
    for name, label in HEADINGS.items():
        (ASSETS / "headings" / f"{name}.svg").write_text(heading(label))

    paths = json.loads((Path(__file__).parent / "icons.json").read_text())
    for name, label in TILES:
        (ASSETS / "icons" / f"{name}.svg").write_text(tile(paths[name], label))

    banner()
    print("assets rebuilt")


if __name__ == "__main__":
    main()
