// Profile renderer: settings + GitHub data -> SVG images + README.md.
//
// Pure functions only (no file or network access), so the same code runs in
// Node (scripts/build.mjs, used by the workflow) and in the browser
// (editor/), which makes the editor preview identical to the real output.
//
// Overview
//   parseSettings / writeSettings   settings.txt <-> flat {key: value}
//   resolve                         flat settings -> {theme, layout, modules}
//   render                          resolved config + data -> {files, readme}
//   TYPES / THEME_FIELDS            the option schema (also drives the editor)
//
// Everything visual is drawn with dot-matrix text: glyph grids from a font
// file (fonts/*.json), each "1" becomes a dot (circle, square or rounded).

// ---------------------------------------------------------------- schema --

// Theme options, written as "theme.<key>" in settings.txt.
export const THEME_FIELDS = [
  { key: "font", label: "Font", type: "select", options: ["led"], default: "led",
    help: "Dot font from fonts/<name>.json" },
  { key: "shape", label: "Dot shape", type: "select", options: ["circle", "square", "rounded"], default: "circle",
    help: "circle = LED look, square = pixel look, rounded = in between" },
  { key: "dot", label: "Dot size", type: "number", min: 0.2, max: 0.5, step: 0.01, default: 0.39,
    help: "Dot radius relative to the dot spacing (0.5 = dots touch)" },
  { key: "slant", label: "Slant", type: "number", min: 0, max: 0.4, step: 0.01, default: 0.22,
    help: "Italic slant, 0 = upright" },
  { key: "fg", label: "Foreground", type: "color", default: "#ffffff", help: "Main text and logos" },
  { key: "muted", label: "Muted", type: "color", default: "#cfcfcf", help: "Labels and secondary text" },
  { key: "faint", label: "Faint", type: "color", default: "#7a7a7a", help: "Placeholders and hints" },
  { key: "dim", label: "Dim", type: "color", default: "#2c2c2c", help: "Inactive dots (bars, activity grid)" },
  { key: "bg", label: "Card background", type: "color", default: "#000000", help: "Background of all cards and bars" },
  { key: "border", label: "Border", type: "color", default: "#2a2a2a", help: "Card outline" },
  { key: "radius", label: "Corner radius", type: "number", min: 0, max: 24, step: 1, default: 12,
    help: "Rounding of cards and bars in px" },
  { key: "text_font", label: "Text font", type: "text", default: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    help: "Font for longer text (project descriptions); must be installed on the viewer's system" },
];

const SIZE = { min: 60, max: 140, step: 2 };

