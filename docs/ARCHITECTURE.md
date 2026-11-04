# How this profile repo works

The root `README.md` is the GitHub profile page. It is **generated**: never
edit it by hand, edit `settings.txt` (directly or with the editor) instead.

```
settings.txt ─┐
fonts/*.json ─┤
icons.json ───┼─► scripts/build.mjs ──► README.md
assets/src/ ──┤       │                  assets/gen/**.svg
data/*.json ──┘       └─ scripts/render.mjs ─ lib/settings.mjs, lib/draw.mjs
     ▲
scripts/fetch.mjs ◄── GitHub GraphQL API (stats, repos, releases, activity)

editor/ ── loads the same files + render.mjs in the browser, live preview,
           exports a new settings.txt
```

## Files

| Path | What it is |
| --- | --- |
| `settings.txt` | Everything you can change: layout, theme, module options. Commented. |
| `README.md` | Generated profile page. |
| `scripts/render.mjs` | Renderer entry: picks the data for each module and assembles README.md. Pure functions, runs in Node and the browser. |
| `scripts/lib/settings.mjs` | Option schema (`THEME_FIELDS`, `TYPES`), settings.txt parser/writer, validation. |
| `scripts/lib/draw.mjs` | Dot-matrix text and every SVG piece (banner, tiles, cards, stats, ...). |
| `scripts/build.mjs` | Node entry: reads the files, calls `render`, writes `README.md` and `assets/gen/`. |
| `scripts/fetch.mjs` | Node entry: reads public GitHub data into `data/github.json` and GitHub avatars for people cards into `data/avatars/`. |
| `scripts/icons.json` | Icon catalog: `categories` (key → heading) and `icons` (key → label, category, SVG markup of the logo in a 24×24 box, optional `scale`). |
| `fonts/led.json` | Dot font: `small` 5×7 and `large` 7×9 glyph grids (`"1"` = dot). |
| `assets/src/` | Source images (banner background). |
| `assets/gen/` | Generated SVGs. Deleted and rebuilt on every build. |
| `data/` | Last fetched GitHub data and avatars (created by the workflow). |
| `editor/` | Graphical editor (static HTML/CSS/JS, no build step). |
| `.github/workflows/profile.yml` | Daily / on-change job: fetch, build, commit. |
| `HANDOFF.md` | Current status and open points. |

## Running it locally

Needs Node 18 or newer, nothing to install.

```sh
node scripts/build.mjs                    # README + images from data/github.json
node scripts/build.mjs --sample           # same with fake data (try layouts)
node scripts/build.mjs --write-settings   # also rewrite settings.txt with every
                                          # option and its explanation
GITHUB_TOKEN=<token> GH_USER=MatteoKaul node scripts/fetch.mjs   # real data
```

`--sample` overwrites README.md and assets/gen with fake numbers; run a plain
build (or `git checkout README.md assets/gen`) before committing.

## The editor

Open it through a web server, because it reads the repo files next to it:

- **GitHub Pages:** repo Settings → Pages → Source "Deploy from a branch",
  branch `main`, folder `/ (root)`. Then open
  `https://matteokaul.github.io/<repo name>/editor/`.
- **Locally:** in the repo folder run `python3 -m http.server 8000` (or
  `npx serve`) and open <http://localhost:8000/editor/>.

Left: modules (drag to reorder, checkbox to show/hide, "+ Add" for a new one)
and the theme. Middle: options of the selected item. Right: live preview,
rendered with the same code as the real build.

The editor never writes to the repo. Use "Download settings.txt" or "Copy
settings.txt", then commit the file ("Edit on GitHub" opens it in GitHub's
web editor: select all, paste, commit). The workflow rebuilds the profile.

"Data: Sample data" previews modules that need GitHub data (projects,
releases, activity) before you have any.

## settings.txt

Flat `key = value` lines. Lines starting with `#` are comments (only whole
lines, so values like `#ffffff` work), `\n` is a line break inside a text
value. Lists are comma separated, pairs are `key=value` items in a list.

```
# modules from top to bottom
layout = banner, about, icons, tools, stats
# theme.<option>
theme.shape = circle
# <module id>.<option>
banner.title = MATREXX
# a second icons module named "tools"
tools.type = icons
```

A module id that equals a type name (`banner`, `icons`, ...) or `about`
(a text module) needs no `.type` line. Removing an id from `layout` hides the
module but keeps its options.

All options with explanations are written into `settings.txt` itself; the
source of truth is `THEME_FIELDS` and `TYPES` in `scripts/lib/settings.mjs`.

## Modules

