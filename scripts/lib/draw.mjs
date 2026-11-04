// Drawing: dot-matrix text and every SVG building block (tiles, cards, banner).
//
// Everything is drawn from a theme (colours, dot shape/size, slant) and a
// font (glyph grids from fonts/*.json, "1" = dot). Functions return SVG text.
import { rgb } from "./settings.mjs";

export const CARD_W = 880; // width of headings and full-width cards

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

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const svgDoc = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

/** Drawing context bound to a theme and font. */
export function painter(theme, font) {
  const small = font.small, large = font.large || font.small;
  // Small text keeps the height of a 7-row font whatever the font's rows are,
  // so layouts work with every font (micro: 5 rows -> 1.5x the pitch).
  const norm = 6 / (small.rows - 1);

  /** Dot text. (x, y) = top-left corner incl. dot radius (top-right with anchor "end"). */
  function text(str, x, y, { pitch, fill, anchor = "start", gap = 1, large: big = false, r } = {}) {
    if (!big) pitch *= norm;
    const radius = r ?? pitch * theme.dot;
    const { points, width, height } = layout(str, pitch, big ? large : small, { gap, slant: theme.slant });
    const w = width + 2 * radius, h = height + 2 * radius;
    const ox = (anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x) + radius;
    const d = dotPath(points.map(([px, py]) => [px + ox, py + y + radius]), radius, theme.shape);
    return { svg: d ? `<path fill="${fill}" d="${d}"/>` : "", w, h };
  }

  /** Width of `str` at pitch 1 (scales linearly), for fitting. */
  const unitWidth = (str, opts = {}) =>
    layout(str, 1, opts.large ? large : small, { gap: opts.gap ?? 1, slant: theme.slant }).width * (opts.large ? 1 : norm);

  /** Shorten str with a trailing "." until it fits maxWidth at this pitch. */
  function truncate(str, pitch, maxWidth) {
    const fits = (s) => (unitWidth(s) + 2 * theme.dot * norm) * pitch <= maxWidth;
    if (fits(str)) return str;
    while (str.length > 1 && !fits(str + ".")) str = str.slice(0, -1);
    return str + ".";
  }

  /** Card background + content, without the <svg> wrapper (for nesting). */
  const cardBody = (w, h, body) =>
    `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="${theme.radius}" fill="${theme.bg}" stroke="${theme.border}"/>${body}`;
  const card = (w, h, body) => svgDoc(w, h, cardBody(w, h, body));

  return { text, unitWidth, truncate, card, cardBody, small, large, norm };
}

// --------------------------------------------------------------- pieces --

export function heading(p, theme, label, small = false) {
  const pitch = small ? 3.2 : 5.6, padY = small ? 10 : 16;
  const t = p.text(label, 24, padY, { pitch, fill: small ? theme.muted : theme.fg });
  const h = Math.round(t.h + 2 * padY);
  return svgDoc(CARD_W, h, `<rect width="${CARD_W}" height="${h}" rx="${theme.radius}" fill="${theme.bg}"/>${t.svg}`);
}

const TILE_W = 168, TILE_H = 132;

/**
 * One icon as a card, in one of three styles (all scale with the README):
 *   below  168x132, logo on top, label below (default)
 *   none   132x132, logo only
 *   badge  48 high, logo left, label right; width follows the label
 * Returns {w, h, body}; body is SVG without the <svg> wrapper.
 */