// Module types and their options, written as "<module id>.<key>".
// A module id that matches a type name (or "about") needs no ".type" line.
export const TYPES = {
  banner: {
    label: "Banner", help: "Big title on a background image",
    fields: [
      { key: "title", label: "Title", type: "text", default: "MATREXX",
        help: "Letters A-Z and spaces; long titles shrink to fit. E.g. MATTEO KAUL, LUMI, LUMIEREZ, LUMI CODE" },
      { key: "image", label: "Background image", type: "file", default: "background.webp",
        help: "File in assets/src (png, jpg or webp), or none" },
      { key: "color", label: "Background colour", type: "color", default: "#111111", help: "Used when image = none" },
      { key: "position", label: "Image position", type: "number", min: 0, max: 100, step: 1, default: 30,
        help: "Which part of the photo is shown, 0 = top, 100 = bottom" },
      { key: "brightness", label: "Image brightness", type: "number", min: 0, max: 100, step: 1, default: 42,
        help: "Reference: 30 = dark | 42 = default | 70 = bright" },
      { key: "shadow", label: "Letter shadow", type: "number", min: 0, max: 100, step: 1, default: 60,
        help: "Reference: 40 = barely visible | 60 = subtle (default) | 67 = stronger" },
    ],
  },
  text: {
    label: "Text", help: "Free text (Markdown)",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "", help: "Leave empty for no heading" },
      { key: "text", label: "Text", type: "textarea", default: "", help: "Markdown; line breaks are kept" },
    ],
  },
  icons: {
    label: "Icons", help: "Logo tiles, grouped into categories automatically",
    fields: [
      { key: "items", label: "Icons", type: "icons", default: "",
        help: "Shown icons, in this order within each category (see scripts/icons.json)" },
      { key: "style", label: "Layout", type: "select", options: ["sections", "compact"], default: "sections",
        help: "sections = a full heading per category | compact = one heading, small category labels" },
      { key: "title", label: "Heading (compact)", type: "text", default: "SKILLS & TOOLS", help: "Only used with style = compact" },
      { key: "size", label: "Tile size", type: "number", ...SIZE, default: 100,
        help: "Display height in px. Reference: 120 = large | 100 = medium (default) | 80 = small" },
      { key: "move", label: "Category overrides", type: "pairs", default: "",
        help: "icon=category pairs, e.g. wireguard=services" },
      { key: "order", label: "Category order", type: "list", default: "",
        help: "Categories listed first, in this order; the rest follow in catalog order" },
      { key: "titles", label: "Category headings", type: "pairs", default: "",
        help: "category=HEADING pairs to rename categories, e.g. os=SYSTEMS" },
    ],
  },
  projects: {
    label: "Projects", help: "Cards for your repositories (GitHub data)",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "PROJECTS" },
      { key: "mode", label: "Which repos", type: "select", options: ["pinned", "recent", "list"], default: "pinned",
        help: "pinned = repos pinned on your profile | recent = last pushed | list = the repos below" },
      { key: "repos", label: "Repos (list mode)", type: "list", default: "", help: "Repo names, in this order" },
      { key: "limit", label: "Max cards", type: "number", min: 1, max: 12, step: 1, default: 6 },
      { key: "empty", label: "When empty", type: "select", options: ["hide", "placeholder"], default: "hide",
        help: "hide = section disappears until there is something to show | placeholder = show a NO ... YET card" },
    ],
  },
  releases: {
    label: "Releases", help: "Cards linking to your latest releases (GitHub data)",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "RELEASES" },
      { key: "mode", label: "Which releases", type: "select", options: ["latest", "each", "list"], default: "latest",
        help: "latest = only the newest release across all repos | each = latest release of every repo | list = the repos below" },
      { key: "repos", label: "Repos (list mode)", type: "list", default: "" },
      { key: "limit", label: "Max cards", type: "number", min: 1, max: 12, step: 1, default: 6 },
      { key: "empty", label: "When empty", type: "select", options: ["hide", "placeholder"], default: "hide",
        help: "hide = section disappears until there is something to show | placeholder = show a NO ... YET card" },
    ],
  },
  stats: {
    label: "Stats", help: "Repos, stars, commits, followers and top languages (GitHub data)",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "STATS" },
      { key: "languages", label: "Top languages", type: "number", min: 0, max: 8, step: 1, default: 5,
        help: "How many language bars, 0 = none" },
    ],
  },
  activity: {
    label: "Activity", help: "Contribution calendar of the last year as a dot grid (GitHub data)",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "ACTIVITY" },
      { key: "weeks", label: "Weeks", type: "number", min: 12, max: 53, step: 1, default: 53 },
    ],
  },
  socials: {
    label: "Socials", help: "Link tiles to your profiles",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "CONTACT" },
      { key: "items", label: "Links", type: "links", default: "",
        help: "icon=url pairs, e.g. twitch=https://www.twitch.tv/name, email=mailto:me@example.com" },
      { key: "size", label: "Tile size", type: "number", ...SIZE, default: 72 },
    ],
  },
  divider: { label: "Divider", help: "A dotted line", fields: [] },
};

const TYPE_ALIASES = { about: "text" };
export const DEFAULT_LAYOUT = ["banner", "about", "icons", "projects", "releases", "stats"];
export const CARD_W = 880; // width of headings and full-width cards

// ---------------------------------------------------------- settings.txt --

/** "key = value" lines -> {key: value}. "#" starts a comment, "\n" in a value is a line break. */
export function parseSettings(text) {
  const settings = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)#.*$/, "").trim(); // "#" only starts a comment at line start or after a space
    const eq = line.indexOf("=");
    if (eq > 0) settings[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/\\n/g, "\n");
  }
  return settings;
}

const comment = (text) => text.split("\n").map((l) => `# ${l}`.trimEnd()).join("\n");
const fieldComment = (f) => [f.help, f.options && `Options: ${f.options.join(" | ")}`].filter(Boolean).join("\n");

