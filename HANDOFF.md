# Handoff

Working notes for whoever continues this repo (human or AI). Keep this file
current: update "Status" and "Open" with every meaningful commit.

## Goal

A GitHub profile README for **MatteoKaul** (display name *Matrexx*) in a
minimal black-and-white, dot-matrix (LED) style, fully generated from one
settings file, with a graphical editor.

Conversation language with the owner is German; everything in the repo is English.

## How it works (short)

```
settings.txt ──► scripts/build.mjs ──► README.md + assets/gen/*.svg
                     ▲    uses scripts/render.mjs (all drawing, pure functions)
data/github.json ────┘    written by scripts/fetch.mjs (GitHub GraphQL API)
editor/  ── same render.mjs in the browser: live preview, exports settings.txt
.github/workflows/profile.yml ── daily + on change: fetch, build, commit
```

Details for each file: see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Status

Done (branch `claude/clever-feynman-cj0nr1`, not merged to `main` yet):

- Dot-matrix banner with configurable title, image, brightness, letter shadow
- Icon catalog: 255 logos in 22 categories (`scripts/icons.json`), categories
  appear automatically when at least one icon of them is enabled; category
  overrides, order and headings configurable
- Modules: banner, text, icons, projects, releases, stats, activity, socials, divider
- Projects / releases hide themselves until there is data (`empty = hide`)
- Theme: colours, dot shape, dot size, slant, corner radius, font file
- Python generator replaced by a single JavaScript renderer (Node + browser)
- One workflow (`Update profile`) for fetch + build + commit
- Graphical editor (`editor/`) with drag & drop layout, icon picker, live preview

## Open

- [ ] Verify the editor and all modules in a real browser (Chromium screenshots)
- [ ] Editor visual design in the profile style
- [ ] Documentation pass (README for the repo itself lives in docs/, the root README is the profile)
- [ ] Code review / optimisation
- [ ] Security audit (editor: XSS via settings values; workflow permissions)
- [ ] First real workflow run on `main` (never run yet: API access is blocked
      from the dev container, so fetch.mjs is untested against the live API)
- [ ] Owner to do: merge the branch, enable workflow write permissions,
      optionally enable GitHub Pages for the editor

## Decisions

- **One renderer in JS** so the editor preview is exactly the real output.
  The banner is an SVG with the photo embedded (base64) and SVG filters for
  greyscale/brightness/shadow; no image libraries needed.
- **Generated files only in `assets/gen/`**; it is wiped on every build.
- **Releases/projects auto-hide** while empty (owner's request).
- Settings stay a flat `key = value` text file so they can be edited on
  github.com directly; `node scripts/build.mjs --write-settings` rewrites it
  with all options and comments.
- Icon logos come from the Simple Icons npm package (CC0); Windows, C#, SQL,
  LinkedIn, email and website are hand-drawn because Simple Icons lacks them.

## Owner preferences (from the conversation)

- Minimal, black/white, clean; dot font like the "CHAT" lettering of his stream overlay
- Banner title switchable: MATREXX, MATTEO, MATTEO KAUL, LUMI, LUMIEREZ, LUMI CODE
- Shadow: subtle, following the letter shape (60 is good, 40 too weak)
- Wants to understand and check everything himself: comment the code, keep it small
- Studies Applied Computer Science; languages C, JavaScript, TypeScript, Java, Python
- Uses macOS, CachyOS, Windows, Ubuntu, Raspberry Pi OS, TrueNAS, Docker,
  WireGuard, Ghostty, Claude, Godot (Git and CMake known but hidden for now)
