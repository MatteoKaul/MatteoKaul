// Graphical editor for settings.txt with a live preview.
//
// Open it through a web server, because it loads the repo files next to it:
//   GitHub Pages (Settings -> Pages -> Deploy from branch main, / (root)),
//   then https://<user>.github.io/<repo>/editor/
//   or locally:  python3 -m http.server   ->  http://localhost:8000/editor/
//
// It never writes to the repo itself: download or copy the new settings.txt
// and commit it (the "Edit on GitHub" button opens the file in GitHub's editor).
// The preview uses scripts/render.mjs, the same code the workflow runs.
import * as R from "../scripts/render.mjs";

const $ = (sel) => document.querySelector(sel);
const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  return fill(el, ...children);
};
/** Replace an element's children; nested arrays and null are allowed. */
const fill = (el, ...children) => {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
};
const svgUrl = (svg) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

// The editor's own headings are dot-matrix text from the same renderer.
const UI_THEME = { ...R.resolve({}).theme, fg: "#ffffff" };
const dotImg = (text, pitch, fill = "#ffffff") => state.fonts.led
  ? h("img", { src: svgUrl(R.renderLabel(UI_THEME, state.fonts.led, text, { pitch, fill })), alt: text })
  : text;
const title = (text) => h("h2", {}, dotImg(text, 1.6, "#9a9a9a"));

const EMPTY_DATA = { followers: 0, commits: 0, pinned: [], calendar: { total: 0, weeks: [] }, repos: [] };
const state = {
  settings: {},        // flat settings.txt content, the single source of truth
  catalog: null, fonts: {}, images: {}, avatars: {}, githubData: EMPTY_DATA,
  selected: "theme",   // "theme" or a module id
  iconFilter: "", iconCategory: "",
};

// ------------------------------------------------------------------ load --

async function load() {
  const get = (path) => fetch(path).then((r) => (r.ok ? r : Promise.reject(new Error(`${path}: ${r.status}`))));
  state.catalog = await get("../scripts/icons.json").then((r) => r.json());
  state.settings = R.parseSettings(await get("../settings.txt").then((r) => r.text()));
  state.githubData = await get("../data/github.json").then((r) => r.json()).catch(() => EMPTY_DATA);
  if (!state.githubData.repos?.length) $("#dataSource").value = "sample"; // nothing fetched yet: show a filled example
  await font(cfg().theme.font);
  await font("led");
  fill($(".brand"), dotImg("PROFILE EDITOR", 2.4));
  setupGithubLink();
  renderAll();
}

async function font(name) {
  state.fonts[name] ??= await fetch(`../fonts/${name}.json`).then((r) => r.json());
  return state.fonts[name];
}

async function image(file) {
  if (!file || file === "none" || state.images[file]) return;
  const res = await fetch(`../assets/src/${file}`);
  if (!res.ok) return; // render() reports the missing file
  setImage(file, new Uint8Array(await res.arrayBuffer()));
}

/** GitHub avatar saved by fetch.mjs as data/avatars/<login>.png or .jpg. */
async function avatar(login) {
  if (login in state.avatars) return;
  state.avatars[login] = null; // also remembers "not found"
  for (const ext of ["png", "jpg"]) {
    const res = await fetch(`../data/avatars/${login}.${ext}`);
    if (!res.ok) continue;
    const bytes = new Uint8Array(await res.arrayBuffer());
    state.avatars[login] = { mime: R.imageSize(bytes).mime, base64: toBase64(bytes) };
    return;
  }
}

function toBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function setImage(file, bytes) {
  state.images[file] = { ...R.imageSize(bytes), base64: toBase64(bytes) };
}

// ---------------------------------------------------------------- helpers --