/** Flat settings -> settings.txt text with explanations, all options written out. */
export function writeSettings(settings, catalog) {
  const cfg = resolve(settings);
  const out = [comment(
    "Profile settings, read by scripts/build.mjs (and the editor in editor/).\n" +
    'One "key = value" per line, "#" starts a comment, "\\n" is a line break in text.\n' +
    "After a change on main, the Update profile workflow rebuilds README.md and the images.")];

  out.push("", comment("Modules from top to bottom. Remove an id to hide that module (its options stay below).\n" +
    `Types: ${Object.keys(TYPES).join(", ")}. A new module: add an id here and "<id>.type = <type>".`),
    `layout = ${cfg.layout.map((m) => m.id).join(", ")}`);

  out.push("", comment("---- theme ----"));
  for (const f of THEME_FIELDS) out.push(comment(fieldComment(f)), `theme.${f.key} = ${cfg.theme[f.key]}`);

  const ordered = [...cfg.layout, ...cfg.modules.filter((m) => !cfg.layout.includes(m))];
  for (const m of ordered) {
    const hidden = cfg.layout.includes(m) ? "" : " (hidden, not in layout)";
    out.push("", comment(`---- ${m.id}: ${TYPES[m.type].label}${hidden} ----\n${TYPES[m.type].help}`));
    if (m.id !== m.type && TYPE_ALIASES[m.id] !== m.type) out.push(`${m.id}.type = ${m.type}`);
    for (const f of TYPES[m.type].fields) {
      if (f.type === "icons" && catalog) {
        out.push(comment(`${f.help}\nAvailable, by category:\n` + Object.keys(catalog.categories).map((c) =>
          `  ${c}: ${Object.keys(catalog.icons).filter((k) => catalog.icons[k].category === c).join(", ")}`).join("\n")));
      } else if (fieldComment(f)) out.push(comment(fieldComment(f)));
      out.push(`${m.id}.${f.key} = ${String(m.opt[f.key]).replace(/\n/g, "\\n")}`);
    }
  }
  return out.join("\n") + "\n";
}

/** Flat settings -> {theme, layout: [module], modules: [module]}; module = {id, type, opt}. */
export function resolve(settings) {
  const theme = {};
  for (const f of THEME_FIELDS) theme[f.key] = convert(f, settings[`theme.${f.key}`], `theme.${f.key}`);

  const layoutIds = settings.layout !== undefined ? splitList(settings.layout) : DEFAULT_LAYOUT;
  const ids = [...new Set([...layoutIds, ...Object.keys(settings)
    .filter((k) => k.includes(".") && !k.startsWith("theme.")).map((k) => k.split(".")[0])])];

  const modules = ids.map((id) => {
    // ids become folder names in assets/gen, so keep them simple
    if (!/^[a-z0-9_-]+$/i.test(id)) throw new Error(`Module id "${id}": use letters, digits, - and _ only`);
    const type = settings[`${id}.type`] || TYPE_ALIASES[id] || id;
    if (!TYPES[type]) throw new Error(`Module "${id}": unknown type "${type}" (add "${id}.type = <type>")`);
    const opt = {};
    for (const f of TYPES[type].fields) opt[f.key] = convert(f, settings[`${id}.${f.key}`], `${id}.${f.key}`);
    return { id, type, opt };
  });
  const byId = Object.fromEntries(modules.map((m) => [m.id, m]));
  return { theme, layout: layoutIds.map((id) => byId[id]), modules };
}

/**
 * Settings value -> typed option, validated. Values end up in SVG attributes
 * and file paths, so anything unexpected is rejected instead of passed on.
 */
function convert(field, value, name) {
  if (value === undefined || value === "") return field.default;
  const fail = (why) => { throw new Error(`${name} = ${value}: ${why}`); };
  switch (field.type) {
    case "number": {
      const num = Number(value);
      if (!Number.isFinite(num)) fail("not a number");
      return Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, num));
    }
    case "color":
      return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : fail("use a hex colour like #ffffff");
    case "select":
      return field.options.includes(value) ? value : fail(`use one of ${field.options.join(", ")}`);
    case "file": // a plain file name inside assets/src, no paths
      return value === "none" || /^[\w-]+(\.[\w-]+)*\.(png|jpe?g|webp)$/i.test(value) ? value : fail("use a png/jpg/webp file name from assets/src, or none");
    default:
      return value;
  }
}

