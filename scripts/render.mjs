// Profile renderer: settings + GitHub data -> SVG images + README.md.
//
// Pure functions only (no file or network access), so the same code runs in
// Node (scripts/build.mjs, used by the workflow) and in the browser
// (editor/), which makes the editor preview identical to the real output.
//
//   lib/settings.mjs   option schema, settings.txt parsing/writing, validation
//   lib/draw.mjs       dot-matrix text and all SVG pieces
//   render.mjs         picks the data for each module and assembles README.md
//
// This file re-exports everything the build script and the editor need.
import {
  activityCard, bannerSvg, categoryRows, codeCard, counterSvg, dividerSvg, esc, feedCard, guestbookCard, heading,
  liveCard, nowCard, painter, personCard, placeholderCard, projectCard, releaseCard, statsCard, tile, timelineCard,
} from "./lib/draw.mjs";
import { MEDIA_FILE, isVideo, splitList, splitPairs, splitPeople, splitRows } from "./lib/settings.mjs";

const LINK = /^(https?:\/\/|mailto:)/i; // allowed link targets in the README

export * from "./lib/settings.mjs";
export { imageSize, renderLabel, renderTile } from "./lib/draw.mjs";

/** A visitor counter badge as SVG (tools/counter/server.mjs, editor preview). */
export const renderCounter = (theme, font, count, label) => counterSvg(painter(theme, font), theme, count, label);

// ------------------------------------------------------------- data use --

/** Numbers for the stats card, from data/github.json. */
function statsFrom(data) {
  const own = data.repos.filter((r) => !r.fork);
  const size = {};
  for (const r of own) for (const [lang, bytes] of Object.entries(r.languages || {})) size[lang] = (size[lang] || 0) + bytes;
  const total = Object.values(size).reduce((a, b) => a + b, 0);
  return {
    repos: own.length, stars: own.reduce((a, r) => a + r.stars, 0), commits: data.commits, followers: data.followers,
    languages: Object.entries(size).sort((a, b) => b[1] - a[1]).map(([name, s]) => [name, (100 * s) / total]),
  };
}

function pickRepos(data, opt) {
  const byName = Object.fromEntries(data.repos.map((r) => [r.name.toLowerCase(), r]));
  const named = (names) => names.map((x) => byName[x.toLowerCase()]).filter(Boolean);
  const list = opt.mode === "list" ? named(splitList(opt.repos))
    : opt.mode === "recent" ? data.repos.filter((r) => !r.fork).sort((a, b) => b.pushedAt.localeCompare(a.pushedAt))
    : named(data.pinned);
  return list.slice(0, opt.limit);
}

function pickReleases(data, opt) {
  const all = data.repos.filter((r) => r.release)
    .map((r) => ({ repo: r.name, ...r.release }))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (opt.mode === "latest") return all.slice(0, 1);
  if (opt.mode === "list") {
    const by = Object.fromEntries(all.map((r) => [r.repo.toLowerCase(), r]));
    return splitList(opt.repos).map((x) => by[x.toLowerCase()]).filter(Boolean);
  }
  return all.slice(0, opt.limit);
}

/** Icons of an icons module grouped into categories: [[category, [keys]]], empty ones dropped. */
export function iconGroups(opt, catalog) {
  const items = splitList(opt.items).map((k) => k.toLowerCase());
  const unknown = items.filter((k) => !catalog.icons[k]);
  if (unknown.length) throw new Error(`icons: unknown icon(s) ${unknown.join(", ")}`);
  const move = Object.fromEntries(splitPairs(opt.move));
  // category keys become file names (cat-<key>.svg), custom ones are allowed
  const badCat = [...splitList(opt.order), ...Object.values(move)].filter((c) => !/^[\w-]+$/.test(c));
  if (badCat.length) throw new Error(`icons: invalid category name(s) ${badCat.join(", ")}`);
  const order = [...new Set([...splitList(opt.order), ...Object.keys(catalog.categories), ...Object.values(move)])];
  return order.map((cat) => [cat, items.filter((k) => (move[k] || catalog.icons[k].category) === cat)])
    .filter(([, keys]) => keys.length);
}

