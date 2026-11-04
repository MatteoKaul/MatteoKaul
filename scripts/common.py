"""Helpers shared by the scripts: paths, settings.txt, README markers, GitHub API."""
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
README = ROOT / "README.md"


def read_settings(path=ROOT / "settings.txt"):
    """Parse "key = value" lines; blank lines and "#" comments are ignored."""
    settings = {}
    for line in path.read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if "=" in line:
            key, value = line.split("=", 1)
            settings[key.strip()] = value.strip()
    return settings


def split_list(value):
    """"a, b ,c" -> ["a", "b", "c"]"""
    return [item.strip() for item in value.split(",") if item.strip()]


def replace_readme_block(name, content):
    """Replace everything between <!-- NAME --> and <!-- /NAME --> in README.md."""
    text = README.read_text()
    pattern = rf"<!-- {re.escape(name)} -->.*?<!-- /{re.escape(name)} -->"
    if not re.search(pattern, text, flags=re.S):
        raise SystemExit(f"README.md: markers <!-- {name} --> ... <!-- /{name} --> not found")
    block = f"<!-- {name} -->\n{content}\n<!-- /{name} -->" if content else f"<!-- {name} -->\n<!-- /{name} -->"
    README.write_text(re.sub(pattern, lambda _: block, text, flags=re.S))


def graphql(query, variables, token):
    """POST a GraphQL query to the GitHub API and return its "data"."""
    req = urllib.request.Request(
        "https://api.github.com/graphql",
        data=json.dumps({"query": query, "variables": variables}).encode(),
        headers={"Authorization": f"bearer {token}", "User-Agent": "profile-readme"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.load(resp)
    if "errors" in payload:
        raise SystemExit(f"GraphQL error: {payload['errors']}")
    return payload["data"]