export const splitList = (value) => String(value).split(",").map((s) => s.trim()).filter(Boolean);

/** "a=1, b=2" -> [["a","1"], ["b","2"]] (values may contain "=", e.g. URLs) */
export const splitPairs = (value) => splitList(value).map((p) => {
  const eq = p.indexOf("=");
  return eq < 0 ? [p.trim(), ""] : [p.slice(0, eq).trim(), p.slice(eq + 1).trim()];
});

// ----------------------------------------------------------- dot drawing --

/** Dot centres for `text`. pitch = dot spacing, gap = empty columns between letters. */
function layout(text, pitch, font, { gap = 1, slant = 0.22 } = {}) {
  const { rows, cols, glyphs } = font;
  const points = [];
  let x = 0;
  for (const ch of String(text).toUpperCase()) {
    (glyphs[ch] || []).forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] === "1") points.push([x + c * pitch + (rows - 1 - r) * pitch * slant, r * pitch]);
      }
    });
    x += (cols + gap) * pitch;
  }
  const width = Math.max(0, x - (gap + 1) * pitch + (rows - 1) * pitch * slant);
  return { points, width, height: (rows - 1) * pitch };
}

const n = (v) => +v.toFixed(1); // keep SVG numbers short

/** One <path> "d" drawing all dots, so the files stay small. */
function dotPath(points, r, shape) {
  return points.map(([x, y]) => {
    if (shape === "square") return `M${n(x - r)} ${n(y - r)}h${n(2 * r)}v${n(2 * r)}h${n(-2 * r)}z`;
    if (shape === "rounded") {
      const k = n(r * 0.45), s = n(2 * r - 2 * k);
      return `M${n(x - r + k)} ${n(y - r)}h${s}q${k} 0 ${k} ${k}v${s}q0 ${k} ${-k} ${k}h${-s}q${-k} 0 ${-k} ${-k}v${-s}q0 ${-k} ${k} ${-k}z`;
    }
    return `M${n(x - r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0z`;
  }).join("");
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const svgDoc = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

/** Drawing context bound to a theme and font. */
function painter(theme, font) {
  const small = font.small, large = font.large || font.small;

  /** Dot text. (x, y) = top-left corner incl. dot radius (top-right with anchor "end"). */
  function text(str, x, y, { pitch, fill, anchor = "start", gap = 1, large: big = false, r } = {}) {
    const radius = r ?? pitch * theme.dot;
    const { points, width, height } = layout(str, pitch, big ? large : small, { gap, slant: theme.slant });
    const w = width + 2 * radius, h = height + 2 * radius;
    const ox = (anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x) + radius;
    const d = dotPath(points.map(([px, py]) => [px + ox, py + y + radius]), radius, theme.shape);
    return { svg: d ? `<path fill="${fill}" d="${d}"/>` : "", w, h };
  }

  /** Width of `str` at pitch 1 (scales linearly), for fitting. */
  const unitWidth = (str, opts = {}) => layout(str, 1, opts.large ? large : small, { gap: opts.gap ?? 1, slant: theme.slant }).width;

  /** Shorten str with a trailing "." until it fits maxWidth at this pitch. */
  function truncate(str, pitch, maxWidth) {
    const fits = (s) => (unitWidth(s) + 2 * theme.dot) * pitch <= maxWidth;
    if (fits(str)) return str;
    while (str.length > 1 && !fits(str + ".")) str = str.slice(0, -1);
    return str + ".";
  }

  const card = (w, h, body) => svgDoc(w, h,
    `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="${theme.radius}" fill="${theme.bg}" stroke="${theme.border}"/>${body}`);

  return { text, unitWidth, truncate, card, small, large };
}

// --------------------------------------------------------------- pieces --

function heading(p, theme, label, small = false) {
  const pitch = small ? 3.2 : 5.6, padY = small ? 10 : 16;
  const t = p.text(label, 24, padY, { pitch, fill: small ? theme.muted : theme.fg });
  const h = Math.round(t.h + 2 * padY);
  return svgDoc(CARD_W, h, `<rect width="${CARD_W}" height="${h}" rx="${theme.radius}" fill="${theme.bg}"/>${t.svg}`);
}

/** 168x132 tile: logo on top, label below. Long labels get tighter spacing / smaller pitch. */
function tile(p, theme, icon) {
  const W = 168, H = 132;
  const gap = icon.label.length > 8 ? 0.6 : 1;
  const pitch = Math.min(3.0, (W - 16) / (p.unitWidth(icon.label, { gap }) + 2 * theme.dot));
  const label = p.text(icon.label, W / 2, 0, { pitch, fill: theme.muted, gap, anchor: "middle" });
  const size = 48 * (icon.scale || 1); // logos are 24x24 markup, drawn at 48px (or larger for wordmarks)
  const logo = `<g transform="translate(${n((W - size) / 2)} ${n(46 - size / 2)}) scale(${(size / 24).toFixed(3)})" ` +
    `fill="${theme.fg}" color="${theme.fg}">${icon.svg}</g>`;
  return p.card(W, H, `${logo}<g transform="translate(0 ${n(112 - label.h / 2)})">${label.svg}</g>`);
}

function placeholderCard(p, theme, message, w = 430, h = 108) {
  const t = p.text(message, 22, 0, { pitch: 3.0, fill: theme.faint });
  return p.card(w, h, `<g transform="translate(0 ${n((h - t.h) / 2)})">${t.svg}</g>`);
}

/** Star outline-free polygon, 12px, for the stars count. */
const star = (x, y, fill) => `<path fill="${fill}" transform="translate(${x} ${y}) scale(.5)" d="M12 1.5l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.6l-6.4 3.5L7 14l-5.3-5 7.2-.9z"/>`;

function wrapWords(str, maxChars, maxLines) {
  const lines = [];
  let line = "";
  for (const word of String(str).split(/\s+/).filter(Boolean)) {
    if ((line + " " + word).trim().length > maxChars) { lines.push(line); line = word; } else line = (line + " " + word).trim();
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && lines.join(" ").length < String(str).trim().length)
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, maxChars - 1).replace(/\s*$/, "…");
  return lines;
}