function pickFeed(data, opt) {
  // "*" only exists in SAMPLE_DATA: sample entries for any source
  const items = splitList(opt.sources).flatMap((src) => data.feeds?.[src] ?? data.feeds?.["*"] ?? []);
  const seen = new Set();
  return items.filter((i) => !seen.has(i.url) && seen.add(i.url))
    .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, opt.limit);
}

/**
 * Repo paths of all images the visible modules need (banner backgrounds,
 * logos, avatars, thumbnails). build.mjs and the editor load these into
 * assets.images; files that do not exist yet are simply left out.
 */
export function neededImages(cfg, data) {
  const paths = new Set();
  for (const m of cfg.layout) {
    const o = m.opt;
    if (m.type === "banner" && o.image !== "none") paths.add(mediaPath(o.image));
    if (m.type === "people") for (const e of splitPeople(o.items)) {
      if (e.image.startsWith("gh:")) paths.add(`data/avatars/${e.image.slice(3)}`);
      if (e.image.startsWith("file:")) paths.add(`assets/src/${e.image.slice(5)}`);
    }
    if (m.type === "feed" && o.thumbs === "on") for (const i of pickFeed(data, o)) if (THUMB.test(i.thumb)) paths.add(i.thumb);
  }
  return [...paths].filter((path) => /^(assets\/src|data\/(avatars|thumbs|media))\/[\w-][\w.-]*$/.test(path));
}

/** Videos are converted to an animated webp in data/media/ (by build.mjs). */
export const mediaPath = (file) => (isVideo(file) ? `data/media/${file}.webp` : `assets/src/${file}`);
const THUMB = /^data\/thumbs\/[0-9a-f]{12}$/;

/** Font names the config uses (theme font, banner fonts). */
export const neededFonts = (cfg) => [...new Set([cfg.theme.font,
  ...cfg.layout.filter((m) => m.type === "banner" && m.opt.font !== "theme").map((m) => m.opt.font)])];

// --------------------------------------------------------------- render --

/**
 * Render everything.
 *   cfg     resolve(settings)
 *   data    data/github.json + feeds + live (or SAMPLE_DATA)
 *   assets  {fonts: {name: font}, catalog, images: {repo path: {mime, base64, width, height}}}
 * Returns {files: {path: svg text}, readme: markdown}; all paths are under assets/gen/.
 *
 * theme.mode = auto renders every image twice (light ones in assets/gen/light/)
 * and the README picks one per viewer with <picture>.
 */
export function render(cfg, data, assets) {
  const mode = cfg.theme.mode;
  const main = renderPass(cfg, data, assets, { theme: mode === "light" ? cfg.light : cfg.theme, light: mode === "light", prefix: "" });
  let { readme } = main;
  const files = { ...main.files };
  if (mode === "auto") {
    const alt = renderPass(cfg, data, assets, { theme: cfg.light, light: true, prefix: "light/" });
    readme = readme.replace(/<img src="assets\/gen\/([^"]+)"([^>]*)\/>/g, (tag, path, rest) => {
      const lightPath = `assets/gen/light/${path}`;
      // images that look the same in both modes (e.g. a kept banner) are not duplicated
      if (!alt.files[lightPath] || alt.files[lightPath] === files[`assets/gen/${path}`]) return tag;
      files[lightPath] = alt.files[lightPath];
      return `<picture><source media="(prefers-color-scheme: light)" srcset="${lightPath}" />${tag}</picture>`;
    });
  }
  return { files, readme };
}