// Settings are validated by resolve(). While a value is half-typed (e.g. a
// colour "#ff") the panels keep working with the last valid config and the
// status line shows what is wrong.
let lastValid = R.resolve({});
function cfg() {
  try { lastValid = R.resolve(state.settings); } catch { /* reported by renderPreview */ }
  return lastValid;
}
const layoutIds = () => cfg().layout.map((m) => m.id);
function setLayout(ids) { state.settings.layout = ids.join(", "); changed(); }
function set(key, value) {
  if (value === "" || value == null) delete state.settings[key]; else state.settings[key] = String(value);
  changed();
}
let timer;
function changed() {
  clearTimeout(timer);
  timer = setTimeout(renderPreview, 120);
}
function renderAll() { renderModules(); renderOptions(); renderPreview(); }

// ---------------------------------------------------------- module list --

function renderModules() {
  const c = cfg(), shown = new Set(c.layout.map((m) => m.id));
  const item = (m) => {
    const on = shown.has(m.id);
    const el = h("div", { class: `mod${state.selected === m.id ? " sel" : ""}${on ? "" : " off"}`, draggable: on, "data-id": m.id,
      onclick: (e) => { if (e.target.type !== "checkbox") { state.selected = m.id; renderModules(); renderOptions(); } } },
      h("span", { class: "grip", title: "Drag to reorder" }, on ? "⋮⋮" : ""),
      h("input", { type: "checkbox", checked: on, title: on ? "Hide" : "Show",
        onchange: (e) => { setLayout(e.target.checked ? [...layoutIds(), m.id] : layoutIds().filter((i) => i !== m.id)); renderModules(); } }),
      h("span", { class: "name" }, m.id),
      h("span", { class: "type" }, R.TYPES[m.type].label));
    if (on) dragSort(el, m.id);
    return el;
  };
  const hidden = c.modules.filter((m) => !shown.has(m.id));
  const typeSelect = h("select", {}, Object.entries(R.TYPES).map(([t, d]) => h("option", { value: t }, d.label)));
  fill($("#modules"),
    title("Style"),
    h("div", { class: `mod${state.selected === "theme" ? " sel" : ""}`, onclick: () => { state.selected = "theme"; renderModules(); renderOptions(); } },
      h("span", { class: "name" }, "Theme"), h("span", { class: "type" }, "colours, font")),
    title("Layout (drag to reorder)"),
    c.layout.map(item),
    hidden.length ? [title("Hidden"), hidden.map(item)] : null,
    h("div", { class: "add" }, typeSelect, h("button", { onclick: () => addModule(typeSelect.value) }, "+ Add")));
}

/** HTML5 drag and drop between module rows. */
function dragSort(el, id) {
  el.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/module", id));
  el.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("text/module")) { e.preventDefault(); el.classList.add("dragover"); } });
  el.addEventListener("dragleave", () => el.classList.remove("dragover"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    const from = e.dataTransfer.getData("text/module");
    const ids = layoutIds().filter((i) => i !== from);
    ids.splice(ids.indexOf(id), 0, from);
    setLayout(ids);
    renderModules();
  });
}

function addModule(type) {
  const ids = cfg().modules.map((m) => m.id);
  let id = type, k = 2;
  while (ids.includes(id)) id = `${type}${k++}`;
  if (id !== type) state.settings[`${id}.type`] = type;
  state.selected = id;
  setLayout([...layoutIds(), id]);
  renderModules(); renderOptions();
}

function deleteModule(id) {
  for (const key of Object.keys(state.settings)) if (key.startsWith(`${id}.`)) delete state.settings[key];
  state.selected = "theme";
  setLayout(layoutIds().filter((i) => i !== id));
  renderModules(); renderOptions();
}

// --------------------------------------------------------------- options --

