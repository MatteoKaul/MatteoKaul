"""Release cards: dot-matrix cards linking to the latest releases of your repos.

    GITHUB_TOKEN=... GH_USER=MatteoKaul python scripts/releases.py
    python scripts/releases.py --sample      # fake data, no network

Settings (settings.txt):
    releases       = off | latest | each | list
                     off    -> section hidden
                     latest -> one card: newest release across all public repos
                     each   -> one card per public repo that has a release
                     list   -> one card per repo named in releases_repos
    releases_repos = repo-a, repo-b     (only for "list", in this order)
    releases_limit = 6                  (max cards for "each")

Writes assets/releases/<repo>.svg and the README block between
<!-- releases --> and <!-- /releases --> (heading included, so "off" removes
the whole section). Run daily by .github/workflows/profile.yml.
"""
import os
import sys

from common import ASSETS, graphql, read_settings, replace_readme_block, split_list
from dotmatrix import layout, svg_doc, svg_text

OUT_DIR = ASSETS / "releases"
W, H = 430, 108  # card size; two cards fit side by side in the README

QUERY = """
query($login: String!) {
  user(login: $login) {
    repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC,
                 orderBy: {field: PUSHED_AT, direction: DESC}) {
      nodes {
        name
        latestRelease { tagName url publishedAt }
      }
    }
  }
}"""


def fetch(login, token):
    """[{repo, tag, url, date}] for every public repo with a release, newest first."""
    repos = graphql(QUERY, {"login": login}, token)["user"]["repositories"]["nodes"]
    releases = [
        {"repo": r["name"], "tag": r["latestRelease"]["tagName"],
         "url": r["latestRelease"]["url"], "date": r["latestRelease"]["publishedAt"][:10]}
        for r in repos if r["latestRelease"]
    ]
    return sorted(releases, key=lambda rel: rel["date"], reverse=True)


def select(releases, settings):
    """Apply the releases / releases_repos / releases_limit settings."""
    mode = settings.get("releases", "each").lower()
    if mode == "off":
        return None
    if mode == "latest":
        return releases[:1]
    if mode == "list":
        by_name = {rel["repo"].lower(): rel for rel in releases}
        return [by_name[n.lower()] for n in split_list(settings.get("releases_repos", "")) if n.lower() in by_name]
    if mode == "each":
        return releases[:int(settings.get("releases_limit", 6))]
    raise SystemExit(f"releases: unknown mode '{mode}' (off, latest, each, list)")


def truncate(text, pitch, max_width):
    """Shorten text with a trailing "." until it fits max_width at this pitch."""
    if layout(text, pitch)[1] <= max_width:
        return text
    while len(text) > 1 and layout(text + ".", pitch)[1] > max_width:
        text = text[:-1]
    return text + "."


def card(rel):
    """Black card, fixed type sizes so all cards look alike:
        LATEST RELEASE               (small, grey)
        REPO-NAME                    (large, white, full width)
        2026-10-28            V2.3.0 (date grey, tag white)
    """
    pad = 22
    tag = truncate(rel["tag"], 2.8, 200)
    tag_svg, tag_w, _ = svg_text(tag, W - pad, 78, 2.8, 1.1, "#fff", anchor="end")
    parts = [
        svg_text("LATEST RELEASE", pad, 16, 2.2, 0.85, "#8a8a8a")[0],
        svg_text(truncate(rel["repo"], 3.4, W - 2 * pad - 4), pad, 40, 3.4, 1.35, "#fff")[0],
        svg_text(rel["date"], pad, 78, 2.8, 1.1, "#bdbdbd")[0],
        tag_svg,
    ]
    return svg_doc(W, H, f'<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="12" '
                         f'fill="#000" stroke="#2a2a2a"/>' + "".join(parts))


def placeholder():
    text, _, h = svg_text("NO RELEASES YET", 22, 0, 3.0, 1.15, "#6a6a6a")
    return svg_doc(W, H, f'<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="12" fill="#000" '
                         f'stroke="#2a2a2a"/><g transform="translate(0 {(H - h) / 2})">{text}</g>')


def main(releases):
    chosen = select(releases, read_settings())

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("*.svg"):  # drop cards of repos no longer shown
        old.unlink()

    if chosen is None:
        replace_readme_block("releases", "")
        print("releases: off")
        return

    heading = '<img src="assets/headings/releases.svg" alt="Releases" width="100%" />\n\n'
    if not chosen:
        (OUT_DIR / "none.svg").write_text(placeholder())
        replace_readme_block("releases", heading + '<img src="assets/releases/none.svg" alt="No releases yet" width="49%" />')
        print("releases: none found")
        return

    links = []
    for rel in chosen:
        (OUT_DIR / f"{rel['repo']}.svg").write_text(card(rel))
        links.append(f'<a href="{rel["url"]}"><img src="assets/releases/{rel["repo"]}.svg" '
                     f'alt="{rel["repo"]} {rel["tag"]}" width="49%" /></a>')
    replace_readme_block("releases", heading + "<p>\n" + "\n".join(links) + "\n</p>")
    print(f"releases: {[r['repo'] + ' ' + r['tag'] for r in chosen]}")


SAMPLE = [
    {"repo": "homelab-dashboard", "tag": "v2.3.0", "url": "https://github.com", "date": "2026-10-28"},
    {"repo": "lumi", "tag": "v0.9.1-beta", "url": "https://github.com", "date": "2026-10-12"},
    {"repo": "a-really-long-repository-name-here", "tag": "v1.0.0", "url": "https://github.com", "date": "2026-09-30"},
    {"repo": "dotfiles", "tag": "2026.09", "url": "https://github.com", "date": "2026-09-02"},
]

if __name__ == "__main__":
    main(SAMPLE if "--sample" in sys.argv else fetch(os.environ["GH_USER"], os.environ["GITHUB_TOKEN"]))
