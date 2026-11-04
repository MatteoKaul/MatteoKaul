#!/usr/bin/env python3
"""Generate assets/stats.svg (dot-matrix style) from the GitHub GraphQL API.

Usage:
  GITHUB_TOKEN=... GH_USER=MatteoKaul python scripts/stats.py
  python scripts/stats.py --sample     # render with fake data, no network
Standard library only.
"""
import json, os, sys, urllib.request
from collections import Counter

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'stats.svg')

FONT = {
 'A':'01110,10001,10001,11111,10001,10001,10001','B':'11110,10001,10001,11110,10001,10001,11110',
 'C':'01110,10001,10000,10000,10000,10001,01110','D':'11110,10001,10001,10001,10001,10001,11110',
 'E':'11111,10000,10000,11110,10000,10000,11111','F':'11111,10000,10000,11110,10000,10000,10000',
 'G':'01110,10001,10000,10111,10001,10001,01111','H':'10001,10001,10001,11111,10001,10001,10001',
 'I':'01110,00100,00100,00100,00100,00100,01110','J':'00111,00010,00010,00010,00010,10010,01100',
 'K':'10001,10010,10100,11000,10100,10010,10001','L':'10000,10000,10000,10000,10000,10000,11111',
 'M':'10001,11011,10101,10101,10001,10001,10001','N':'10001,11001,10101,10011,10001,10001,10001',
 'O':'01110,10001,10001,10001,10001,10001,01110','P':'11110,10001,10001,11110,10000,10000,10000',
 'Q':'01110,10001,10001,10001,10101,10010,01101','R':'11110,10001,10001,11110,10100,10010,10001',
 'S':'01111,10000,10000,01110,00001,00001,11110','T':'11111,00100,00100,00100,00100,00100,00100',
 'U':'10001,10001,10001,10001,10001,10001,01110','V':'10001,10001,10001,10001,10001,01010,00100',
 'W':'10001,10001,10001,10101,10101,11011,10001','X':'10001,10001,01010,00100,01010,10001,10001',
 'Y':'10001,10001,01010,00100,00100,00100,00100','Z':'11111,00001,00010,00100,01000,10000,11111',
 '0':'01110,10001,10011,10101,11001,10001,01110','1':'00100,01100,00100,00100,00100,00100,01110',
 '2':'01110,10001,00001,00010,00100,01000,11111','3':'11110,00001,00001,01110,00001,00001,11110',
 '4':'00010,00110,01010,10010,11111,00010,00010','5':'11111,10000,11110,00001,00001,10001,01110',
 '6':'00110,01000,10000,11110,10001,10001,01110','7':'11111,00001,00010,00100,01000,01000,01000',
 '8':'01110,10001,10001,01110,10001,10001,01110','9':'01110,10001,10001,01111,00001,00010,01100',
 '+':'00000,00100,00100,11111,00100,00100,00000','#':'01010,01010,11111,01010,11111,01010,01010',
 '-':'00000,00000,00000,11111,00000,00000,00000','.':'00000,00000,00000,00000,00000,01100,01100',
 '%':'11001,11010,00010,00100,01000,01011,10011','&':'01100,10010,10100,01000,10101,10010,01101',
 ' ':'00000,00000,00000,00000,00000,00000,00000',
}
FONT = {k: v.split(',') for k, v in FONT.items()}
SHEAR = 0.22
W = 880

def dots(text, pitch):
    pts, x0 = [], 0.0
    for ch in text.upper():
        rows = FONT.get(ch, FONT[' '])
        for r, row in enumerate(rows):
            for c, v in enumerate(row):
                if v == '1':
                    pts.append((x0 + c * pitch + (6 - r) * pitch * SHEAR, r * pitch))
        x0 += 6 * pitch
    return pts, x0 - pitch + 6 * pitch * SHEAR

def text(s, pitch, r, fill, x, y, anchor='start'):
    pts, w = dots(s, pitch)
    if anchor == 'end':
        x -= w + 2 * r
    body = ''.join(f'<circle cx="{x+px+r:.1f}" cy="{y+py+r:.1f}" r="{r}"/>' for px, py in pts)
    return f'<g fill="{fill}">{body}</g>'