function renderOptions() {
  const c = cfg();
  if (state.selected === "theme") {
    fill($("#options"),title("Theme"),
      R.THEME_FIELDS.map((f) => field(f, c.theme[f.key], (v) => set(`theme.${f.key}`, v))));
    return;
  }
  const m = c.modules.find((x) => x.id === state.selected);
  if (!m) { state.selected = "theme"; return renderOptions(); }
  fill($("#options"),
    title(`${m.id} - ${R.TYPES[m.type].label}`),
    h("p", { class: "help" }, R.TYPES[m.type].help),
    R.TYPES[m.type].fields.map((f) => field(f, m.opt[f.key], (v) => set(`${m.id}.${f.key}`, v), m)),
    m.type === "banner" ? imageUpload(m) : null,
    h("button", { class: "danger", onclick: () => confirm(`Delete module "${m.id}" and its options?`) && deleteModule(m.id) }, "Delete module"));
}

/** One option row; the editor widget depends on the field type. */
function field(f, value, onChange, module) {
  let input;
  switch (f.type) {
    case "number": {
      const range = h("input", { type: "range", min: f.min, max: f.max, step: f.step, value });
      const num = h("input", { type: "number", min: f.min, max: f.max, step: f.step, value });
      range.oninput = () => { num.value = range.value; onChange(range.value); };
      num.oninput = () => { range.value = num.value; onChange(num.value); };
      input = h("div", { class: "row" }, range, num);
      break;
    }
    case "color": {
      const pick = h("input", { type: "color", value });
      const txt = h("input", { type: "text", value });
      pick.oninput = () => { txt.value = pick.value; onChange(pick.value); };
      txt.onchange = () => { pick.value = txt.value; onChange(txt.value); };
      input = h("div", { class: "row" }, pick, txt);
      break;
    }
    case "select":
      input = h("select", { onchange: (e) => onChange(e.target.value) },
        f.options.map((o) => h("option", { value: o, selected: o === value }, o)));
      break;
    case "toggle": // on/off switch
      input = h("label", { class: "switch" },
        h("input", { type: "checkbox", checked: value === "on", onchange: (e) => onChange(e.target.checked ? "on" : "off") }),
        h("span", {}, value === "on" ? "on" : "off"));
      input.querySelector("input").addEventListener("change", (e) => (input.querySelector("span").textContent = e.target.checked ? "on" : "off"));
      break;
    case "textarea":
      input = h("textarea", { oninput: (e) => onChange(e.target.value) }, value);
      break;
    case "icons":
      return iconEditor(module);
    case "links":
      return linkEditor(f, value, onChange);
    case "people":
      return peopleEditor(f, value, onChange);
    default:
      input = h("input", { type: "text", value, oninput: (e) => onChange(e.target.value) });
  }
  return h("div", { class: "field" }, h("label", {}, f.label), input, f.help ? h("div", { class: "help" }, f.help) : null);
}

function imageUpload(m) {
  const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp",
    onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      setImage(f.name, new Uint8Array(await f.arrayBuffer()));
      set(`${m.id}.image`, f.name);
      renderOptions();
    } });
  return h("div", { class: "field" }, h("label", {}, "Try another image"), file,
    h("div", { class: "help" }, "Preview only: to use it, add the file to assets/src/ in the repo."));
}

/**
 * Row editor used for socials and people: each row is a few text/select
 * columns, saved back into the single-line settings format by `save`.
 */
function rowEditor(f, rows, columns, save, blank, addLabel) {
  const list = h("div", {});
  const draw = () => fill(list, rows.map((row, i) => h("div", { class: `entry-row${columns.length > 3 ? " wide" : ""}`, style: `--cols:${columns.length}` },
    columns.map((col, c) => col.options
      ? h("select", { title: col.label, onchange: (e) => { row[c] = e.target.value; save(); } },
        col.options.map((o) => h("option", { value: o, selected: o === row[c] }, o)))
      : h("input", { type: "text", value: row[c], placeholder: col.label, title: col.label,
        oninput: (e) => { row[c] = e.target.value; save(); } })),
    h("button", { title: "Remove", onclick: () => { rows.splice(i, 1); save(); draw(); } }, "×"))));
  draw();
  return h("div", { class: "field" }, h("label", {}, f.label), list,
    h("button", { onclick: () => { rows.push([...blank]); draw(); } }, addLabel),
    h("div", { class: "help" }, f.help));
}