export function tileParts(p, theme, icon, style = "below") {
  const logo = (size, cx, cy) => { // logos are 24x24 markup; wordmarks get a larger "scale"
    const s = size * (icon.scale || 1);
    return `<g transform="translate(${n(cx - s / 2)} ${n(cy - s / 2)}) scale(${(s / 24).toFixed(3)})" ` +
      `fill="${theme.fg}" color="${theme.fg}">${icon.svg}</g>`;
  };
  if (style === "none") return { w: TILE_H, h: TILE_H, body: p.cardBody(TILE_H, TILE_H, logo(60, TILE_H / 2, TILE_H / 2)) };
  if (style === "badge") {
    const H = 48, label = p.text(icon.label, 0, 0, { pitch: 2.6, fill: theme.muted });
    const w = Math.ceil(16 + 26 + 12 + label.w + 16);
    return { w, h: H, body: p.cardBody(w, H, logo(26, 16 + 13, H / 2) + `<g transform="translate(54 ${n((H - label.h) / 2)})">${label.svg}</g>`) };
  }
  // Long labels get tighter letter spacing, then a smaller pitch, so they always fit.
  const gap = icon.label.length > 8 ? 0.6 : 1;
  const pitch = Math.min(3.0, (TILE_W - 16) / (p.unitWidth(icon.label, { gap }) + 2 * theme.dot * p.norm));
  const label = p.text(icon.label, TILE_W / 2, 0, { pitch, fill: theme.muted, gap, anchor: "middle" });
  return { w: TILE_W, h: TILE_H, body: p.cardBody(TILE_W, TILE_H,
    `${logo(48, TILE_W / 2, 46)}<g transform="translate(0 ${n(112 - label.h / 2)})">${label.svg}</g>`) };
}

/** One icon card as a standalone SVG; also returns its size. */
export function tile(p, theme, icon, style = "below") {
  const t = tileParts(p, theme, icon, style);
  return { svg: svgDoc(t.w, t.h, t.body), w: t.w, h: t.h };
}

/**
 * Categories side by side (icons module with columns > 1). Each row of
 * categories is one SVG, so a category's tiles always stay in its own column.
 *   groups  [[title, [icon]]] in display order
 * Returns [{svg, alt}], one per row.
 */
export function categoryRows(p, theme, groups, o) {
  const GAP = 12, TILE_GAP = 6, HEAD = 40;
  // Tiles are grid_size px high at full README width; badges half of that
  // (they are wide and low, so the same factor would make them unreadable).
  const scale = o.tile === "badge" ? (o.grid_size * 0.5) / 48 : o.grid_size / TILE_H;
  const narrowW = (CARD_W - (o.columns - 1) * GAP) / o.columns;
  const isWide = (g) => o.wide_toggle === "on" && g[1].length > o.wide_above;

  // Rows of up to `columns` categories; with wide_toggle, big categories get a row of their own.
  const rows = [];
  let current = [];
  for (const g of groups) {
    if (isWide(g)) {
      if (current.length) rows.push(current);
      rows.push([g]); current = [];
    } else {
      current.push(g);
      if (current.length === o.columns) { rows.push(current); current = []; }
    }
  }
  if (current.length) rows.push(current);

  return rows.map((row) => {
    const cellW = isWide(row[0]) ? CARD_W : narrowW;
    const cells = row.map(([title, icons], i) => {
      const x0 = i * (cellW + GAP);
      // Shrink long headings to fit the column (down to pitch 1.8), cut only below that.
      const pitch = Math.max(1.8, Math.min(3.0, (cellW - 28) / (p.unitWidth(title) + 2 * theme.dot * p.norm)));
      const label = p.text(p.truncate(title, pitch, cellW - 28), x0 + 14, 0, { pitch, fill: theme.fg });
      const head = `<rect x="${n(x0)}" width="${n(cellW)}" height="${HEAD}" rx="${theme.radius}" fill="${theme.bg}"/>` +
        `<g transform="translate(0 ${n((HEAD - label.h) / 2)})">${label.svg}</g>`;
      // Flow layout: tiles left to right, wrapping inside the column.
      let x = 0, y = HEAD + 8, lineH = 0;
      const tiles = icons.map((icon) => {
        const t = tileParts(p, theme, icon, o.tile), w = t.w * scale, h = t.h * scale;
        if (x > 0 && x + w > cellW) { x = 0; y += lineH + TILE_GAP; lineH = 0; }
        const svg = `<svg x="${n(x0 + x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${t.w} ${t.h}">${t.body}</svg>`;
        x += w + TILE_GAP; lineH = Math.max(lineH, h);
        return svg;
      });
      return { svg: head + tiles.join(""), h: y + lineH };
    });
    const height = Math.ceil(Math.max(...cells.map((c) => c.h)));
    return { svg: svgDoc(CARD_W, height, cells.map((c) => c.svg).join("")), alt: row.map(([t]) => t).join(" · ") };
  });
}