| Type | Shows | Data |
| --- | --- | --- |
| `banner` | Title in the large dot font on a greyscale photo or a colour | – |
| `text` | Heading + Markdown text | – |
| `icons` | Logo tiles, grouped by category; only categories with an enabled icon appear | – |
| `projects` | Cards for pinned / recently pushed / listed repos | GitHub |
| `releases` | Cards linking to the latest release(s) | GitHub |
| `stats` | Repos, stars, commits (last year), followers, top languages | GitHub |
| `activity` | Contribution calendar as a dot grid | GitHub |
| `socials` | Link tiles (any icon + URL, optional own label) | – |
| `people` | Cards for people, companies or an employer: image, name, role, link | GitHub avatars |
| `divider` | Dotted line | – |

Prepared but hidden (switch them on in `layout` or the editor): `activity`,
`socials` (contact), `links` (websites, channels, music, games), `people`
(working with), `companies`, `employer`, `divider`.

### Links (`socials` type)

`items = icon=url|LABEL, ...`. The label is optional and replaces the icon
name on the tile, so the same platform can appear several times:

```
links.items = website=https://example.com|PORTFOLIO, youtube=https://www.youtube.com/@a|MAIN, youtube=https://www.youtube.com/@b|CLIPS, spotify=https://open.spotify.com/artist/...
```

Links must start with `https://`, `http://` or `mailto:`. All platform icons
are in the `social` category of `scripts/icons.json` (YouTube, YouTube Music,
Spotify, Apple Music, Bandcamp, SoundCloud, Twitch, Kick, Steam, itch.io,
Epic, GOG, PlayStation, blogs, Linktree, website, email, ...).

### People (`people` type)

`items = Name | Role | URL | Image, ...` (no commas inside an entry). Image is
`gh:<login>` for a GitHub avatar (downloaded by `fetch.mjs` on the next
workflow run, shown greyscale), an icon key (e.g. a company logo like
`github` or `website`), or empty for the initials. The same type is used for
the `people`, `companies` and `employer` modules; add more with
`<id>.type = people`.

`projects` and `releases` disappear while they have nothing to show
(`empty = hide`) and appear on their own with the next daily run once you have
a public repo / release.

### Icons and categories

`icons.items` lists the shown icons. Each icon belongs to the category set in
`icons.json`; `icons.move` overrides that per icon (`wireguard=services`),
`icons.order` puts categories first, `icons.titles` renames headings. The
order of icons inside a category follows `icons.items`. In the editor all of
this is drag and drop. Only categories with at least one icon are shown.

Layout options:

- `icons.columns = 1` one category per row with large headings and tiles;
  `2`-`4` puts that many categories side by side with small headings and
  tiles (`icons.grid_size`). Each row of categories is drawn as one image, so
  tiles always stay under their own heading.
- `icons.min_toggle = on` hides categories with fewer than `icons.min_icons` icons.
- `icons.wide_toggle = on` (with columns > 1) gives categories with more than
  `icons.wide_above` icons a full row of their own.
- `icons.style = compact` adds one heading (`icons.title`) above all categories.
- `icons.tile` (also `socials.tile`): `below` = logo with the name underneath
  (default), `none` = logo only, `badge` = logo left, name right (like
  shields.io badges).

To add an icon: add an entry to `scripts/icons.json` with a 24×24 SVG
(`<path d="..."/>`, filled with the current colour). Logos from
[Simple Icons](https://simpleicons.org) (CC0) fit directly.

## Theme and fonts

`theme.*` sets colours, dot shape (`circle`, `square`, `rounded`), dot size,
slant, corner radius and the font. Everything is drawn from these values, so a
new look is a few settings, not code.

A font is a JSON file in `fonts/` with a `small` (used for all text) and an
optional `large` grid set (banner). Copy `led.json`, change the grids and set
`theme.font = <file name without .json>`.

## Workflow

`.github/workflows/profile.yml` runs daily at 03:17 UTC, on manual start and
when settings, scripts, fonts or source images change on `main`. It fetches
data, builds, and commits `README.md`, `assets/gen/` and `data/` if they
changed. It needs *Settings → Actions → General → Workflow permissions →
Read and write permissions*.

## Security notes

- The workflow token only has `contents: write` on this repo and only reads
  public data. No other secrets are used.
- All option values are validated in `resolve()` (lib/settings.mjs): colours must be
  hex, numbers are clamped, select options are checked, image names cannot
  contain paths, module ids are plain names. This keeps settings from
  injecting markup into SVGs or writing/reading files outside the repo folders.
- Text from GitHub (repo descriptions) and from settings is XML-escaped before
  it goes into SVG or HTML attributes. GitHub additionally sanitises README HTML.
- The editor has a Content-Security-Policy (only its own files) and shows the
  preview in a sandboxed iframe without script permission, so an imported
  settings file cannot run code. It stores nothing and sends nothing anywhere.
- Third-party actions are referenced by major version (`@v4`). For stricter
  supply-chain safety, pin them to commit SHAs.