/** socials: icon, url and an optional label (icon=url|LABEL). */
function linkEditor(f, value, onChange) {
  const rows = R.splitPairs(value).map(([k, v]) => [k, ...v.split("|").map((x) => x.trim())]).map(([k, u = "", l = ""]) => [k, u, l]);
  const save = () => onChange(rows.filter(([k]) => k).map(([k, u, l]) => `${k}=${u}${l ? `|${l}` : ""}`).join(", "));
  const keys = Object.keys(state.catalog.icons).sort((a, b) =>
    (state.catalog.icons[b].category === "social") - (state.catalog.icons[a].category === "social") || a.localeCompare(b));
  return rowEditor(f, rows, [{ label: "icon", options: keys }, { label: "https://..." }, { label: "label (optional)" }],
    save, ["website", "", ""], "+ Link");
}

/** people: name, role, url, image (gh:<login> or icon key). */
function peopleEditor(f, value, onChange) {
  const rows = R.splitPeople(value).map((e) => [e.name, e.role, e.url, e.image]);
  const save = () => onChange(rows.filter(([n]) => n).map((r) => r.join(" | ")).join(", "));
  return rowEditor(f, rows, [{ label: "Name" }, { label: "Role" }, { label: "https://..." }, { label: "gh:login or icon" }],
    save, ["", "", "", ""], "+ Entry");
}

// ----------------------------------------------------------- icon editor --
// Enabled icons are shown per category (the same grouping the README uses).
// Drag chips to reorder; dropping into another category writes a "move"
// override. Category arrows write "order", the title box writes "titles".