export function placeholderCard(p, theme, message, w = 430, h = 108) {
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

export function projectCard(p, theme, repo) {
  const W = 430, H = 132, pad = 22;
  const name = p.text(p.truncate(repo.name, 3.4, W - 2 * pad), pad, 18, { pitch: 3.4, fill: theme.fg });
  const desc = wrapWords(repo.description || "No description.", 50, 2).map((l, i) =>
    `<text x="${pad}" y="${64 + i * 18}" font-family="${esc(theme.text_font)}" font-size="13" fill="${theme.muted}">${esc(l)}</text>`).join("");
  const lang = p.text(repo.language || "", pad, 100, { pitch: 2.6, fill: theme.muted });
  const stars = p.text(String(repo.stars), W - pad, 100, { pitch: 2.6, fill: theme.fg, anchor: "end" });
  return p.card(W, H, name.svg + desc + lang.svg + stars.svg + star(W - pad - stars.w - 16, 99, theme.fg));
}

/**
 * Person / company card (430x96): image, name, role.
 *   pic  {avatar} GitHub avatar (round, greyscale) | {logo} image file (rounded
 *        square, greyscale) | {icon} catalog logo | {} initials in dots
 */
export function personCard(p, theme, entry, pic = {}) {
  const W = 430, H = 96, R = 28, cx = 22 + R, cy = H / 2;
  let image;
  const photo = (img, clip) => `<defs><clipPath id="c">${clip}</clipPath>` +
    `<filter id="g"><feColorMatrix type="saturate" values="0"/></filter></defs>` +
    `<image href="data:${img.mime};base64,${img.base64}" x="${cx - R}" y="${cy - R}" width="${2 * R}" height="${2 * R}" ` +
    `preserveAspectRatio="xMidYMid ${pic.logo ? "meet" : "slice"}" clip-path="url(#c)" filter="url(#g)"/>`;
  if (pic.avatar) image = photo(pic.avatar, `<circle cx="${cx}" cy="${cy}" r="${R}"/>`);
  else if (pic.logo) {
    image = `<rect x="${cx - R}" y="${cy - R}" width="${2 * R}" height="${2 * R}" rx="10" fill="${theme.dim}"/>` +
      photo(pic.logo, `<rect x="${cx - R}" y="${cy - R}" width="${2 * R}" height="${2 * R}" rx="10"/>`);
  } else if (pic.icon) {
    const size = 32 * (pic.icon.scale || 1);
    image = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${theme.dim}"/>` +
      `<g transform="translate(${n(cx - size / 2)} ${n(cy - size / 2)}) scale(${(size / 24).toFixed(3)})" fill="${theme.fg}" color="${theme.fg}">${pic.icon.svg}</g>`;
  } else {
    const initials = entry.name.split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2);
    const t = p.text(initials, cx, 0, { pitch: 3.0, fill: theme.fg, anchor: "middle" });
    image = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${theme.dim}"/><g transform="translate(0 ${n(cy - t.h / 2)})">${t.svg}</g>`;
  }
  const x = cx + R + 18, maxW = W - x - 20;
  const name = p.text(p.truncate(entry.name, 3.4, maxW), x, 22, { pitch: 3.4, fill: theme.fg });
  const role = entry.role ? p.text(p.truncate(entry.role, 2.4, maxW), x, 58, { pitch: 2.4, fill: theme.muted }).svg : "";
  return p.card(W, H, image + name.svg + role);
}

