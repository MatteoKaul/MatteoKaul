// Fetch public GitHub data for the profile into data/github.json.
//
//   GITHUB_TOKEN=... GH_USER=MatteoKaul node scripts/fetch.mjs
//
// Run daily by the workflow before build.mjs. The built-in workflow token is
// enough, only public data is read. The file is committed so builds (and the
// editor preview) work without network access.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { GITHUB_TOKEN, GH_USER } = process.env;
if (!GITHUB_TOKEN || !GH_USER) throw new Error("set GITHUB_TOKEN and GH_USER");

const QUERY = `
query($login: String!) {
  user(login: $login) {
    followers { totalCount }
    pinnedItems(first: 6, types: REPOSITORY) { nodes { ... on Repository { name } } }
    contributionsCollection {
      totalCommitContributions
      contributionCalendar { totalContributions weeks { contributionDays { contributionLevel } } }
    }
    repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC, orderBy: {field: PUSHED_AT, direction: DESC}) {
      nodes {
        name description url isFork stargazerCount pushedAt
        primaryLanguage { name }
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name } } }
        latestRelease { tagName url publishedAt }
      }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${GITHUB_TOKEN}`, "User-Agent": "profile-readme" },
  body: JSON.stringify({ query: QUERY, variables: { login: GH_USER } }),
});
const payload = await res.json();
if (!res.ok || payload.errors) throw new Error(`GitHub API: ${res.status} ${JSON.stringify(payload.errors || payload)}`);
const u = payload.data.user;

const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const cal = u.contributionsCollection.contributionCalendar;

// Reduced to what render.mjs uses; the format matches SAMPLE_DATA there.
const data = {
  login: GH_USER,
  fetchedAt: new Date().toISOString(),
  followers: u.followers.totalCount,
  commits: u.contributionsCollection.totalCommitContributions,
  pinned: u.pinnedItems.nodes.map((r) => r.name),
  calendar: { total: cal.totalContributions, weeks: cal.weeks.map((w) => w.contributionDays.map((d) => LEVEL[d.contributionLevel])) },
  repos: u.repositories.nodes.map((r) => ({
    name: r.name,
    description: r.description,
    url: r.url,
    fork: r.isFork,
    stars: r.stargazerCount,
    pushedAt: r.pushedAt,
    language: r.primaryLanguage?.name || "",
    languages: Object.fromEntries(r.languages.edges.map((e) => [e.node.name, e.size])),
    release: r.latestRelease && { tag: r.latestRelease.tagName, url: r.latestRelease.url, date: r.latestRelease.publishedAt.slice(0, 10) },
  })),
};

mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(join(ROOT, "data/github.json"), JSON.stringify(data, null, 1) + "\n");
console.log(`fetched ${data.repos.length} repos, ${data.calendar.total} contributions`);