function renderPass(cfg, data, assets, { theme, light, prefix }) {
  const { catalog, images = {} } = assets;
  const fontOf = (name) => assets.fonts?.[name] ?? fail(`font "${name}": fonts/${name}.json not found`);
  const p = painter(theme, fontOf(cfg.theme.font));
  const files = {}, blocks = [];
  const put = (path, svg) => { files[`assets/gen/${prefix}${path}`] = svg; return `assets/gen/${path}`; };
  const img = (src, alt, attrs) => `<img src="${src}" alt="${esc(alt)}" ${attrs} />`;
  const link = (url, html) => (url ? `<a href="${esc(url)}">${html}</a>` : html);
  // Wrapped in <p> so GitHub adds the usual paragraph spacing below images.
  const para = (html) => `<p>${html}</p>`;
  const headingBlock = (m, title, small = false, key = "heading") =>
    title ? para(img(put(`${m.id}/${key}.svg`, heading(p, theme, title, small)), title, 'width="100%"')) : "";
  const join = (...parts) => parts.filter(Boolean).join("\n\n");
  const cardRow = (cards) => `<p>\n${cards.join("\n")}\n</p>`;
  const checkLink = (m, url, what) => {
    if (url && !LINK.test(url)) fail(`${m.id}: ${what} must start with https://, http:// or mailto:`);
  };
  const fullCard = (m, svg, alt, file = "card") => para(img(put(`${m.id}/${file}.svg`, svg), alt, 'width="100%"'));

  for (const m of cfg.layout) {
    const o = m.opt;
    switch (m.type) {
      case "banner": {
        const image = o.image !== "none" ? images[mediaPath(o.image)] : null;
        if (o.image !== "none" && !image) {
          fail(isVideo(o.image) ? `banner.image: ${o.image} is not converted yet (run node scripts/build.mjs with ffmpeg installed)`
            : `banner.image: assets/src/${o.image} not found`);
        }
        // Light mode keeps the dark banner unless banner.light = adapt.
        const adapt = light && o.light === "adapt";
        const t = adapt ? theme : cfg.theme;
        const svg = bannerSvg(painter(t, fontOf(o.font === "theme" ? cfg.theme.font : o.font)), t, o, image, adapt);
        blocks.push(`<p align="center">\n  ${img(put(`${m.id}/banner.svg`, svg), o.title || "Banner", 'width="100%"')}\n</p>`);
        break;
      }
      case "text":
        blocks.push(join(headingBlock(m, o.title), o.text.split("\n").join("  \n")));
        break;
      case "icons": {
        const groups = iconGroups(o, catalog)
          .filter(([, keys]) => o.min_toggle !== "on" || keys.length >= o.min_icons);
        const titles = Object.fromEntries(splitPairs(o.titles));
        const titleOf = (cat) => titles[cat] || catalog.categories[cat] || cat.toUpperCase();
        if (o.columns > 1) {
          const rows = categoryRows(p, theme, groups.map(([cat, keys]) => [titleOf(cat), keys.map((k) => catalog.icons[k])]), o);
          blocks.push(join(o.style === "compact" ? headingBlock(m, o.title) : "",
            ...rows.map((r, i) => para(img(put(`${m.id}/row-${i + 1}.svg`, r.svg), r.alt, 'width="100%"')))));
          break;
        }
        // Tiles are shared between modules, one file per icon and style; the
        // display height scales with the style's own height (badges are lower).
        const tileImg = (k) => {
          const t = tile(p, theme, catalog.icons[k], o.tile);
          return img(put(`tiles/${o.tile}/${k}.svg`, t.svg), catalog.icons[k].label, `height="${Math.round((o.size * t.h) / 132)}"`);
        };
        const row = (keys) => "<p>\n" + keys.map((k) => `  ${tileImg(k)}`).join("\n") + "\n</p>";
        const parts = o.style === "compact" ? [headingBlock(m, o.title)] : [];
        for (const [cat, keys] of groups) parts.push(headingBlock(m, titleOf(cat), o.style === "compact", `cat-${cat}`), row(keys));
        blocks.push(join(...parts));
        break;
      }
      case "projects": {
        const repos = pickRepos(data, o);
        if (!repos.length && o.empty === "hide") break; // appears by itself once there is a repo to show
        const cards = repos.length
          ? repos.map((r) => link(r.url, img(put(`${m.id}/${r.name}.svg`, projectCard(p, theme, r)), r.name, 'width="49%"')))
          : [img(put(`${m.id}/none.svg`, placeholderCard(p, theme, "NO PUBLIC PROJECTS YET", 430, 132)), "No public projects yet", 'width="49%"')];
        blocks.push(join(headingBlock(m, o.title), cardRow(cards)));
        break;
      }
      case "releases": {
        const rels = pickReleases(data, o);
        if (!rels.length && o.empty === "hide") break; // appears by itself with the first public release
        const cards = rels.length
          ? rels.map((r) => link(r.url, img(put(`${m.id}/${r.repo}.svg`, releaseCard(p, theme, r)), `${r.repo} ${r.tag}`, 'width="49%"')))
          : [img(put(`${m.id}/none.svg`, placeholderCard(p, theme, "NO RELEASES YET")), "No releases yet", 'width="49%"')];
        blocks.push(join(headingBlock(m, o.title), cardRow(cards)));
        break;
      }
      case "stats":
        blocks.push(join(headingBlock(m, o.title),
          para(img(put(`${m.id}/stats.svg`, statsCard(p, theme, statsFrom(data), o.languages)), "GitHub stats", 'width="100%"'))));
        break;
      case "activity":
        blocks.push(join(headingBlock(m, o.title),
          para(img(put(`${m.id}/activity.svg`, activityCard(p, theme, data.calendar, o.weeks)), "Contribution activity", 'width="100%"'))));
        break;
      case "socials": {
        // icon=url or icon=url|LABEL; a custom label gets its own tile file
        const links = splitPairs(o.items).map(([k, v]) => {
          const [url, label] = v.split("|").map((x) => x.trim());
          return { k, url, label };
        });
        const bad = links.filter((l) => !catalog.icons[l.k]).map((l) => l.k);
        if (bad.length) fail(`${m.id}.items: unknown icon(s) ${bad.join(", ")}`);
        const badUrl = links.filter((l) => !LINK.test(l.url)).map((l) => l.k);
        if (badUrl.length) fail(`${m.id}.items: links must start with https://, http:// or mailto: (${badUrl.join(", ")})`);
        if (!links.length) break;
        const tiles = links.map(({ k, url, label }, i) => {
          const icon = label ? { ...catalog.icons[k], label: label.toUpperCase() } : catalog.icons[k];
          const t = tile(p, theme, icon, o.tile);
          const file = label ? `${m.id}/link-${i + 1}.svg` : `tiles/${o.tile}/${k}.svg`;
          return "  " + link(url, img(put(file, t.svg), icon.label, `height="${Math.round((o.size * t.h) / 132)}"`));
        });
        blocks.push(join(headingBlock(m, o.title), cardRow(tiles)));
        break;
      }
      case "people": {
        const entries = splitPeople(o.items);
        if (!entries.length) break;
        const cards = entries.map((e, i) => {
          checkLink(m, e.url, `"${e.name}" link`);
          let pic = {};
          if (e.image.startsWith("gh:")) pic = { avatar: images[`data/avatars/${e.image.slice(3)}`] }; // initials until fetched
          else if (e.image.startsWith("file:")) {
            const file = e.image.slice(5);
            if (!MEDIA_FILE.test(file) || isVideo(file)) fail(`${m.id}.items: "${e.name}" image file:${file} must be a png/jpg/webp/gif in assets/src`);
            pic = { logo: images[`assets/src/${file}`] ?? fail(`${m.id}.items: assets/src/${file} not found`) };
          } else if (e.image) pic = { icon: catalog.icons[e.image] ?? fail(`${m.id}.items: "${e.name}" image "${e.image}" is neither gh:<login>, file:<name> nor an icon`) };
          const svg = personCard(p, theme, e, pic);
          return link(e.url, img(put(`${m.id}/${i + 1}.svg`, svg), [e.name, e.role].filter(Boolean).join(", "), 'width="49%"'));
        });
        blocks.push(join(headingBlock(m, o.title), cardRow(cards)));
        break;
      }
      case "now": {
        const rows = splitRows(o.items, 2);
        if (rows.length) blocks.push(join(headingBlock(m, o.title), fullCard(m, nowCard(p, theme, rows, o.cursor === "on"), rows.map((r) => r.join(": ")).join("; "))));
        break;
      }
      case "timeline": {
        const rows = splitRows(o.items, 3);
        if (rows.length) blocks.push(join(headingBlock(m, o.title), fullCard(m, timelineCard(p, theme, rows), rows.map((r) => r.filter(Boolean).join(" ")).join("; "))));
        break;
      }
      case "feed": {
        const items = pickFeed(data, o);
        if (!items.length && o.empty === "hide") break; // appears with the first fetched entry
        const cards = items.length
          ? items.map((it, i) => {
            if (!LINK.test(it.url)) return "";
            const thumb = o.thumbs === "on" && THUMB.test(it.thumb) ? images[it.thumb] : null;
            return link(it.url, img(put(`${m.id}/${i + 1}.svg`, feedCard(p, theme, it, thumb)), it.title, 'width="49%"'));
          })
          : [img(put(`${m.id}/none.svg`, placeholderCard(p, theme, "NOTHING POSTED YET")), "Nothing posted yet", 'width="49%"')];
        blocks.push(join(headingBlock(m, o.title), cardRow(cards.filter(Boolean))));
        break;
      }
      case "twitch": {
        const live = data.live?.[o.channel.toLowerCase()] ?? data.live?.["*"];
        if (!live?.live && o.offline === "hide") break; // only visible while live
        blocks.push(join(headingBlock(m, o.title),
          para(link(`https://www.twitch.tv/${o.channel}`, img(put(`${m.id}/live.svg`, liveCard(p, theme, live, o.channel.toUpperCase())),
            live?.live ? `Live on Twitch: ${live.title || o.channel}` : `Twitch: ${o.channel} (offline)`, 'width="100%"')))));
        break;
      }
      case "gists": {
        const gists = (data.gists?.[o.mode] || []).slice(0, o.limit);
        if (!gists.length && o.empty === "hide") break;
        const cards = gists.length
          ? gists.map((g, i) => link(g.url, img(put(`${m.id}/${i + 1}.svg`, projectCard(p, theme, g)), g.name, 'width="49%"')))
          : [img(put(`${m.id}/none.svg`, placeholderCard(p, theme, "NO PUBLIC GISTS YET")), "No public gists yet", 'width="49%"')];
        blocks.push(join(headingBlock(m, o.title), cardRow(cards)));
        break;
      }
      case "code": {
        if (!o.code.trim()) break;
        checkLink(m, o.link, "code.link");
        blocks.push(join(headingBlock(m, o.title), para(link(o.link, img(put(`${m.id}/code.svg`, codeCard(p, theme, o.file, o.code)), `Code: ${o.file}`, 'width="100%"')))));
        break;
      }
      case "guestbook": {
        if (!o.issue) break; // not set up yet
        const g = data.guestbook, ours = g && (g.issue === o.issue || g.issue === "*");
        const entries = (ours ? g.entries : []).filter((e) => o.approval === "all" || e.approved).slice(0, o.limit);
        const url = data.repo ? `https://github.com/${data.repo}/issues/${o.issue}` : "";
        blocks.push(join(headingBlock(m, o.title),
          para(link(url, img(put(`${m.id}/guestbook.svg`, guestbookCard(p, theme, entries)), "Guestbook: click to sign", 'width="100%"')))));
        break;
      }
      case "counter":
        if (!o.url) break;
        if (!/^https:\/\//i.test(o.url)) fail(`${m.id}.url must start with https://`);
        blocks.push(join(headingBlock(m, o.title), para(img(esc(o.url), "Visitor counter", `height="${o.height}"`))));
        break;
      case "divider":
        blocks.push(para(img(put(`${m.id}/divider.svg`, dividerSvg(theme)), "", 'width="100%"')));
        break;
    }
  }

  const readme = "<!-- Generated by scripts/build.mjs from settings.txt. Edit settings.txt (or use editor/), not this file. -->\n\n" +
    blocks.filter(Boolean).join("\n\n") + "\n";
  return { files, readme };
}

function fail(message) { throw new Error(message); }

/** Fake GitHub data for local previews (python-free, deterministic). */
export const SAMPLE_DATA = (() => {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const weeks = Array.from({ length: 53 }, () => Array.from({ length: 7 }, () => {
    const v = rand();
    return v < 0.45 ? 0 : v < 0.7 ? 1 : v < 0.85 ? 2 : v < 0.95 ? 3 : 4;
  }));
  const repo = (name, description, language, stars, pushedAt, release) => ({
    name, description, language, stars, pushedAt, fork: false, url: "https://github.com",
    languages: { [language]: 1000 * (stars + 3) }, release,
  });
  const gist = (name, description, language, stars) => ({ name, description, language, stars, url: "https://gist.github.com" });
  const video = (title, date) => ({ title, date, url: `https://www.youtube.com/#${date}`, source: "YOUTUBE", thumb: "" });
  return {
    login: "sample", repo: "sample/sample", followers: 5, commits: 1280,
    // "*" = used for any feed source / Twitch channel / guestbook issue in the preview
    feeds: { "*": [video("Building a dot-matrix GitHub profile from scratch", "2026-10-30"),
      video("Homelab tour 2026: TrueNAS, Docker and WireGuard", "2026-10-12"),
      video("Godot jam devlog #3 - lights, sound and a lot of bugs", "2026-09-28"),
      video("CachyOS after one year", "2026-09-02")] },
    live: { "*": { live: true, title: "Coding a dot-matrix font renderer", game: "Software and Game Development" } },
    gists: {
      pinned: [gist("led-font.js", "Tiny 5x7 LED font as JSON glyph grids.", "JavaScript", 4),
        gist("wg-setup.sh", "WireGuard on TrueNAS in five commands.", "Shell", 2)],
      recent: [gist("notes.md", "Uni notes, algorithms and data structures.", "Markdown", 0)],
    },
    guestbook: { issue: "*", entries: [
      { login: "octocat", text: "Love the LED style, very clean!", date: "2026-10-29", approved: true },
      { login: "lumi-dev", text: "Hello from the homelab channel 👋", date: "2026-10-21", approved: true },
      { login: "spam-bot", text: "not approved, only shown with approval = all", date: "2026-10-20", approved: false },
    ] },
    pinned: ["homelab-dashboard", "lumi", "dotfiles"],
    calendar: { total: 742, weeks },
    repos: [
      repo("homelab-dashboard", "Self-hosted dashboard for my TrueNAS and Docker services.", "TypeScript", 34, "2026-10-30",
        { tag: "v2.3.0", url: "https://github.com", date: "2026-10-28" }),
      repo("lumi", "Small scripting language written in C, compiled to bytecode.", "C", 12, "2026-10-20",
        { tag: "v0.9.1-beta", url: "https://github.com", date: "2026-10-12" }),
      repo("dotfiles", "CachyOS and macOS configuration, managed with a tiny Python script.", "Python", 3, "2026-09-02",
        { tag: "2026.09", url: "https://github.com", date: "2026-09-02" }),
      repo("uni-algorithms", "Exercises from the Applied Computer Science course.", "Java", 1, "2026-06-11", null),
    ],
  };
})();