function iconEditor(m) {
  const { catalog } = state, o = m.opt, key = (k) => `${m.id}.${k}`;
  const items = R.splitList(o.items);
  const move = Object.fromEntries(R.splitPairs(o.move));
  const titles = Object.fromEntries(R.splitPairs(o.titles));
  const groups = R.iconGroups(o, catalog);
  const catOf = (k) => move[k] || catalog.icons[k].category;

  const saveItems = (list) => set(key("items"), list.join(", "));
  const saveMove = () => set(key("move"), Object.entries(move).map(([k, c]) => `${k}=${c}`).join(", "));
  const saveTitles = () => set(key("titles"), Object.entries(titles).filter(([, t]) => t).map(([c, t]) => `${c}=${t}`).join(", "));
  const refresh = () => { renderOptions(); };

  function dropChip(target, cat, beforeKey) {
    return (e) => {
      e.preventDefault(); target.classList.remove("dragover");
      const k = e.dataTransfer.getData("text/icon");
      if (!k) return;
      // category override: only kept when it differs from the catalog category
      if (catalog.icons[k].category === cat) delete move[k]; else move[k] = cat;
      const list = items.filter((x) => x !== k);
      let at = beforeKey ? list.indexOf(beforeKey) : -1;
      if (at < 0) { // after the last icon of that category
        const last = list.map(catOf).lastIndexOf(cat);
        at = last < 0 ? list.length : last + 1;
      }
      list.splice(at, 0, k);
      state.settings[key("items")] = list.join(", ");
      saveMove(); refresh();
    };
  }
  const allowDrop = (el) => (e) => { if (e.dataTransfer.types.includes("text/icon")) { e.preventDefault(); el.classList.add("dragover"); } };

  const moveCat = (cat, dir) => {
    const order = groups.map(([c]) => c), i = order.indexOf(cat), j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    set(key("order"), order.join(", ")); refresh();
  };

  // Empty categories added with "+ Category" stay as drop targets until used.
  state.extraCats = (state.extraCats || []).filter((c) => !groups.some(([g]) => g === c));
  const shown = [...groups, ...state.extraCats.map((c) => [c, []])];

  const boxes = shown.map(([cat, keys]) => {
    const box = h("div", { class: "cat" },
      h("div", { class: "cat-head" },
        h("button", { class: "icon-btn", title: "Move category up", onclick: () => moveCat(cat, -1) }, "↑"),
        h("button", { class: "icon-btn", title: "Move category down", onclick: () => moveCat(cat, 1) }, "↓"),
        h("input", { type: "text", value: titles[cat] || catalog.categories[cat] || cat.toUpperCase(), title: "Heading shown in the README",
          onchange: (e) => { titles[cat] = e.target.value === catalog.categories[cat] ? "" : e.target.value; saveTitles(); } }),
        h("small", {}, cat)),
      h("div", { class: "chips" }, keys.length ? keys.map((k) => {
        const chip = h("span", { class: `chip${move[k] ? " moved" : ""}`, draggable: true,
          title: move[k] ? `moved here from ${catalog.icons[k].category}` : `drag to reorder or move`},
          k, h("button", { title: "Remove", onclick: () => { delete move[k]; saveMove(); saveItems(items.filter((x) => x !== k)); refresh(); } }, "×"));
        chip.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/icon", k));
        chip.addEventListener("dragover", allowDrop(chip));
        chip.addEventListener("dragleave", () => chip.classList.remove("dragover"));
        chip.addEventListener("drop", (e) => { e.stopPropagation(); dropChip(chip, cat, k)(e); });
        return chip;
      }) : h("span", { class: "help" }, "Drop icons here")));
    box.addEventListener("dragover", allowDrop(box));
    box.addEventListener("dragleave", () => box.classList.remove("dragover"));
    box.addEventListener("drop", dropChip(box, cat));
    return box;
  });

  const unused = Object.keys(catalog.categories).filter((c) => !shown.some(([s]) => s === c));
  const addCat = h("select", { onchange: (e) => { state.extraCats.push(e.target.value); refresh(); } },
    h("option", { value: "" }, "+ Category as drop target…"), unused.map((c) => h("option", { value: c }, catalog.categories[c])));

  // Catalog picker: click an icon to show / hide it.
  const theme = cfg().theme, fontData = state.fonts[theme.font];
  const search = h("input", { type: "text", placeholder: "Search icons…", value: state.iconFilter,
    oninput: (e) => { state.iconFilter = e.target.value; drawPicker(); } });
  const catSelect = h("select", { onchange: (e) => { state.iconCategory = e.target.value; drawPicker(); } },
    h("option", { value: "" }, "All categories"),
    Object.entries(catalog.categories).map(([c, t]) => h("option", { value: c, selected: c === state.iconCategory }, t)));
  const picker = h("div", { class: "picker" });
  function drawPicker() {
    const q = state.iconFilter.toLowerCase();
    fill(picker, Object.entries(catalog.icons)
      .filter(([k, ic]) => (!state.iconCategory || ic.category === state.iconCategory) &&
        (!q || k.includes(q) || ic.label.toLowerCase().includes(q)))
      .map(([k, ic]) => h("button", { class: `pick${items.includes(k) ? " on" : ""}`, title: `${k} (${catalog.categories[ic.category]})`,
        onclick: () => { saveItems(items.includes(k) ? items.filter((x) => x !== k) : [...items, k]); refresh(); } },
        h("img", { src: svgUrl(R.renderTile(theme, fontData, ic)), alt: ic.label, loading: "lazy" }))));
  }
  drawPicker();

  // All simple options; items / move / order / titles are edited visually below.
  const style = R.TYPES.icons.fields.filter((f) => !["items", "move", "order", "titles"].includes(f.key))
    .map((f) => field(f, o[f.key], (v) => set(key(f.key), v)));

  return h("div", {},
    style,
    title("Shown icons by category"),
    h("p", { class: "help" }, "Drag icons to reorder them or into another category. Only categories with at least one icon are shown."),
    boxes, unused.length ? addCat : null,
    title("Catalog"),
    h("div", { class: "picker-tools" }, search, catSelect),
    picker);
}

// --------------------------------------------------------------- preview --

