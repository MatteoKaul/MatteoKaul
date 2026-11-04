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
                     ▲    uses scripts/render.mjs + lib/ (all drawing, pure functions)
data/ ───────────────┘    written by scripts/fetch.mjs (GitHub, feeds) and live.mjs (Twitch)
editor/  ── same render.mjs in the browser: live preview, exports settings.txt
.github/workflows/profile.yml ── daily + on change: fetch, build, commit
.github/workflows/live.yml    ── optional 10-min Twitch check (schedule commented out)
tools/counter/server.mjs      ── optional self-hosted visitor counter
```

Details for each file: see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Status

Done (branch `claude/clever-feynman-cj0nr1`, not merged to `main` yet):

- Dot-matrix banner: configurable title, font, image, brightness, contrast,
  tint, letter shadow; animated backgrounds (GIF / animated WebP play,
  mp4/webm/mov are converted with ffmpeg to `data/media/`); title effects
  type / flicker / pulse, blinking cursor, LED ticker (CSS, reduced-motion aware)
- Icon catalog: 288 logos in 24 categories (`scripts/icons.json`) incl.
  support/funding (Patreon, Ko-fi, Sponsors, PayPal, ...) and business
  (company, shop, imprint, Gumroad, Shopify, Etsy)
- Modules: banner, text, icons, projects, releases, stats, activity, socials,
  people, now, timeline, feed, twitch, gists, code, guestbook, counter, divider
- Projects / releases / feed / gists hide themselves until there is data
- Theme: dark / light / auto (`<picture>`), palette auto from fg/bg +
  contrast, colour presets in the editor, dot shape/size, slant, radius,
  fonts `led` and `micro`
- One workflow (`Update profile`) for fetch + Twitch + build + commit;
  actions pinned to commit SHAs
- Graphical editor (`editor/`) with drag & drop layout, icon picker, row
  editors, presets, light/dark preview, background upload (GIF plays, video
  first frame)
- Prepared but hidden: `links`, `support`, `socials`, `people`, `companies`,
  `employer`, `business`, `activity`, `divider`, `now`, `timeline`, `feed`,
  `twitch`, `gists`, `code`, `guestbook`, `counter`
- Tested offline: all modules with sample data in Chromium (dark, light,
  auto, micro font, amber tint), video conversion, animations over time,
  fetch.mjs / live.mjs against mocked GitHub, YouTube, RSS and Twitch
  responses, counter server, editor (presets, rows, video upload)
- Docs: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (files, settings, modules, editor, security)

## Open

- [ ] First real workflow run on `main`. `fetch.mjs` (GitHub GraphQL incl.
      gists and guestbook, feeds, avatars, thumbnails) and `live.mjs` are only
      tested against mocked responses (the APIs are blocked in the dev
      container); check the Actions log after merging.
- [ ] Owner: merge the branch, enable *Settings → Actions → General →
      Workflow permissions → Read and write*, optionally enable GitHub Pages
      (branch `main`, root) to use the editor online.
- [ ] Owner, when wanted: Twitch secrets + live.yml schedule; guestbook
      issue; counter server; real GIFs/videos in `assets/src` (the GIFs from
      the chat arrived as still images, so animations were tested with
      generated clips).

## Ideas (not built)

- Spotify "now playing" / recently played (needs a Spotify refresh token secret)
- WakaTime coding time per language (needs a WakaTime API key)
- Steam: recently played games (public Steam Web API key)
- Contribution "snake" in dots (SVG animation of the activity grid)
- Per-module light/dark override, more fonts (e.g. a 7x9 bold heading font)

## Decisions

- **One renderer in JS** so the editor preview is exactly the real output.
  The banner is an SVG with the photo embedded (base64) and SVG filters for
  greyscale/brightness/shadow; no image libraries needed.
- **Generated files only in `assets/gen/`**; it is wiped on every build.
- **Releases/projects auto-hide** while empty (owner's request); the same for feed and gists.
- **Animated banners stay one SVG**: GIF / animated WebP are embedded as is
  (browsers animate them inside SVG images, filters included); videos are
  converted once to animated WebP because GitHub cannot embed repo videos.
- **Light mode via `<picture>`**, the official GitHub way; images identical
  in both modes (e.g. a kept banner) are not duplicated.
- **Twitch every 10 min is opt-in** (commented schedule), so the Actions tab
  stays quiet until the module is used.
- **Guestbook moderation by 👍** of the owner, default on.
- Settings stay a flat `key = value` text file so they can be edited on
  github.com directly; `node scripts/build.mjs --write-settings` rewrites it
  with all options and comments.
- Icon logos come from the Simple Icons npm package (CC0); Windows, C#, SQL,
  LinkedIn, email, website, company, shop and imprint are hand-drawn because
  Simple Icons lacks them.

## Owner preferences (from the conversation)

- Minimal, black/white, clean; dot font like the "CHAT" lettering of the owner's stream overlay
- Banner title switchable: MATREXX, MATTEO, MATTEO KAUL, LUMI, LUMIEREZ, LUMI CODE
- Shadow: subtle, following the letter shape (60 is good, 40 too weak)
- Wants to understand and check everything personally: comment the code, keep it small
- Studies Applied Computer Science; languages C, JavaScript, TypeScript, Java, Python
- Uses macOS, CachyOS, Windows, Ubuntu, Raspberry Pi OS, TrueNAS, Docker,
  WireGuard, Ghostty, Claude, Godot (Git and CMake known but hidden for now)