def fmt(n):
    return f'{n/1000:.1f}K'.replace('.0K', 'K') if n >= 10000 else str(n)

def render(d):
    out = []
    # headline numbers
    items = [('REPOS', d['repos']), ('STARS', d['stars']), ('COMMITS', d['commits']),
             ('FOLLOWERS', d['followers'])]
    colw = (W - 48) / len(items)
    for i, (label, val) in enumerate(items):
        x = 24 + i * colw
        out.append(text(fmt(val), 5.5, 2.1, '#ffffff', x, 28))
        out.append(text(label, 3.0, 1.1, '#bdbdbd', x, 28 + 6 * 5.5 + 22))
    # languages
    y0 = 148
    out.append(text('TOP LANGUAGES', 3.0, 1.1, '#bdbdbd', 24, y0))
    langs = d['langs']
    if not langs:
        out.append(text('NO PUBLIC CODE YET', 4.0, 1.5, '#6a6a6a', 24, y0 + 34))
        rows = 1
    else:
        N, x_bar, step = 44, 260, 11
        for i, (name, pct) in enumerate(langs):
            y = y0 + 32 + i * 30
            out.append(text(name[:12], 3.0, 1.2, '#ffffff', 24, y))
            filled = max(1, round(pct / 100 * N))
            bar = ''.join(
                f'<circle cx="{x_bar + k*step + 3:.1f}" cy="{y + 8:.1f}" r="3" fill="{"#fff" if k < filled else "#2c2c2c"}"/>'
                for k in range(N))
            out.append(bar)
            out.append(text(f'{pct:.0f}%', 3.0, 1.2, '#bdbdbd', W - 24, y, 'end'))
        rows = len(langs)
    H = y0 + 32 + max(rows, 1) * 30 + 4
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'<rect width="{W}" height="{H}" rx="10" fill="#000"/>' + ''.join(out) + '</svg>')

QUERY = '''
query($login:String!){ user(login:$login){
  followers{totalCount}
  contributionsCollection{totalCommitContributions}
  repositories(first:100, ownerAffiliations:OWNER, isFork:false, privacy:PUBLIC){
    totalCount
    nodes{ stargazerCount languages(first:10, orderBy:{field:SIZE, direction:DESC}){edges{size node{name}}} }
  }
}}'''

def fetch(login, token):
    req = urllib.request.Request(
        'https://api.github.com/graphql',
        data=json.dumps({'query': QUERY, 'variables': {'login': login}}).encode(),
        headers={'Authorization': f'bearer {token}', 'Content-Type': 'application/json',
                 'User-Agent': 'profile-stats'})
    with urllib.request.urlopen(req, timeout=30) as r:
        payload = json.load(r)
    if 'errors' in payload:
        raise SystemExit(f'GraphQL error: {payload["errors"]}')
    u = payload['data']['user']
    size = Counter()
    for repo in u['repositories']['nodes']:
        for e in repo['languages']['edges']:
            size[e['node']['name']] += e['size']
    total = sum(size.values())
    langs = [(n, s / total * 100) for n, s in size.most_common(5)] if total else []
    cc = u['contributionsCollection']
    return {'repos': u['repositories']['totalCount'],
            'stars': sum(n['stargazerCount'] for n in u['repositories']['nodes']),
            'commits': cc['totalCommitContributions'],
            'followers': u['followers']['totalCount'], 'langs': langs}

SAMPLE = {'repos': 12, 'stars': 34, 'commits': 12840, 'followers': 5,
          'langs': [('Python', 41), ('TypeScript', 27), ('C', 18), ('Java', 9), ('JavaScript', 5)]}

if __name__ == '__main__':
    if '--sample' in sys.argv:
        data = SAMPLE
    else:
        data = fetch(os.environ['GH_USER'], os.environ['GITHUB_TOKEN'])
    with open(OUT, 'w') as f:
        f.write(render(data))
    print('wrote', os.path.normpath(OUT), data)
