// Build README.md and all images in assets/gen/ from settings.txt.
//
//   node scripts/build.mjs                    use data/github.json (from fetch.mjs)
//   node scripts/build.mjs --sample           use fake data, e.g. to try layouts
//   node scripts/build.mjs --write-settings   also rewrite settings.txt with all
//                                             options and their explanations
//
// No dependencies besides Node 18+. The drawing itself is in render.mjs.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SAMPLE_DATA, imageSize, parseSettings, render, resolve, writeSettings } from "./render.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const args = process.argv.slice(2);

// What the repo looks like before the first fetch: no data, everything zero.
const EMPTY_DATA = { followers: 0, commits: 0, pinned: [], calendar: { total: 0, weeks: [] }, repos: [] };

const settings = parseSettings(read("settings.txt"));
const cfg = resolve(settings);
const catalog = JSON.parse(read("scripts/icons.json"));
const font = JSON.parse(read(`fonts/${cfg.theme.font}.json`));
const data = args.includes("--sample") ? SAMPLE_DATA
  : existsSync(join(ROOT, "data/github.json")) ? JSON.parse(read("data/github.json")) : EMPTY_DATA;

// Background images referenced by banner modules, embedded into the SVG.
const images = {};
for (const m of cfg.layout) {
  if (m.type !== "banner" || !m.opt.image || m.opt.image === "none") continue;
  const path = join(ROOT, "assets/src", m.opt.image);
  if (!existsSync(path)) continue; // render() reports the missing file
  const bytes = readFileSync(path);
  images[m.opt.image] = { ...imageSize(bytes), base64: bytes.toString("base64") };
}

const { files, readme } = render(cfg, data, { font, catalog, images });

// assets/gen only holds generated files, so it is rebuilt from scratch.
rmSync(join(ROOT, "assets/gen"), { recursive: true, force: true });
for (const [path, content] of Object.entries(files)) {
  mkdirSync(dirname(join(ROOT, path)), { recursive: true });
  writeFileSync(join(ROOT, path), content);
}
writeFileSync(join(ROOT, "README.md"), readme);
if (args.includes("--write-settings")) writeFileSync(join(ROOT, "settings.txt"), writeSettings(settings, catalog));

console.log(`built README.md and ${Object.keys(files).length} images (${cfg.layout.map((m) => m.id).join(", ")})`);
