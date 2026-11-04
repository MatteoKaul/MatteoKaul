// Drawing: dot-matrix text and every SVG building block (tiles, cards, banner).
//
// Everything is drawn from a theme (colours, dot shape/size, slant) and a
// font (glyph grids from fonts/*.json, "1" = dot). Functions return SVG text.

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

  /** Card background + content, without the <svg> wrapper (for nesting). */
  const cardBody = (w, h, body) =>
    `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="${theme.radius}" fill="${theme.bg}" stroke="${theme.border}"/>${body}`;
  const card = (w, h, body) => svgDoc(w, h, cardBody(w, h, body));

  return { text, unitWidth, truncate, card, cardBody, small, large };
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
  const pitch = Math.min(3.0, (TILE_W - 16) / (p.unitWidth(icon.label, { gap }) + 2 * theme.dot));
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
      const pitch = Math.max(1.8, Math.min(3.0, (cellW - 28) / (p.unitWidth(title) + 2 * theme.dot)));
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
 * Person / company card (430x96): round image, name, role.
 *   avatar  {mime, base64} (GitHub avatar, shown greyscale) or null
 *   icon    catalog icon (logo) or null; without both: initials in dots
 */
export function personCard(p, theme, entry, avatar, icon) {
  const W = 430, H = 96, R = 28, cx = 22 + R, cy = H / 2;
  let image;
  if (avatar) {
    image = `<defs><clipPath id="c"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>` +
      `<filter id="g"><feColorMatrix type="saturate" values="0"/></filter></defs>` +
      `<image href="data:${avatar.mime};base64,${avatar.base64}" x="${cx - R}" y="${cy - R}" width="${2 * R}" height="${2 * R}" ` +
      `clip-path="url(#c)" filter="url(#g)"/>`;
  } else if (icon) {
    const size = 32 * (icon.scale || 1);
    image = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${theme.dim}"/>` +
      `<g transform="translate(${n(cx - size / 2)} ${n(cy - size / 2)}) scale(${(size / 24).toFixed(3)})" fill="${theme.fg}" color="${theme.fg}">${icon.svg}</g>`;
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

/** Banner: photo (greyscale, darkened) or colour, title in the large font with a soft letter shadow. */
export function bannerSvg(p, theme, opt, image) {
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
export const renderTile = (theme, font, icon) => tile(painter(theme, font), theme, icon).svg;

// ---------------------------------------------------------------- images --

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