function projectCard(p, theme, repo) {
  const W = 430, H = 132, pad = 22;
  const name = p.text(p.truncate(repo.name, 3.4, W - 2 * pad), pad, 18, { pitch: 3.4, fill: theme.fg });
  const desc = wrapWords(repo.description || "No description.", 50, 2).map((l, i) =>
    `<text x="${pad}" y="${64 + i * 18}" font-family="${esc(theme.text_font)}" font-size="13" fill="${theme.muted}">${esc(l)}</text>`).join("");
  const lang = p.text(repo.language || "", pad, 100, { pitch: 2.6, fill: theme.muted });
  const stars = p.text(String(repo.stars), W - pad, 100, { pitch: 2.6, fill: theme.fg, anchor: "end" });
  return p.card(W, H, name.svg + desc + lang.svg + stars.svg + star(W - pad - stars.w - 16, 99, theme.fg));
}

function releaseCard(p, theme, rel) {
  const W = 430, H = 108, pad = 22;
  const tag = p.text(p.truncate(rel.tag, 2.8, 200), W - pad, 78, { pitch: 2.8, fill: theme.fg, anchor: "end" });
  return p.card(W, H, [
    p.text("LATEST RELEASE", pad, 16, { pitch: 2.2, fill: theme.faint }).svg,
    p.text(p.truncate(rel.repo, 3.4, W - 2 * pad), pad, 40, { pitch: 3.4, fill: theme.fg }).svg,
    p.text(rel.date, pad, 78, { pitch: 2.8, fill: theme.muted }).svg,
    tag.svg,
  ].join(""));
}

const short = (v) => (v >= 10000 ? `${(v / 1000).toFixed(1)}K`.replace(".0K", "K") : String(v));

