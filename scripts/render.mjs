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
  activityCard, bannerSvg, categoryRows, dividerSvg, esc, heading, painter, personCard, placeholderCard,
  projectCard, releaseCard, statsCard, tile,
} from "./lib/draw.mjs";
import { splitList, splitPairs, splitPeople } from "./lib/settings.mjs";

const LINK = /^(https?:\/\/|mailto:)/i; // allowed link targets in the README

export * from "./lib/settings.mjs";
export { imageSize, renderLabel, renderTile } from "./lib/draw.mjs";

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

// --------------------------------------------------------------- render --

/**
 * Render everything.
 *   cfg     resolve(settings)
 *   data    data/github.json (or SAMPLE_DATA)
 *   assets  {font, catalog, images: {filename: {mime, base64, width, height}},
 *            avatars: {login: {mime, base64}}}
 * Returns {files: {path: svg text}, readme: markdown}; all paths are under assets/gen/.
 */
export function render(cfg, data, assets) {
  const { theme } = cfg, { catalog } = assets;
  const p = painter(theme, assets.font);
  const files = {}, blocks = [];
  const put = (path, svg) => { files[`assets/gen/${path}`] = svg; return `assets/gen/${path}`; };
  const img = (src, alt, attrs) => `<img src="${src}" alt="${esc(alt)}" ${attrs} />`;
  // Wrapped in <p> so GitHub adds the usual paragraph spacing below images.
  const para = (html) => `<p>${html}</p>`;
  const headingBlock = (m, title, small = false, key = "heading") =>
    title ? para(img(put(`${m.id}/${key}.svg`, heading(p, theme, title, small)), title, 'width="100%"')) : "";
  const join = (...parts) => parts.filter(Boolean).join("\n\n");

  for (const m of cfg.layout) {
    const o = m.opt;
    switch (m.type) {
      case "banner": {
        const image = o.image && o.image !== "none" ? assets.images[o.image] : null;
        if (o.image && o.image !== "none" && !image) throw new Error(`banner.image: assets/src/${o.image} not found`);
        blocks.push(`<p align="center">\n  ${img(put(`${m.id}/banner.svg`, bannerSvg(p, theme, o, image)), o.title || "Banner", 'width="100%"')}\n</p>`);
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
          ? repos.map((r) => `<a href="${esc(r.url)}">${img(put(`${m.id}/${r.name}.svg`, projectCard(p, theme, r)), r.name, 'width="49%"')}</a>`)
          : [img(put(`${m.id}/none.svg`, placeholderCard(p, theme, "NO PUBLIC PROJECTS YET", 430, 132)), "No public projects yet", 'width="49%"')];
        blocks.push(join(headingBlock(m, o.title), `<p>\n${cards.join("\n")}\n</p>`));
        break;
      }
      case "releases": {
        const rels = pickReleases(data, o);
        if (!rels.length && o.empty === "hide") break; // appears by itself with the first public release
        const cards = rels.length
          ? rels.map((r) => `<a href="${esc(r.url)}">${img(put(`${m.id}/${r.repo}.svg`, releaseCard(p, theme, r)), `${r.repo} ${r.tag}`, 'width="49%"')}</a>`)
          : [img(put(`${m.id}/none.svg`, placeholderCard(p, theme, "NO RELEASES YET")), "No releases yet", 'width="49%"')];
        blocks.push(join(headingBlock(m, o.title), `<p>\n${cards.join("\n")}\n</p>`));
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
        if (bad.length) throw new Error(`${m.id}.items: unknown icon(s) ${bad.join(", ")}`);
        const badUrl = links.filter((l) => !LINK.test(l.url)).map((l) => l.k);
        if (badUrl.length) throw new Error(`${m.id}.items: links must start with https://, http:// or mailto: (${badUrl.join(", ")})`);
        if (!links.length) break;
        const tiles = links.map(({ k, url, label }, i) => {
          const icon = label ? { ...catalog.icons[k], label: label.toUpperCase() } : catalog.icons[k];
          const t = tile(p, theme, icon, o.tile);
          const file = label ? `${m.id}/link-${i + 1}.svg` : `tiles/${o.tile}/${k}.svg`;
          return `  <a href="${esc(url)}">${img(put(file, t.svg), icon.label, `height="${Math.round((o.size * t.h) / 132)}"`)}</a>`;
        });
        blocks.push(join(headingBlock(m, o.title), `<p>\n${tiles.join("\n")}\n</p>`));
        break;
      }
      case "people": {
        const entries = splitPeople(o.items);
        if (!entries.length) break;
        const cards = entries.map((e, i) => {
          if (e.url && !LINK.test(e.url)) throw new Error(`${m.id}.items: "${e.name}" link must start with https://, http:// or mailto:`);
          const login = e.image.startsWith("gh:") ? e.image.slice(3) : null;
          if (e.image && !login && !catalog.icons[e.image]) throw new Error(`${m.id}.items: "${e.name}" image "${e.image}" is neither gh:<login> nor an icon`);
          const svg = personCard(p, theme, e, login ? assets.avatars?.[login] : null, login ? null : catalog.icons[e.image]);
          const image = img(put(`${m.id}/${i + 1}.svg`, svg), [e.name, e.role].filter(Boolean).join(", "), 'width="49%"');
          return e.url ? `<a href="${esc(e.url)}">${image}</a>` : image;
        });
        blocks.push(join(headingBlock(m, o.title), `<p>\n${cards.join("\n")}\n</p>`));
        break;
      }
      case "divider":
        blocks.push(para(img(put(`${m.id}/divider.svg`, dividerSvg(theme)), "", 'width="100%"')));
        break;
    }
  }

  const readme = "<!-- Generated by scripts/build.mjs from settings.txt. Edit settings.txt (or use editor/), not this file. -->\n\n" +
    blocks.filter(Boolean).join("\n\n") + "\n";
  return { files, readme };
}

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
  return {
    login: "sample", followers: 5, commits: 1280,
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
