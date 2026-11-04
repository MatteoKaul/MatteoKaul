"""Rebuild the static images of the profile README.

    pip install pillow            # only needed for the banner
    python scripts/build_assets.py
    python scripts/build_assets.py --title "LUMI CODE"   # override settings.txt
    python scripts/build_assets.py --list                # show available icons

Writes:
    assets/banner.jpg           banner_title from settings.txt on assets/src/background.webp
    assets/headings/<name>.svg  black section bars with dot-matrix text
    assets/icons/<key>.svg      black tiles for the icons listed in settings.txt
    README.md                   icon rows between the <!-- icons:... --> markers

Icons come from scripts/icons.json: key -> label, group and the logo as SVG
markup in a 24x24 box (mostly paths from the Simple Icons project; Windows,
C# and SQL are hand-drawn). To add an icon, add an entry there.

Data driven parts (stats card, release cards) are made by stats.py and
releases.py, which need the GitHub API.
"""
import argparse
import json
from pathlib import Path

from common import ASSETS, read_settings, replace_readme_block, split_list
from dotmatrix import LARGE, layout, svg_doc, svg_text

HEADINGS = {
    "about": "ABOUT",
    "languages": "LANGUAGES",
    "systems": "SYSTEMS & TOOLS",
    "projects": "PROJECTS",
    "releases": "RELEASES",
    "stats": "STATS",
}

ICONS = json.loads((Path(__file__).parent / "icons.json").read_text())

# README sections filled with icon rows; each name is a settings.txt key and
# a marker pair <!-- icons:NAME --> ... <!-- /icons:NAME --> in README.md.
ICON_SECTIONS = ("languages", "systems")


def heading(label):
    """880px wide black bar, text left-aligned with 24px padding."""
    text, _, h = svg_text(label, 24, 16, pitch=5.6, r=2.1, fill="#fff")
    width, height = 880, int(h + 32)
    return svg_doc(width, height, f'<rect width="{width}" height="{height}" rx="10" fill="#000"/>{text}')


def tile(logo, label):
    """168x132 tile: logo (24x24 SVG markup scaled 2x) on top, label centred below.
    Long labels get a smaller pitch so they always fit with 10px margin."""
    width, height = 168, 132
    _, unit_w, _ = layout(label, 1)  # width at pitch 1 scales linearly
    pitch = min(3.0, (width - 20) / (unit_w + 1))
    r = round(pitch * 0.4, 2)
    _, w, h = layout(label, pitch)
    text, _, _ = svg_text(label, (width - w - 2 * r) / 2, 112 - (h + 2 * r) / 2, pitch, r, "#e0e0e0")
    return svg_doc(width, height,
               f'<rect x=".5" y=".5" width="{width - 1}" height="{height - 1}" rx="12" fill="#000" stroke="#2a2a2a"/>'
               f'<g transform="translate({(width - 48) / 2} 22) scale(2)" fill="#fff">{logo}</g>{text}')


def banner(title, shadow_pct=60):
    """1600x420 JPEG with `title` in the large dot font.
    shadow_pct: darkness of the shadow around the letters, 0 = off, 100 = black.
    Drawn at 2x and scaled down for smooth dots."""
    from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

    W, H, S = 1600, 420, 2
    photo = Image.open(ASSETS / "src" / "background.webp").convert("L")
    # Crop a 1600:420 band starting at 30% of the photo height.
    pw, ph = photo.size
    top = int(ph * 0.30)
    img = photo.crop((0, top, pw, top + int(pw * H / W))).resize((W * S, H * S), Image.LANCZOS)
    img = ImageEnhance.Contrast(img).enhance(1.15).point(lambda p: int(p * 0.42))  # darken

    title = title.upper()
    unknown = sorted(set(title) - set(LARGE) - {" "})
    if unknown:
        raise SystemExit(f"banner_title: unsupported characters {unknown} (use A-Z and spaces)")

    # Dot pitch 15px; titles wider than 85% of the banner get a smaller pitch.
    style = dict(font=LARGE, gap=2, shear=0.16)
    _, unit_w, _ = layout(title, 1, **style)
    pitch = min(15, W * 0.85 / unit_w) * S
    r = pitch * 0.393  # dot radius relative to spacing, as in the original
    points, w, h = layout(title, pitch, **style)
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
    shadow = circles(pitch * 0.6, int(2.55 * shadow_pct)).filter(ImageFilter.GaussianBlur(3.5 * S))
    img = Image.composite(Image.new("L", img.size, 0), img, shadow)
    img = Image.composite(Image.new("L", img.size, 255), img, circles(r, 255)).convert("RGB")
    img.resize((W, H), Image.LANCZOS).save(ASSETS / "banner.jpg", quality=92)


def icon_keys(settings, section):
    """Comma separated icon keys of one settings entry, validated."""
    keys = [k.lower() for k in split_list(settings.get(section, ""))]
    unknown = [k for k in keys if k not in ICONS]
    if unknown:
        raise SystemExit(f"{section}: unknown icons {unknown}; see --list")
    return keys


def update_readme(sections, height):
    """Rewrite the icon rows between the <!-- icons:NAME --> markers."""
    for name, keys in sections.items():
        imgs = "\n".join(f'  <img src="assets/icons/{k}.svg" alt="{ICONS[k]["label"]}" height="{height}" />'
                         for k in keys)
        replace_readme_block(f"icons:{name}", f"<p>\n{imgs}\n</p>" if keys else "")


def list_icons():
    for group in ICON_SECTIONS:
        print(f"{group}: " + ", ".join(k for k, v in ICONS.items() if v["group"] == group))


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--title", help="banner text (default: banner_title in settings.txt)")
    parser.add_argument("--list", action="store_true", help="list available icon keys and exit")
    args = parser.parse_args()
    if args.list:
        return list_icons()

    settings = read_settings()
    title = args.title or settings.get("banner_title", "MATREXX")
    shadow_pct = int(settings.get("banner_shadow", 60))
    icon_size = int(settings.get("icon_size", 100))
    sections = {name: icon_keys(settings, name) for name in ICON_SECTIONS}

    (ASSETS / "headings").mkdir(parents=True, exist_ok=True)
    for name, label in HEADINGS.items():
        (ASSETS / "headings" / f"{name}.svg").write_text(heading(label))

    # Only the enabled tiles are kept in assets/icons; stale ones are removed.
    icon_dir = ASSETS / "icons"
    icon_dir.mkdir(parents=True, exist_ok=True)
    enabled = {k for keys in sections.values() for k in keys}
    for old in icon_dir.glob("*.svg"):
        if old.stem not in enabled:
            old.unlink()
    for key in enabled:
        (icon_dir / f"{key}.svg").write_text(tile(ICONS[key]["svg"], ICONS[key]["label"]))

    update_readme(sections, icon_size)
    banner(title, shadow_pct)
    print(f"assets rebuilt, banner: {title}, icons: {sorted(enabled)}")


if __name__ == "__main__":
    main()