function statsCard(p, theme, s, languages) {
  const W = CARD_W, parts = [];
  const items = [["REPOS", s.repos], ["STARS", s.stars], ["COMMITS", s.commits], ["FOLLOWERS", s.followers]];
  const col = (W - 48) / items.length;
  items.forEach(([label, value], i) => {
    const num = p.text(short(value), 24 + i * col, 28, { pitch: 5.5, fill: theme.fg });
    parts.push(num.svg, p.text(label, 24 + i * col, 28 + num.h + 16, { pitch: 3.0, fill: theme.muted }).svg);
  });
  let y = 124;
  if (languages > 0) {
    y += 24;
    parts.push(p.text("TOP LANGUAGES", 24, y, { pitch: 3.0, fill: theme.muted }).svg);
    y += 40;
    const langs = s.languages.slice(0, languages);
    if (!langs.length) { parts.push(p.text("NO PUBLIC CODE YET", 24, y, { pitch: 4.0, fill: theme.faint }).svg); y += 30; }
    for (const [name, pct] of langs) {
      parts.push(p.text(p.truncate(name, 3.0, 220), 24, y, { pitch: 3.0, fill: theme.fg }).svg);
      const filled = Math.max(1, Math.round((pct / 100) * 44));
      for (let k = 0; k < 44; k++)
        parts.push(`<circle cx="${263 + k * 11}" cy="${y + 8}" r="3" fill="${k < filled ? theme.fg : theme.dim}"/>`);
      parts.push(p.text(`${Math.round(pct)}%`, W - 24, y, { pitch: 3.0, fill: theme.muted, anchor: "end" }).svg);
      y += 30;
    }
  }
  return p.card(W, y + 4, parts.join(""));
}

function activityCard(p, theme, calendar, weeks) {
  const W = CARD_W, cols = calendar.weeks.slice(-weeks);
  const pitch = (W - 48) / Math.max(cols.length, 1), r = n(pitch * 0.32);
  const opacity = [0, 0.3, 0.5, 0.75, 1];
  const head = p.text(`${calendar.total} CONTRIBUTIONS IN THE LAST YEAR`, 24, 20, { pitch: 3.0, fill: theme.muted });
  const dots = cols.flatMap((week, x) => week.map((level, y) =>
    `<circle cx="${n(24 + pitch * (x + 0.5))}" cy="${n(54 + pitch * (y + 0.5))}" r="${r}" fill="${level ? theme.fg : theme.dim}"` +
    (level && level < 4 ? ` fill-opacity="${opacity[level]}"` : "") + "/>"));
  return p.card(W, Math.round(54 + pitch * 7 + 20), head.svg + dots.join(""));
}

function dividerSvg(theme) {
  const dots = [];
  for (let x = 6; x < CARD_W; x += 14) dots.push(`<circle cx="${x}" cy="12" r="1.8"/>`);
  return svgDoc(CARD_W, 24, `<g fill="${theme.faint}">${dots.join("")}</g>`);
}

/** Banner: photo (greyscale, darkened) or colour, title in the large font with a soft letter shadow. */
function bannerSvg(p, theme, opt, image) {
  const W = 1600, H = 420, defs = [], body = [];
  if (image) {
    // Photo scaled to the banner width; `position` picks the visible band.
    const scale = W / image.width, ph = image.height * scale;
    const y = -Math.max(0, ph - H) * (opt.position / 100);
    const b = opt.brightness / 100, contrast = 1.15;
    defs.push(`<filter id="photo" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/>` +
      `<feComponentTransfer>${["R", "G", "B"].map((c) =>
        `<feFunc${c} type="linear" slope="${(contrast * b).toFixed(3)}" intercept="${(b * 0.5 * (1 - contrast)).toFixed(3)}"/>`).join("")}` +
      `</feComponentTransfer></filter>`);
    body.push(`<image href="data:${image.mime};base64,${image.base64}" x="0" y="${n(y)}" width="${W}" height="${n(ph)}" ` +
      `preserveAspectRatio="none" filter="url(#photo)"/>`);
  } else body.push(`<rect width="${W}" height="${H}" fill="${opt.color}"/>`);

  const title = String(opt.title).toUpperCase();
  const bad = [...new Set(title)].filter((c) => c !== " " && !(p.large.glyphs[c]));
  if (bad.length) throw new Error(`banner.title: unsupported characters ${bad.join(" ")} (use A-Z and spaces)`);
  if (title.trim()) {
    const pitch = Math.min(15, (W * 0.85) / p.unitWidth(title, { large: true, gap: 2 }));
    const t = p.text(title, W / 2, 0, { pitch, fill: theme.fg, large: true, gap: 2, anchor: "middle" });
    const y = n((H - t.h) / 2);
    if (opt.shadow > 0) {
      // Same dots, drawn larger (they merge along the strokes) and blurred: a shadow that follows the letters.
      const shadow = p.text(title, W / 2, 0, { pitch, fill: "#000", large: true, gap: 2, anchor: "middle", r: pitch * 0.6 });
      defs.push(`<filter id="shadow" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="3.5"/></filter>`);
      body.push(`<g transform="translate(0 ${n(y - (pitch * 0.6 - pitch * theme.dot))})" opacity="${opt.shadow / 100}" filter="url(#shadow)">${shadow.svg}</g>`);
    }
    body.push(`<g transform="translate(0 ${y})">${t.svg}</g>`);
  }
  return svgDoc(W, H, `<defs>${defs.join("")}</defs>${body.join("")}`);
}