/** Tiny Markdown subset for text modules; README HTML passes through. */
function markdown(md) {
  return md.split(/\n{2,}/).map((block) => {
    if (block.trim().startsWith("<")) return block;
    const inline = block
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>").replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
      .replace(/ {2}\n/g, "<br>");
    return `<p>${inline}</p>`;
  }).join("\n");
}

// The README is shown in a sandboxed iframe (no scripts), styled like github.com.
const PREVIEW_CSS = `
  body { margin: 0; padding: 24px; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; }
  body.dark { background: #0d1117; color: #e6edf3; } body.light { background: #fff; color: #1f2328; }
  .readme { max-width: 830px; margin: 0 auto; border: 1px solid #30363d; border-radius: 6px; padding: 32px; }
  .light .readme { border-color: #d0d7de; }
  p { margin: 0 0 16px; } img { max-width: 100%; vertical-align: middle; } a { color: #4493f8; }
  code { background: rgba(110,118,129,.4); padding: .2em .4em; border-radius: 6px; font-size: 85%; }`;

function showPreview(html) {
  const frame = $("#frame"), y = frame.contentWindow?.scrollY || 0;
  frame.srcdoc = `<!doctype html><meta charset="utf-8"><base target="_blank"><style>${PREVIEW_CSS}</style>` +
    `<body class="${$("#previewMode").value}"><article class="readme">${html}</article></body>`;
  frame.onload = () => frame.contentWindow.scrollTo(0, y); // keep the scroll position while editing
}

async function renderPreview() {
  const status = $("#status");
  try {
    const c = R.resolve(state.settings); // throws on invalid values -> shown in the status line
    const fontData = await font(c.theme.font);
    await Promise.all([...c.layout.filter((m) => m.type === "banner").map((m) => image(m.opt.image)),
      ...R.avatarLogins(c).map(avatar)]);
    const data = $("#dataSource").value === "sample" ? R.SAMPLE_DATA : state.githubData;
    const avatars = Object.fromEntries(Object.entries(state.avatars).filter(([, v]) => v));
    const { files, readme } = R.render(c, data, { font: fontData, catalog: state.catalog, images: state.images, avatars });
    const html = markdown(readme.replace(/^<!--.*?-->\n*/s, ""))
      .replace(/src="(assets\/gen\/[^"]+)"/g, (_, path) => `src="${svgUrl(files[path])}"`);
    showPreview(html);
    status.className = "status";
    status.textContent = `${Object.keys(files).length} images · ${$("#dataSource").value === "sample" ? "sample data" : "GitHub data"}`;
  } catch (err) {
    status.className = "status error";
    status.textContent = err.message;
  }
}

// ---------------------------------------------------------------- output --

const settingsText = () => R.writeSettings(state.settings, state.catalog);

function setupGithubLink() {
  // On GitHub Pages the URL is https://<owner>.github.io/<repo>/editor/
  const owner = location.hostname.endsWith(".github.io") ? location.hostname.split(".")[0] : "MatteoKaul";
  const repo = location.hostname.endsWith(".github.io") ? location.pathname.split("/")[1] : "MatteoKaul";
  $("#editOnGithub").href = `https://github.com/${owner}/${repo}/edit/main/settings.txt`;
}

$("#download").onclick = () => {
  const a = h("a", { href: URL.createObjectURL(new Blob([settingsText()], { type: "text/plain" })), download: "settings.txt" });
  a.click();
};
$("#copy").onclick = async () => {
  await navigator.clipboard.writeText(settingsText());
  $("#copy").textContent = "Copied ✓";
  setTimeout(() => ($("#copy").textContent = "Copy settings.txt"), 1500);
};
$("#importFile").onchange = async (e) => {
  const f = e.target.files[0];
  if (f) { state.settings = R.parseSettings(await f.text()); state.selected = "theme"; renderAll(); }
};
$("#dataSource").onchange = renderPreview;
$("#previewMode").onchange = renderPreview;

load().catch((err) => { $("#status").className = "status error"; $("#status").textContent = `Could not load: ${err.message}`; });
