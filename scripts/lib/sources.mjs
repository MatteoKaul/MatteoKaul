// External data, reduced to what the modules draw. Pure functions (no
// network), used by fetch.mjs and live.mjs and testable with saved responses.

/** Feed source as written in settings -> feed URL (or a YouTube handle to look up). */
export function feedUrl(source) {
  const yt = source.match(/^youtube:(.+)$/i);
  if (!yt) return /^https:\/\//i.test(source) ? { url: source } : { error: "use https:// or youtube:<channel id / @handle>" };
  const id = yt[1].trim();
  if (/^UC[\w-]{22}$/.test(id)) return { url: `https://www.youtube.com/feeds/videos.xml?channel_id=${id}` };
  if (/^@[\w.-]+$/.test(id)) return { handle: id };
  return { error: "youtube: needs a channel id (UC...) or @handle" };
}

/** Channel id from the HTML of a YouTube channel page (youtube.com/@handle). */
export const youtubeChannelId = (html) =>
  (html.match(/"(?:channelId|externalId)":"(UC[\w-]{22})"/) || html.match(/channel_id=(UC[\w-]{22})/) || [])[1] || null;

const plain = (s) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => e[0] === "#"
    ? String.fromCodePoint(parseInt(e.slice(e[1] === "x" || e[1] === "X" ? 2 : 1), e[1] === "x" || e[1] === "X" ? 16 : 10))
    : ENTITIES[e.toLowerCase()] ?? m);
// Element text: CDATA unwrapped, tags removed, then entities decoded (so "&lt;b&gt;" stays as text).
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(plain(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"))) : "";
};
const attr = (xml, name, a) => { const m = xml.match(new RegExp(`<${name}\\s[^>]*?${a}="([^"]*)"`, "i")); return m ? decode(m[1]) : ""; };

/**
 * RSS 2.0 or Atom (incl. YouTube) -> [{title, url, date, thumb, source}].
 * thumb is the image URL here; fetch.mjs downloads it and puts the local path in.
 */
export function parseFeed(xml, label) {
  const atom = /<feed[\s>]/i.test(xml);
  const blocks = xml.match(atom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
  return blocks.map((b) => {
    const url = atom ? (attr(b, 'link[^>]*rel="alternate"', "href") || attr(b, "link", "href")) : tag(b, "link") || tag(b, "guid");
    const date = new Date(tag(b, atom ? "published" : "pubDate") || tag(b, "updated") || tag(b, "dc:date"));
    const thumb = attr(b, "media:thumbnail", "url") || attr(b, 'media:content[^>]*medium="image"', "url") ||
      attr(b, 'enclosure[^>]*type="image/[^"]*"', "url") || (b.match(/<img[^>]+src="(https:[^"]+)"/i) || [])[1] || "";
    return { title: tag(b, "title"), url, date: isNaN(date) ? "" : date.toISOString().slice(0, 10), thumb, source: label };
  }).filter((i) => i.title && /^https?:\/\//i.test(i.url));
}

/** Label shown on feed cards: YOUTUBE or the site's host name. */
export const feedLabel = (url) => (/youtube\.com/i.test(url) ? "YOUTUBE" : new URL(url).hostname.replace(/^www\./, "").toUpperCase());

/** GraphQL gist node -> card data (same fields as a repo card). */
export const gistCard = (g) => ({
  name: g.files?.[0]?.name || g.name, description: g.description || "", url: g.url,
  language: g.files?.[0]?.language?.name || "", stars: g.stargazerCount || 0,
});

/**
 * Issue comments -> guestbook entries. A comment counts as approved when the
 * repo owner reacted to it with a thumbs up (or wrote it).
 */
export function guestbookEntries(comments, owner) {
  return comments.map((c) => ({
    login: c.author?.login || "ghost",
    // first 140 characters as plain text: no code blocks, images, HTML or Markdown marks
    text: plain(c.body.replace(/```[\s\S]*?```/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/^\s*>+/gm, ""))
      .replace(/[*_`#]/g, "").slice(0, 140),
    date: c.createdAt.slice(0, 10),
    approved: c.author?.login?.toLowerCase() === owner.toLowerCase() ||
      c.reactions.nodes.some((r) => r.user?.login?.toLowerCase() === owner.toLowerCase()),
  })).filter((e) => e.text).reverse(); // newest first
}

/** Twitch Helix /streams response -> {login: {live, title, game, startedAt}} for the asked channels. */
export function liveState(channels, streams) {
  const by = Object.fromEntries(streams.map((s) => [s.user_login.toLowerCase(), s]));
  return Object.fromEntries(channels.map((c) => {
    const s = by[c.toLowerCase()];
    return [c.toLowerCase(), s ? { live: true, title: s.title, game: s.game_name, startedAt: s.started_at } : { live: false }];
  }));
}