/** Dot-matrix text as a standalone SVG (used for the editor's own headings). */
export function renderLabel(theme, font, str, { pitch = 2.6, fill = theme.fg } = {}) {
  const t = painter(theme, font).text(str, 0, 0, { pitch, fill });
  return svgDoc(n(t.w + 2), n(t.h), t.svg);
}

/** One icon tile as SVG text (used by the editor's icon picker). */
export const renderTile = (theme, font, icon) => tile(painter(theme, font), theme, icon);

// ------------------------------------------------------------- data use --

/** Numbers for the stats card, from data/github.json. */
export function statsFrom(data) {
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
  const order = [...new Set([...splitList(opt.order), ...Object.keys(catalog.categories), ...Object.values(move)])];
  return order.map((cat) => [cat, items.filter((k) => (move[k] || catalog.icons[k].category) === cat)])
    .filter(([, keys]) => keys.length);
}

// --------------------------------------------------------------- render --

/**
 * Render everything.
 *   cfg     resolve(settings)
 *   data    data/github.json (or SAMPLE_DATA)
 *   assets  {font, catalog, images: {filename: {mime, base64, width, height}}}
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
        const groups = iconGroups(o, catalog);
        const titles = Object.fromEntries(splitPairs(o.titles));
        const row = (keys) => "<p>\n" + keys.map((k) =>
          `  ${img(put(`tiles/${k}.svg`, tile(p, theme, catalog.icons[k])), catalog.icons[k].label, `height="${o.size}"`)}`).join("\n") + "\n</p>";
        const parts = o.style === "compact" ? [headingBlock(m, o.title)] : [];
        for (const [cat, keys] of groups) {
          const title = titles[cat] || catalog.categories[cat] || cat.toUpperCase();
          parts.push(headingBlock(m, title, o.style === "compact", `cat-${cat}`), row(keys));
        }
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
        const links = splitPairs(o.items);
        const bad = links.filter(([k]) => !catalog.icons[k]).map(([k]) => k);
        if (bad.length) throw new Error(`${m.id}.items: unknown icon(s) ${bad.join(", ")}`);
        if (!links.length) break;
        const tiles = links.map(([k, url]) =>
          `  <a href="${esc(url)}">${img(put(`tiles/${k}.svg`, tile(p, theme, catalog.icons[k])), catalog.icons[k].label, `height="${o.size}"`)}</a>`);
        blocks.push(join(headingBlock(m, o.title), `<p>\n${tiles.join("\n")}\n</p>`));
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

// ---------------------------------------------------------------- utils --

/** Width/height from PNG, JPEG or WebP bytes (Uint8Array), without decoding. */
export function imageSize(b) {
  const u16 = (i) => (b[i] << 8) | b[i + 1], le16 = (i) => b[i] | (b[i + 1] << 8);
  if (b[0] === 0x89 && b[1] === 0x50) return { width: (u16(16) << 16) | u16(18), height: (u16(20) << 16) | u16(22), mime: "image/png" };
  if (b[0] === 0xff && b[1] === 0xd8) { // JPEG: walk the segments to the SOF marker
    for (let i = 2; i < b.length;) {
      const marker = b[i + 1], len = u16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { width: u16(i + 7), height: u16(i + 5), mime: "image/jpeg" };
      i += 2 + len;
    }
  }
  if (String.fromCharCode(...b.slice(8, 12)) === "WEBP") {
    const kind = String.fromCharCode(...b.slice(12, 16));
    if (kind === "VP8 ") return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff, mime: "image/webp" };
    if (kind === "VP8L") {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, mime: "image/webp" };
    }
    if (kind === "VP8X") return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)), mime: "image/webp" };
  }
  throw new Error("unsupported image format (use png, jpg or webp)");
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