export function releaseCard(p, theme, rel) {
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

export function statsCard(p, theme, s, languages) {
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

export function activityCard(p, theme, calendar, weeks) {
  const W = CARD_W, cols = calendar.weeks.slice(-weeks);
  const pitch = (W - 48) / Math.max(cols.length, 1), r = n(pitch * 0.32);
  const opacity = [0, 0.3, 0.5, 0.75, 1];
  const head = p.text(`${calendar.total} CONTRIBUTIONS IN THE LAST YEAR`, 24, 20, { pitch: 3.0, fill: theme.muted });
  const dots = cols.flatMap((week, x) => week.map((level, y) =>
    `<circle cx="${n(24 + pitch * (x + 0.5))}" cy="${n(54 + pitch * (y + 0.5))}" r="${r}" fill="${level ? theme.fg : theme.dim}"` +
    (level && level < 4 ? ` fill-opacity="${opacity[level]}"` : "") + "/>"));
  return p.card(W, Math.round(54 + pitch * 7 + 20), head.svg + dots.join(""));
}

export function dividerSvg(theme) {
  const dots = [];
  for (let x = 6; x < CARD_W; x += 14) dots.push(`<circle cx="${x}" cy="12" r="1.8"/>`);
  return svgDoc(CARD_W, 24, `<g fill="${theme.faint}">${dots.join("")}</g>`);
}

/**
 * Banner: photo / animation (greyscale, darkened) or colour, title in the
 * large font with a soft letter shadow, optional title animation, blinking
 * cursor and scrolling ticker (CSS animations, switched off for viewers who
 * prefer reduced motion).
 *   p       painter for the banner font
 *   image   {mime, base64, width, height} or null; animated gif/webp just play
 *   invert  light-mode version: inverted photo, letters in theme.fg
 */
export function bannerSvg(p, theme, opt, image, invert = false) {
  const W = 1600, H = 420, defs = [], body = [], css = [];
  if (image) {
    // Photo scaled to the banner width; `position` picks the visible band.
    const scale = W / image.width, ph = image.height * scale;
    const y = -Math.max(0, ph - H) * (opt.position / 100);
    const b = opt.brightness / 100, contrast = opt.contrast / 100;
    let slope = contrast * b, intercept = b * 0.5 * (1 - contrast);
    if (invert) [slope, intercept] = [-slope, 1 - intercept];
    const tint = opt.tint.toLowerCase().startsWith("#ffffff") || opt.tint.toLowerCase() === "#fff" ? ""
      : `<feColorMatrix type="matrix" values="${rgb(opt.tint).map((v, i) =>
        [0, 1, 2, 3].map((j) => (i === j ? (v / 255).toFixed(3) : 0)).join(" ") + " 0").join(" ")} 0 0 0 1 0"/>`;
    defs.push(`<filter id="photo" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/>` +
      `<feComponentTransfer>${["R", "G", "B"].map((c) =>
        `<feFunc${c} type="linear" slope="${slope.toFixed(3)}" intercept="${intercept.toFixed(3)}"/>`).join("")}` +
      `</feComponentTransfer>${tint}</filter>`);
    body.push(`<image href="data:${image.mime};base64,${image.base64}" x="0" y="${n(y)}" width="${W}" height="${n(ph)}" ` +
      `preserveAspectRatio="none" filter="url(#photo)"/>`);
  } else body.push(`<rect width="${W}" height="${H}" fill="${opt.color}"/>`);

  const title = String(opt.title).toUpperCase();
  const bad = [...new Set(title)].filter((c) => c !== " " && !(p.large.glyphs[c]));
  if (bad.length) throw new Error(`banner.title: unsupported characters ${bad.join(" ")} (use ${p.large.glyphs["1"] ? "A-Z, 0-9" : "A-Z"} and spaces)`);
  const cursor = opt.cursor === "on", animated = cursor || opt.effect !== "none";
  if (title.trim() || cursor) {
    const big = { large: true, gap: 2 };
    const advance = (p.large.cols + 2); // per character, at pitch 1
    // the cursor sits one character after the title (or alone)
    const units = title ? p.unitWidth(title, big) + (cursor ? advance : 0) : p.large.cols - 1;
    const pitch = Math.min(15, (W * 0.85) / units);
    const shadowFill = invert ? theme.bg : "#000";
    const r = pitch * 0.6, dy = pitch * 0.6 - pitch * theme.dot; // shadow dots: larger, so shifted up
    if (opt.shadow > 0) defs.push(`<filter id="shadow" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="3.5"/></filter>`);
    const shadowOf = (str, x, anchor) => opt.shadow > 0
      ? `<g transform="translate(0 ${n(-dy)})" opacity="${opt.shadow / 100}" filter="url(#shadow)">${
        p.text(str, x - dy, 0, { pitch, fill: shadowFill, ...big, anchor, r }).svg}</g>` : "";
    const t = p.text(title, W / 2, 0, { pitch, fill: theme.fg, ...big, anchor: "middle" });
    const ty = n((H - t.h) / 2);
    if (!animated) {
      // Static title: one shadow + one path (the classic banner).
      if (opt.shadow > 0) body.push(`<g transform="translate(0 ${n(ty - dy)})" opacity="${opt.shadow / 100}" filter="url(#shadow)">${
        p.text(title, W / 2, 0, { pitch, fill: shadowFill, ...big, anchor: "middle", r }).svg}</g>`);
      body.push(`<g transform="translate(0 ${ty})">${t.svg}</g>`);
    } else {
      // Animated: every letter is its own group so it can be switched on and off.
      const left = W / 2 - (units * pitch + 2 * pitch * theme.dot) / 2;
      const letters = [...title].map((ch, i) => ch === " " ? "" :
        `<g class="c" style="--i:${i}">${shadowOf(ch, left + i * advance * pitch, "start")}` +
        p.text(ch, left + i * advance * pitch, 0, { pitch, fill: theme.fg, ...big }).svg + "</g>");
      const n1 = title.length;
      if (opt.effect === "type") {
        const dur = n(n1 * 0.18 + 4);
        css.push(`.c{animation:type ${dur}s step-end infinite backwards;animation-delay:calc(var(--i) * .18s)}`,
          `@keyframes type{0%{opacity:0}${n((0.18 / dur) * 100)}%{opacity:1}80%{opacity:1}85%,100%{opacity:0}}`);
      } else if (opt.effect === "flicker") {
        letters.forEach((l, i) => { if (l && (i * 7 + 3) % 5 === 0) letters[i] = l.replace('class="c"', 'class="c f"'); });
        if (!letters.some((l) => l.includes('class="c f"'))) letters[letters.findIndex(Boolean)] = letters.find(Boolean).replace('class="c"', 'class="c f"');
        css.push(`.f{animation:flicker 5s step-end infinite;animation-delay:calc(var(--i) * -1.3s)}`,
          `@keyframes flicker{0%,40%,44%,47%,78%,81%,100%{opacity:1}42%{opacity:.15}45%{opacity:.4}79%{opacity:.2}}`);
      } else if (opt.effect === "pulse") {
        css.push(`.t{animation:pulse 4s ease-in-out infinite}@keyframes pulse{50%{opacity:.68}}`);
      }
      let cursorSvg = "";
      if (cursor) {
        // An underscore of dots in the bottom row, one character after the title.
        const cx = left + (title ? n1 * advance * pitch : 0) + pitch * theme.dot;
        const cy = (p.large.rows - 1) * pitch + pitch * theme.dot;
        const pts = Array.from({ length: p.large.cols }, (_, c) => [cx + c * pitch, cy]);
        cursorSvg = `<path class="k" fill="${theme.fg}" d="${dotPath(pts, pitch * theme.dot, theme.shape)}"/>`;
        css.push(`.k{animation:blink 1.1s step-end infinite}@keyframes blink{50%{opacity:0}}`);
      }
      body.push(`<g class="t" transform="translate(0 ${ty})">${letters.join("")}${cursorSvg}</g>`);
    }
  }

  if (opt.ticker) {
    // Ticker: the text repeated along a dark band, moved left by exactly one repeat.
    const BAND = 52, tp = 3.6, text = String(opt.ticker).toUpperCase() + "      ";
    const L = [...text].length * (p.small.cols + 1) * tp * p.norm;
    const copies = Math.ceil(W / L) + 1;
    const line = p.text(text.repeat(copies), 0, 0, { pitch: tp, fill: theme.fg });
    body.push(`<rect y="${H - BAND}" width="${W}" height="${BAND}" fill="${theme.bg}" opacity=".55"/>`,
      `<g transform="translate(24 ${n(H - BAND + (BAND - line.h) / 2)})"><g class="tk">${line.svg}</g></g>`);
    css.push(`.tk{animation:tick ${n(L / opt.ticker_speed)}s linear infinite}@keyframes tick{to{transform:translateX(-${n(L)}px)}}`);
  }
  const style = css.length ? `<style>${css.join("")}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>` : "";
  return svgDoc(W, H, `${style}<defs>${defs.join("")}</defs>${body.join("")}`);
}

// ------------------------------------------------------- more modules --

/** Plain text in the theme's text font (for longer, free-form text). */
const words = (theme, str, x, y, { size = 14, fill = theme.muted, anchor = "start" } = {}) =>
  `<text x="${n(x)}" y="${n(y)}" font-family="${esc(theme.text_font)}" font-size="${size}" fill="${fill}"` +
  `${anchor === "start" ? "" : ` text-anchor="${anchor}"`} xml:space="preserve">${esc(str)}</text>`;
const clip = (str, max) => (str.length > max ? str.slice(0, max - 1).trimEnd() + "…" : str);
const BLINK = `<style>.k{animation:blink 1.1s step-end infinite}@keyframes blink{50%{opacity:0}}` +
  `@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>`;

/** Now: LABEL | text rows, labels in dots; optional blinking cursor. */
export function nowCard(p, theme, rows, cursor) {
  const W = CARD_W, ROW = 40, pad = 24;
  const labelW = Math.min(240, Math.max(...rows.map(([l]) => p.unitWidth(l) * 2.8)) + 2 * 2.8 * theme.dot);
  const x2 = pad + labelW + 28, maxChars = Math.floor((W - x2 - pad) / 8.6);
  const parts = rows.map(([label, text], i) => {
    const y = 22 + i * ROW;
    return p.text(p.truncate(label, 2.8, 240), pad, y, { pitch: 2.8, fill: theme.muted }).svg +
      words(theme, clip(text, maxChars), x2, y + 15, { size: 15, fill: theme.fg });
  });
  let extra = "";
  if (cursor) { // after the last line's text (monospace estimate)
    const last = clip(rows[rows.length - 1][1], maxChars);
    const cx = x2 + last.length * 9 + 10, cy = 22 + (rows.length - 1) * ROW + 9;
    extra = BLINK + `<rect class="k" x="${n(cx)}" y="${cy - 8}" width="9" height="16" rx="2" fill="${theme.fg}"/>`;
  }
  return p.card(W, 22 + rows.length * ROW + 6, extra + parts.join(""));
}

/** Timeline: WHEN | TITLE | detail rows on a dotted vertical line, newest first. */
export function timelineCard(p, theme, rows) {
  const W = CARD_W, ROW = 70, lineX = 196, x = lineX + 28, top = 26;
  const parts = [];
  const H = top + rows.length * ROW;
  for (let y = top + 8; y < H - ROW + 12; y += 8) parts.push(`<circle cx="${lineX}" cy="${y}" r="1.6" fill="${theme.faint}"/>`);
  rows.forEach(([when, title, detail], i) => {
    const y = top + i * ROW;
    parts.push(p.text(p.truncate(when, 2.4, 150), lineX - 24, y + 2, { pitch: 2.4, fill: theme.muted, anchor: "end" }).svg,
      i === 0 ? `<circle cx="${lineX}" cy="${y + 9}" r="7" fill="${theme.fg}"/>`
        : `<circle cx="${lineX}" cy="${y + 9}" r="6" fill="${theme.bg}" stroke="${theme.fg}" stroke-width="2"/>`,
      p.text(p.truncate(title, 3.0, W - x - 24), x, y, { pitch: 3.0, fill: theme.fg }).svg,
      detail ? words(theme, clip(detail, Math.floor((W - x - 24) / 7.8)), x, y + 44, { size: 13 }) : "");
  });
  return p.card(W, H, parts.join(""));
}

/** One feed entry (video / post): optional greyscale thumbnail, title, source and date. */
export function feedCard(p, theme, item, thumb) {
  const W = 430, H = 132, pad = 18;
  let x = pad, image = "";
  if (thumb) {
    const tw = 160, th = 90, ty = (H - th) / 2;
    image = `<defs><clipPath id="c"><rect x="${pad}" y="${ty}" width="${tw}" height="${th}" rx="8"/></clipPath>` +
      `<filter id="g"><feColorMatrix type="saturate" values="0"/></filter></defs>` +
      `<image href="data:${thumb.mime};base64,${thumb.base64}" x="${pad}" y="${ty}" width="${tw}" height="${th}" ` +
      `preserveAspectRatio="xMidYMid slice" clip-path="url(#c)" filter="url(#g)"/>`;
    x = pad + tw + 16;
  }
  const maxW = W - x - pad, perLine = Math.floor(maxW / 7.9);
  const lines = wrapWords(item.title, perLine, 3);
  return p.card(W, H, image +
    p.text(p.truncate(item.source || "FEED", 2.2, maxW), x, 18, { pitch: 2.2, fill: theme.faint }).svg +
    lines.map((l, i) => words(theme, l, x, 54 + i * 18, { size: 13.5, fill: theme.fg })).join("") +
    p.text(item.date || "", x, H - 30, { pitch: 2.4, fill: theme.muted }).svg);
}

/** Twitch: LIVE (pulsing dot, stream title, game) or OFFLINE. */
export function liveCard(p, theme, live, channel) {
  const W = CARD_W, H = 96;
  const on = !!live?.live;
  const dot = on
    ? `<style>.d{animation:pulse 1.6s ease-in-out infinite;transform-origin:44px 48px}@keyframes pulse{50%{opacity:.35;transform:scale(.8)}}` +
      `@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style><circle class="d" cx="44" cy="48" r="11" fill="${theme.fg}"/>`
    : `<circle cx="44" cy="48" r="11" fill="none" stroke="${theme.faint}" stroke-width="2.5"/>`;
  const state = p.text(on ? "LIVE" : "OFFLINE", 72, 24, { pitch: 4.4, fill: on ? theme.fg : theme.faint });
  const where = p.text(`TWITCH.TV/${channel}`, 72, 64, { pitch: 2.2, fill: theme.muted });
  const right = on
    ? words(theme, clip(live.title || "", 58), W - 24, 44, { size: 15, fill: theme.fg, anchor: "end" }) +
      p.text(p.truncate(live.game || "", 2.4, 400), W - 24, 58, { pitch: 2.4, fill: theme.muted, anchor: "end" }).svg
    : "";
  return p.card(W, H, dot + state.svg + where.svg + right);
}

/** Code snippet in a terminal-like window; comment lines dimmer. */
export function codeCard(p, theme, file, code) {
  const W = CARD_W, BAR = 40, LINE = 21, pad = 24;
  const lines = String(code).replace(/\t/g, "  ").split("\n").slice(0, 24).map((l) => clip(l.trimEnd(), 92));
  const H = BAR + 18 + lines.length * LINE + 12;
  const bar = [0, 1, 2].map((i) => `<circle cx="${pad + 6 + i * 20}" cy="${BAR / 2}" r="6" fill="${[theme.fg, theme.muted, theme.faint][i]}"/>`).join("") +
    p.text(p.truncate(file || "", 2.4, 500), W / 2, BAR / 2 - 8, { pitch: 2.4, fill: theme.muted, anchor: "middle" }).svg +
    `<rect y="${BAR}" x="1" width="${W - 2}" height="1" fill="${theme.border}"/>`;
  const body = lines.map((l, i) => words(theme, l, pad, BAR + 30 + i * LINE,
    { size: 14, fill: /^\s*(\/\/|#|--|;)/.test(l) ? theme.faint : theme.fg })).join("");
  return p.card(W, H, bar + body);
}

/** Guestbook: latest entries (@login, date, text) and a "sign" line. */
export function guestbookCard(p, theme, entries) {
  const W = CARD_W, ROW = 58, pad = 24;
  const parts = entries.map((e, i) => {
    const y = 22 + i * ROW;
    return p.text(p.truncate(`@${e.login}`, 2.6, 500), pad, y, { pitch: 2.6, fill: theme.fg }).svg +
      p.text(e.date || "", W - pad, y, { pitch: 2.2, fill: theme.faint, anchor: "end" }).svg +
      words(theme, clip(e.text, 96), pad, y + 36, { size: 13.5 });
  });
  const y = 22 + entries.length * ROW;
  if (!entries.length) parts.push(p.text("NO ENTRIES YET - BE THE FIRST", pad, 24, { pitch: 2.8, fill: theme.faint }).svg);
  const yy = entries.length ? y : 64;
  const sign = p.text("SIGN THE GUESTBOOK >", pad + 16, yy + 12, { pitch: 2.6, fill: theme.bg });
  parts.push(`<rect x="${pad}" y="${yy}" width="${n(sign.w + 32)}" height="${n(sign.h + 24)}" rx="${n((sign.h + 24) / 2)}" fill="${theme.fg}"/>`, sign.svg);
  return p.card(W, yy + sign.h + 24 + 22, parts.join(""));
}

/** Visitor counter badge: label + number (used by tools/counter/server.mjs). */
export function counterSvg(p, theme, count, label = "VISITORS") {
  const H = 48, l = p.text(label, 18, 0, { pitch: 2.4, fill: theme.muted });
  const num = p.text(String(count).padStart(6, "0"), 18 + l.w + 16, 0, { pitch: 3.2, fill: theme.fg });
  const W = Math.ceil(18 + l.w + 16 + num.w + 18);
  return p.card(W, H, `<g transform="translate(0 ${n((H - l.h) / 2)})">${l.svg}</g><g transform="translate(0 ${n((H - num.h) / 2)})">${num.svg}</g>`);
}

/** Dot-matrix text as a standalone SVG (used for the editor's own headings). */
export function renderLabel(theme, font, str, { pitch = 2.6, fill = theme.fg } = {}) {
  const t = painter(theme, font).text(str, 0, 0, { pitch, fill });
  return svgDoc(n(t.w + 2), n(t.h), t.svg);
}

/** One icon tile as SVG text (used by the editor's icon picker). */
export const renderTile = (theme, font, icon) => tile(painter(theme, font), theme, icon).svg;

// ---------------------------------------------------------------- images --

/** Width/height from PNG, JPEG, GIF or WebP bytes (Uint8Array), without decoding. */
export function imageSize(b) {
  const u16 = (i) => (b[i] << 8) | b[i + 1], le16 = (i) => b[i] | (b[i + 1] << 8);
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { width: le16(6), height: le16(8), mime: "image/gif" };
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
  throw new Error("unsupported image format (use png, jpg, gif or webp)");
}
