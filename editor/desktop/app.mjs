#!/usr/bin/env node
// Standalone desktop launcher for the Homespace Profile Editor.
// Starts a local HTTP server bound to 127.0.0.1 on an ephemeral free port,
// serves the editor and renderer files, and opens the user's default browser
// in app mode. Compiled into standalone multi-OS binaries (macOS ARM64,
// Windows x64, Linux x64/ARM64) by .github/workflows/editor-release.yml.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const server = createServer((req, res) => {
  const urlPath = new URL(req.url || "/", "http://127.0.0.1").pathname;
  if (urlPath === "/") {
    res.writeHead(302, { Location: "/editor/index.html" });
    res.end();
    return;
  }
  const safeRel = normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^[/\\]+/, "");
  const fullPath = join(ROOT, safeRel);
  if (!fullPath.startsWith(ROOT) || !existsSync(fullPath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }
  try {
    const data = readFileSync(fullPath);
    res.writeHead(200, { "Content-Type": MIME[extname(fullPath).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(500);
    res.end("Internal error");
  }
});

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/editor/index.html`;
  console.log(`Homespace Profile Editor running at ${url}`);
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
});
