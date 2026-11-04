// Settings: the option schema, settings.txt parsing/writing and validation.
//
//   THEME_FIELDS / TYPES   every option with label, type, default and help text;
//                          the editor builds its forms from these, writeSettings
//                          its comments, resolve() its validation
//   parseSettings          settings.txt text -> flat {key: value}
//   writeSettings          flat settings -> settings.txt text with comments
//   resolve                flat settings -> {theme, layout, modules}, validated

// ---------------------------------------------------------------- schema --

// Theme options, written as "theme.<key>" in settings.txt.
export const THEME_FIELDS = [
  { key: "font", label: "Font", type: "name", default: "led",
    help: "Dot font: the name of a file in fonts/ (fonts/<name>.json)" },
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
      { key: "tile", label: "Tile style", type: "select", options: ["below", "none", "badge"], default: "below",
        help: "below = logo with the name underneath | none = logo only | badge = logo left, name right" },
      { key: "size", label: "Tile size", type: "number", ...SIZE, default: 100,
        help: "Display height in px (columns = 1). Reference: 120 = large | 100 = medium (default) | 80 = small" },
      { key: "columns", label: "Categories side by side", type: "number", min: 1, max: 4, step: 1, default: 1,
        help: "1 = one category per row with large headings | 2-4 = small headings and tiles, categories in columns" },
      { key: "grid_size", label: "Tile size (columns > 1)", type: "number", min: 40, max: 100, step: 2, default: 64,
        help: "Tile height in px at full README width. Reference: 80 = large | 64 = default | 48 = small" },
      { key: "min_toggle", label: "Hide small categories", type: "toggle", default: "off",
        help: "on = only show categories with at least \"Minimum icons\" icons" },
      { key: "min_icons", label: "Minimum icons", type: "number", min: 1, max: 4, step: 1, default: 2 },
      { key: "wide_toggle", label: "Full row for large categories", type: "toggle", default: "off",
        help: "on = with columns > 1, categories with more than \"Full row above\" icons get a whole row" },
      { key: "wide_above", label: "Full row above", type: "number", min: 1, max: 4, step: 1, default: 4 },
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
        help: "icon=url pairs, optionally with a label: icon=url|LABEL. The same icon may appear more than once.\n" +
          "E.g. youtube=https://www.youtube.com/@name|MAIN, youtube=https://www.youtube.com/@name2|CLIPS, website=https://example.com|BLOG" },
      { key: "tile", label: "Tile style", type: "select", options: ["below", "none", "badge"], default: "below",
        help: "below = logo with the name underneath | none = logo only | badge = logo left, name right" },
      { key: "size", label: "Tile size", type: "number", ...SIZE, default: 72,
        help: "Display height in px of a below-style tile; the other styles scale with it" },
    ],
  },
  people: {
    label: "People", help: "Cards for people or companies you work with, or your employer",
    fields: [
      { key: "title", label: "Heading", type: "text", default: "WORKING WITH" },
      { key: "items", label: "Entries", type: "people", default: "",
        help: "Entries separated by commas, each: Name | Role | URL | Image.\n" +
          "Image: gh:<github login> (avatar, fetched by the workflow), an icon key from icons.json, or empty for initials.\n" +
          "E.g. Jane Doe | Co-founder | https://github.com/jane | gh:jane, Acme GmbH | Client | https://acme.example | website" },
    ],
  },
  divider: { label: "Divider", help: "A dotted line", fields: [] },
};

const TYPE_ALIASES = { about: "text" };
export const DEFAULT_LAYOUT = ["banner", "about", "icons", "projects", "releases", "stats"];

// ---------------------------------------------------------- settings.txt --

/**
 * "key = value" lines -> {key: value}. Lines starting with "#" are comments
 * (only whole lines, so values like "#ffffff" or "C#" work), "\n" in a value
 * is a line break.
 */
export function parseSettings(text) {
  const settings = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("#")) continue;
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
    // modules without options need the type line, or a hidden one would vanish
    if ((m.id !== m.type && TYPE_ALIASES[m.id] !== m.type) || !TYPES[m.type].fields.length) out.push(`${m.id}.type = ${m.type}`);
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
    case "toggle":
      return value === "on" || value === "off" ? value : fail("use on or off");
    case "name": // a plain file name without extension, e.g. a font in fonts/
      return /^[\w-]+$/.test(value) ? value : fail("use a plain name (letters, digits, - and _)");
    case "file": // a plain file name inside assets/src, no paths
      return value === "none" || /^[\w-]+(\.[\w-]+)*\.(png|jpe?g|webp)$/i.test(value) ? value : fail("use a png/jpg/webp file name from assets/src, or none");
    default:
      return value;
  }
}

export const splitList = (value) => String(value).split(",").map((s) => s.trim()).filter(Boolean);

/** "Name | Role | URL | Image, ..." -> [{name, role, url, image}] */
export const splitPeople = (value) => splitList(value).map((entry) => {
  const [name = "", role = "", url = "", image = ""] = entry.split("|").map((s) => s.trim());
  return { name, role, url, image };
});

/** GitHub logins referenced as "gh:<login>" images in people modules (for fetch.mjs). */
export const avatarLogins = (cfg) => [...new Set(cfg.modules.filter((m) => m.type === "people")
  .flatMap((m) => splitPeople(m.opt.items)).map((e) => e.image)
  .filter((i) => /^gh:[A-Za-z0-9-]+$/.test(i)).map((i) => i.slice(3)))];

/** "a=1, b=2" -> [["a","1"], ["b","2"]] (values may contain "=", e.g. URLs) */
export const splitPairs = (value) => splitList(value).map((p) => {
  const eq = p.indexOf("=");
  return eq < 0 ? [p.trim(), ""] : [p.slice(0, eq).trim(), p.slice(eq + 1).trim()];
});
