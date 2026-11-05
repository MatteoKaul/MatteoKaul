// Fetch End-of-Day (EOD) market prices and update the chain-linked
// portfolio index in data/portfolio.json (Module 2: Privacy-First Portfolio).
//
//   MARKET_API_KEY=... node scripts/market.mjs
//
// Zero-Knowledge guarantee:
//   - Only relative asset weights (%) from settings.txt are read.
//   - Only the normalized index (starting at 100.00) and EOD reference prices
//     are stored in data/portfolio.json.
//   - When asset weights change (rebalancing), existing historical index points
//     are preserved 100% intact and new daily returns are chain-linked onto the
//     latest index value (Time-Weighted Return principle).
//
// Supported providers:
//   - yahoo (default, no API key needed; falls back to Stooq if rate-limited)
//   - stooq (no API key needed)
//   - tiingo (uses repository secret MARKET_API_KEY)
//   - alphavantage (uses repository secret MARKET_API_KEY)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { updatePortfolioHistory } from "./lib/sources.mjs";
import { parseSettings, resolve, splitPortfolio } from "./render.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "data/portfolio.json");
const { MARKET_API_KEY: apiKey } = process.env;

const settingsFile = existsSync(join(ROOT, "settings.txt")) ? "settings.txt"
  : existsSync(join(ROOT, "default.config.json")) ? "default.config.json" : "default.settings.txt";
const cfg = resolve(parseSettings(readFileSync(join(ROOT, settingsFile), "utf8")));
const modules = cfg.modules.filter((m) => m.type === "portfolio");

const allocations = modules.flatMap((m) => splitPortfolio(m.opt.allocations));
if (!allocations.length) {
  console.log("market: no portfolio allocations configured, skipped");
  process.exit(0);
}

const provider = modules[0]?.opt.provider || "yahoo";
const existing = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : { history: [], lastPrices: {} };
const hasHistory = Array.isArray(existing.history) && existing.history.length > 0;
const UA = { "User-Agent": "Mozilla/5.0 (compatible; HomespaceProfileBot/1.0)" };

/** Fetch recent daily close prices { "YYYY-MM-DD": closePrice } for `ticker`. */
async function fetchSeries(ticker, prov) {
  if (prov === "tiingo") {
    if (!apiKey) throw new Error("MARKET_API_KEY secret is required for Tiingo provider");
    const start = shiftDays(hasHistory ? -14 : -35);
    const clean = ticker.replace(/\.[A-Z]+$/, "");
    const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(clean)}/prices?startDate=${start}&token=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { headers: { "Content-Type": "application/json", ...UA } });
    if (!res.ok) throw new Error(`Tiingo ${res.status}`);
    const rows = await res.json();
    return Object.fromEntries(rows.map((r) => [String(r.date).slice(0, 10), Number(r.adjClose || r.close)]).filter(([, p]) => p > 0));
  }
  if (prov === "alphavantage") {
    if (!apiKey) throw new Error("MARKET_API_KEY secret is required for Alpha Vantage provider");
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=compact&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`AlphaVantage ${res.status}`);
    const data = await res.json();
    const series = data["Time Series (Daily)"] || {};
    return Object.fromEntries(Object.entries(series).slice(0, hasHistory ? 14 : 35).map(([d, v]) => [d, Number(v["4. close"])]).filter(([, p]) => p > 0));
  }
  if (prov === "stooq") {
    return fetchStooq(ticker);
  }
  // Default: Yahoo Finance v8 chart API (with Stooq fallback)
  try {
    const range = hasHistory ? "10d" : "1mo";
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d`;
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`Yahoo ${res.status}`);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const ts = result?.timestamp || [];
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const out = {};
    for (let i = 0; i < ts.length; i++) {
      const p = Number(closes[i]);
      if (p > 0) out[new Date(ts[i] * 1000).toISOString().slice(0, 10)] = p;
    }
    return out;
  } catch (err) {
    console.warn(`market: Yahoo failed for ${ticker} (${err.message}), trying Stooq fallback...`);
    return fetchStooq(ticker);
  }
}

async function fetchStooq(ticker) {
  const sym = ticker.includes(".") ? ticker.toLowerCase() : `${ticker.toLowerCase()}.us`;
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`Stooq ${res.status}`);
  const csv = await res.text();
  const lines = csv.trim().split(/\r?\n/).slice(1).slice(-(hasHistory ? 14 : 35));
  const out = {};
  for (const line of lines) {
    const [date, , , , close] = line.split(",");
    const p = Number(close);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && p > 0) out[date] = p;
  }
  return out;
}

function shiftDays(delta) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

const uniqueTickers = [...new Set(allocations.map((a) => a.ticker.toUpperCase()))];
const priceSeriesByTicker = {};
for (const ticker of uniqueTickers) {
  try {
    priceSeriesByTicker[ticker] = await fetchSeries(ticker, provider);
  } catch (err) {
    console.warn(`market: could not fetch ${ticker}: ${err.message}`);
  }
}

// Merge weights across first portfolio module and chain-link onto existing index
const primaryAllocations = splitPortfolio(modules[0].opt.allocations);
const updated = updatePortfolioHistory(existing, primaryAllocations, priceSeriesByTicker);

mkdirSync(dirname(FILE), { recursive: true });
const text = JSON.stringify(updated, null, 1) + "\n";
const before = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
if (text !== before) writeFileSync(FILE, text);
console.log(`market: ${updated.history.length} index points (latest: ${updated.history[updated.history.length - 1]?.index ?? "n/a"})`);
