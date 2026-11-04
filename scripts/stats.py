"""Generate assets/stats.svg, a dot-matrix stats card, from the GitHub API.

    GITHUB_TOKEN=... GH_USER=MatteoKaul python scripts/stats.py
    python scripts/stats.py --sample      # fake data, no network

Run daily by .github/workflows/stats.yml. Standard library only.
Counts public, non-fork repositories owned by the user; commits are the
user's commit contributions of the last 12 months.
"""
import json
import os
import sys
import urllib.request
from collections import Counter
from pathlib import Path

from dotmatrix import svg_text

OUT = Path(__file__).resolve().parent.parent / "assets" / "stats.svg"
W = 880  # same width as the section headings

QUERY = """
query($login: String!) {
  user(login: $login) {
    followers { totalCount }
    contributionsCollection { totalCommitContributions }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
      totalCount
      nodes {
        stargazerCount
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name } }
        }
      }
    }
  }
}"""


def fetch(login, token):
    """Query the GraphQL API and reduce the answer to the numbers we draw."""
    req = urllib.request.Request(
        "https://api.github.com/graphql",
        data=json.dumps({"query": QUERY, "variables": {"login": login}}).encode(),
        headers={"Authorization": f"bearer {token}", "User-Agent": "profile-stats"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.load(resp)
    if "errors" in payload:
        sys.exit(f"GraphQL error: {payload['errors']}")

    user = payload["data"]["user"]
    repos = user["repositories"]["nodes"]

    # Sum code size per language over all repos, keep the top 5 as percentages.
    size = Counter()
    for repo in repos:
        for edge in repo["languages"]["edges"]:
            size[edge["node"]["name"]] += edge["size"]
    total = sum(size.values())
    langs = [(name, 100 * s / total) for name, s in size.most_common(5)] if total else []

    return {
        "repos": user["repositories"]["totalCount"],
        "stars": sum(r["stargazerCount"] for r in repos),
        "commits": user["contributionsCollection"]["totalCommitContributions"],
        "followers": user["followers"]["totalCount"],
        "langs": langs,
    }


def short(n):
    """12840 -> 12.8K, keeps numbers within their column."""
    return f"{n / 1000:.1f}K".replace(".0K", "K") if n >= 10000 else str(n)


def bar(x, y, pct, dots=44, step=11):
    """Row of dots, the first pct% white, the rest dark grey."""
    filled = max(1, round(pct / 100 * dots))
    return "".join(
        f'<circle cx="{x + k * step + 3}" cy="{y:.1f}" r="3" fill="{"#fff" if k < filled else "#2c2c2c"}"/>'
        for k in range(dots))


def render(d):
    parts = []

    # Row 1: four big numbers with labels underneath.
    items = [("REPOS", d["repos"]), ("STARS", d["stars"]),
             ("COMMITS", d["commits"]), ("FOLLOWERS", d["followers"])]
    col = (W - 48) / len(items)
    for i, (label, value) in enumerate(items):
        x = 24 + i * col
        num, _, h = svg_text(short(value), x, 28, pitch=5.5, r=2.1, fill="#fff")
        lbl, _, _ = svg_text(label, x, 28 + h + 16, pitch=3.0, r=1.1, fill="#bdbdbd")
        parts += [num, lbl]

    # Row 2: top languages as dot bars.
    y = 148
    parts.append(svg_text("TOP LANGUAGES", 24, y, 3.0, 1.1, "#bdbdbd")[0])
    y += 32
    if not d["langs"]:
        parts.append(svg_text("NO PUBLIC CODE YET", 24, y, 4.0, 1.5, "#6a6a6a")[0])
        y += 30
    for name, pct in d["langs"]:
        parts.append(svg_text(name[:12], 24, y, 3.0, 1.2, "#fff")[0])
        parts.append(bar(260, y + 8, pct))
        parts.append(svg_text(f"{pct:.0f}%", W - 24, y, 3.0, 1.2, "#bdbdbd", anchor="end")[0])
        y += 30

    height = y + 4
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{height}" '
            f'viewBox="0 0 {W} {height}"><rect width="{W}" height="{height}" rx="10" fill="#000"/>'
            + "".join(parts) + "</svg>")


SAMPLE = {"repos": 12, "stars": 34, "commits": 12840, "followers": 5,
          "langs": [("Python", 41), ("TypeScript", 27), ("C", 18), ("Java", 9), ("JavaScript", 5)]}

if __name__ == "__main__":
    data = SAMPLE if "--sample" in sys.argv else fetch(os.environ["GH_USER"], os.environ["GITHUB_TOKEN"])
    OUT.write_text(render(data))
    print(f"wrote {OUT}: {data}")
