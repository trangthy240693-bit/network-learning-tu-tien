// "Mẹo Hán-Việt": guess the pinyin of a Chinese word from its Sino-Vietnamese
// reading, using sound-correspondence statistics measured on real data
// (data/hv-rules.json), flag the exceptions, and list other words that share
// the same Hán-Việt syllable (data/hv.json + the app's own words).
// Parsing helpers mirror hv_build/build_hv.ps1 so the statistics stay valid.
import { speak } from "./tts.js";

const VN_INITS = ["ngh", "ng", "nh", "ph", "th", "tr", "ch", "kh", "gh", "gi", "qu", "đ", "b", "c", "d", "g", "h", "k", "l", "m", "n", "q", "r", "s", "t", "v", "x"];
const VN_FINALS = ["ng", "nh", "ch", "c", "t", "p", "n", "m"];
const PY_INITS = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "r", "z", "c", "s", "y", "w"];
const MIN_SHARE = 0.10;
const MIN_SAMPLE = 8;

const stripMarks = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function parseVn(syl) {
  const t = stripMarks(syl);
  let init = "0";
  for (const i of VN_INITS) if (t.startsWith(i)) { init = i; break; }
  const rest = init === "0" ? t : t.slice(init.length);
  let final = "V";
  for (const f of VN_FINALS) if (rest.endsWith(f)) { final = f; break; }
  const n = syl.normalize("NFD");
  let tone = "ngang";
  if (n.includes("́")) tone = "sac";
  else if (n.includes("̀")) tone = "huyen";
  else if (n.includes("̉")) tone = "hoi";
  else if (n.includes("̃")) tone = "nga";
  else if (n.includes("̣")) tone = "nang";
  // Vần bắt đầu bằng i/y/ê/e (hoặc phụ âm gi-): trong tiếng Trung hay thành âm vòm x/q/j.
  const front = init === "gi" || (rest.length > 0 && "iye".includes(rest[0]));
  return { init, final, tone, front };
}

export function parsePy(syl) {
  const t = stripMarks(syl);
  let init = "0";
  for (const i of PY_INITS) if (t.startsWith(i)) { init = i; break; }
  const coda = t.endsWith("ng") ? "ng" : t.endsWith("n") ? "n" : "V";
  const n = syl.normalize("NFD");
  let tone = "0";
  if (n.includes("̄")) tone = "1";
  else if (n.includes("́")) tone = "2";
  else if (n.includes("̌")) tone = "3";
  else if (n.includes("̀")) tone = "4";
  return { init, coda, tone };
}

// Split a run-together pinyin string ("shuìjiào") into n syllables.
const PY_BASE = /^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?[aeiouüêāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+/;
function segChunk(chunk) {
  const out = [];
  (function rec(i, acc) {
    if (i === chunk.length) { out.push(acc.slice()); return; }
    const m = PY_BASE.exec(chunk.slice(i));
    if (!m) return;
    const j = i + m[0].length;
    const codas = [""];
    if (chunk.startsWith("ng", j)) codas.push("ng");
    if (chunk[j] === "n") codas.push("n");
    for (const c of codas) { acc.push(m[0] + c); rec(j + c.length, acc); acc.pop(); }
  })(0, []);
  return out;
}
export function segmentPinyin(pron, n) {
  const chunks = pron.toLowerCase().split(/[\s'’]+/).filter(Boolean);
  const options = chunks.map(segChunk);
  if (options.some((o) => !o.length)) return null;
  let found = null;
  (function combine(k, acc) {
    if (found) return;
    if (k === options.length) { if (acc.length === n) found = acc.slice(); return; }
    for (const seg of options[k]) combine(k + 1, acc.concat(seg));
  })(0, []);
  return found;
}

// ---------- data loading ----------
let dataPromise = null;
export function loadHvData() {
  if (!dataPromise) {
    dataPromise = Promise.all([
      fetch("data/hv-rules.json").then((r) => r.json()).catch(() => null),
      fetch("data/hv.json").then((r) => r.json()).catch(() => ({})),
    ]).then(([rules, hv]) => ({ rules, rows: hv.r || [], domains: hv.d || {}, kinds: hv.k || {} }));
  }
  return dataPromise;
}

function candidates(table, key) {
  const list = table?.[key];
  if (!list) return { total: 0, items: [], map: new Map() };
  const total = list.reduce((s, [, c]) => s + c, 0);
  const map = new Map(list.map(([k, c]) => [k, c / total]));
  const items = list.filter(([, c]) => c / total >= MIN_SHARE).map(([k, c]) => ({ key: k, share: c / total }));
  return { total, items, map };
}

const VN_INIT_LABEL = { "0": "(không có phụ âm đầu)", "đ": "Đ" };
const PY_INIT_LABEL = { "0": "∅" };
const FINAL_LABEL = { n: "-n", ng: "-ng", V: "vần mở (không -n/-ng)" };
const TONE_VN = { ngang: "ngang", huyen: "huyền", sac: "sắc", hoi: "hỏi", nga: "ngã", nang: "nặng" };

const pct = (x) => `${Math.round(x * 100)}%`;
const pyIni = (k) => PY_INIT_LABEL[k] || k;

// One syllable: what the rules predict vs what the pinyin really is.
export function analyzeSyllable(han, hv, py, rules) {
  const v = parseVn(hv);
  const p = parsePy(py);
  let ci = candidates(rules.initial, `${v.init}|${v.front ? 1 : 0}`);
  const conditional = ci.total >= MIN_SAMPLE;
  if (!conditional) ci = candidates(rules.initial, v.init);
  const cf = candidates(rules.final, v.final);
  const ct = candidates(rules.tone, v.tone);

  const grade = (cand, actual) => {
    if (cand.total < MIN_SAMPLE) return { status: "na", share: 0 };
    const share = cand.map.get(actual) || 0;
    return { status: share >= MIN_SHARE ? "ok" : "ex", share };
  };
  const neutral = p.tone === "0";
  return {
    han, hv, py,
    init: { hvInit: v.init, front: v.front, keys: ci.items.map((x) => x.key), actual: p.init, ...grade(ci, p.init) },
    final: { hvFinal: v.final, keys: cf.items.map((x) => x.key), actual: p.coda, ...grade(cf, p.coda) },
    tone: { hvTone: v.tone, keys: ct.items.map((x) => x.key), actual: neutral ? "nhẹ" : p.tone, ...(neutral ? { status: "na", share: 0 } : grade(ct, p.tone)) },
  };
}

// First variant of an app word: "这 / 这个" -> chars of "这", pinyin of "zhè".
export function alignWord(w) {
  if (!w.hanviet || w.hanviet === "—") return null;
  const han = Array.from((w.target || "").split(" / ")[0].trim()).filter((c) => /[一-鿿]/.test(c));
  const hv = w.hanviet.split(/[/,;]/)[0].trim().split(/\s+/).filter(Boolean);
  if (!han.length || hv.length !== han.length) return null;
  const pron = (w.pron || "").split(" / ")[0].trim();
  const py = segmentPinyin(pron, han.length);
  if (!py) return null;
  return { han, hv, py, pron, hanStr: han.join("") };
}

// Index of every known word by each of its Hán-Việt syllables.
function buildIndex(rows, appWords) {
  const entries = [];
  // App words first: they carry `stt`, so related-word chips can link to the real word page.
  for (const w of appWords) {
    const a = alignWord(w);
    if (a) entries.push({ han: a.hanStr, py: a.py.join(" "), hv: a.hv.join(" "), vi: w.meaning, kind: "same", note: "", vn: "", hsk: 0, stt: w.stt });
  }
  for (const [han, py, hv, vi, kind, note, vn, hsk, dom] of rows) entries.push({ han, py, hv, vi, kind, note, vn, hsk: Number(hsk) || 7, dom });
  const bySyl = new Map();
  const seen = new Set();
  for (const e of entries) {
    if (seen.has(e.han)) continue;
    seen.add(e.han);
    for (const s of new Set(e.hv.split(" "))) {
      if (!bySyl.has(s)) bySyl.set(s, []);
      bySyl.get(s).push(e);
    }
  }
  return { bySyl, byHan: new Map(entries.map((e) => [e.han, e])) };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const KIND_BADGE = { reversed: "⇄ đảo trật tự", drift: "⚠ bạn giả", partial: "đoán từng chữ" };

// Which of the 10 initial-consonant rules a Hán-Việt initial belongs to.
export const RULE_OF = { v: 1, "đ": 2, th: 3, nh: 4, t: 5, ph: 6, k: 7, c: 7, q: 7, qu: 7, kh: 7, g: 7, gi: 7, ng: 8, ngh: 8, tr: 9, ch: 9, s: 9, x: 9, h: 10 };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const KEEP = new Set(["b", "m", "l", "n"]);
const tag = (cls, text) => `<span class="hv-tag ${cls}">${esc(text)}</span>`;

// Plain-language rule tags for one syllable; only what helps the learner.
function syllableTags(s) {
  const out = [];
  const i = s.init;
  if (i.status !== "na" && !(KEEP.has(i.hvInit) && i.actual === i.hvInit) && i.hvInit !== "0") {
    const from = cap(i.hvInit === "đ" ? "Đ" : i.hvInit);
    const to = cap(i.actual === "0" ? "(không phụ âm)" : i.actual);
    const rule = RULE_OF[i.hvInit] ? `Quy luật ${RULE_OF[i.hvInit]} · ` : "";
    out.push(i.status === "ok" ? tag("ok", `${rule}${from} → ${to}`)
      : tag("ex", `⚠ Ngoại lệ: ${from} → ${to} (thường là ${i.keys.map((k) => cap(k === "0" ? "∅" : k)).join("/")})`));
  }
  const f = s.final;
  if (f.hvFinal !== "V" && f.status !== "na") {
    const to = f.actual === "V" ? "bỏ âm cuối" : `-${f.actual}`;
    out.push(f.status === "ok" ? tag("ok", `Vần -${f.hvFinal} → ${to}`) : tag("ex", `⚠ Ngoại lệ vần: -${f.hvFinal} → ${to}`));
  }
  const t = s.tone;
  if (t.status !== "na") {
    out.push(t.status === "ok" ? tag("ok", `Thanh ${TONE_VN[t.hvTone]} → thanh ${t.actual}`) : tag("ex", `⚠ Ngoại lệ thanh: ${TONE_VN[t.hvTone]} → thanh ${t.actual}`));
  }
  return out.join("");
}

export { syllableTags, loadHvData as loadData };
export function pyParts(syl) {
  const t = stripMarks(syl);
  const p = parsePy(syl);
  return { init: p.init, coda: p.coda, tone: p.tone, rest: p.init === "0" ? t : t.slice(p.init.length) };
}

function syllableCard(s) {
  return `
    <div class="hv-syl">
      <div class="hv-head"><span class="hv-han">${esc(s.han)}</span><span class="hv-vn">${esc(s.hv)}</span><span class="hv-arrow">→</span><span class="hv-py">${esc(s.py)}</span></div>
      <div class="hv-tags">${syllableTags(s)}</div>
    </div>`;
}

// ★★★ every syllable matches all three rules, ★★ at least half do, ★ mostly exceptions.
function scoreWord(han, py, hv, rules) {
  const h = hv.split(" "), p = py.split(" ");
  let full = 0;
  for (let i = 0; i < h.length; i++) {
    const s = analyzeSyllable(han[i], h[i], p[i], rules);
    if ([s.init, s.final, s.tone].every((x) => x.status !== "ex")) full++;
  }
  return full === h.length ? 3 : full * 2 >= h.length ? 2 : 1;
}

const plain = (s) => stripMarks(String(s)).replace(/đ/g, "d");

// Two sections of the Chinese branch: Tốc Biến (625 core words) and Hack Hán-Việt.
export function zhSwitcher(active) {
  return `<div class="list-toggle-row zh-switch">
    <a href="#/batches" class="list-toggle-tile c1 ${active === "speed" ? "active" : ""}"><span class="emoji">⚡</span><strong>Tốc Biến</strong><span>625 từ thông dụng nhất</span></a>
    <a href="#/hv" class="list-toggle-tile c3 ${active === "hack" ? "active" : ""}"><span class="emoji">🔗</span><strong>Hack Hán-Việt</strong><span>Đoán pinyin từ âm Hán-Việt</span></a>
  </div>`;
}

// Sub-sections of Hack Hán-Việt.
export function hackTabs(active) {
  return `<div class="seg-row">
    <a href="#/hv" class="seg ${active === "rules" ? "active" : ""}">📐 Quy luật</a>
    <a href="#/hv/words" class="seg ${active === "words" ? "active" : ""}">📘 Từ ghép</a>
    <a href="#/hv/all" class="seg ${active === "all" ? "active" : ""}">🗂 Kho mở rộng</a>
  </div>`;
}

export const sayZh = (text) => speak(text, "zh-CN");

export async function renderHvList(root) {
  root.innerHTML = `${zhSwitcher("hack")}${hackTabs("all")}
    <h2 style="margin:8px 0 4px">Kho từ mở rộng</h2>
    <p class="text-muted" style="font-size:12.5px;margin:0 0 8px">Danh sách này do máy sinh để tra cứu thêm, chưa rà từng từ — dữ liệu chuẩn nằm ở trang quy luật.</p>
    <div id="hvl-body" class="text-muted">Đang tải danh sách...</div>`;
  const { rules, rows, domains, kinds } = await loadHvData();
  const body = root.querySelector("#hvl-body");
  if (!rules || !rows.length) { body.textContent = "Chưa tải được dữ liệu Hán-Việt."; return; }

  const items = rows.map(([han, py, hv, vi, kind, note, vn, hsk, dom]) => {
    const chars = Array.from(han);
    return { han, py, hv, vi, kind, note, vn, hsk: Number(hsk) || 7, dom, chars, stars: scoreWord(chars, py, hv, rules), hay: `${han} ${plain(py)} ${plain(hv)} ${plain(vi)} ${plain(vn)}` };
  });
  const count = (k) => items.filter((i) => i.kind === k).length;
  const PAGE = 60;
  const st = { q: "", kind: "", stars: 0, hsk: "", dom: "", sort: "stars", shown: PAGE };

  body.className = "";
  body.innerHTML = `
    <p class="text-muted" style="font-size:13px;margin:0 0 10px">Tiếng Việt có rất nhiều từ Hán-Việt, nên nhiều từ tiếng Trung bạn đoán được cách đọc và nghĩa từ âm Hán-Việt. <b>${items.length}</b> từ: ${count("same")} giống hệt cùng trật tự · ${count("reversed")} đảo trật tự · ${count("drift")} bạn giả (lệch nghĩa) · ${count("partial")} đoán từng chữ. Bấm vào một từ để xem phân tích âm đầu / vần / thanh.</p>
    <input class="search-box" id="hvl-q" placeholder="Tìm chữ Hán, pinyin, âm Hán-Việt hoặc nghĩa..." />
    <div class="hvl-filters">
      <select id="hvl-kind"><option value="">Mọi loại</option>${Object.entries(kinds).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select>
      <select id="hvl-stars"><option value="0">Mọi mức giống</option><option value="3">★★★ giống nhất</option><option value="2">≥ ★★</option></select>
      <select id="hvl-hsk"><option value="">Mọi HSK</option>${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}">${n === 7 ? "HSK 7+" : "HSK " + n}</option>`).join("")}</select>
      <select id="hvl-dom"><option value="">Mọi lĩnh vực</option>${Object.entries(domains).filter(([k]) => items.some((i) => i.dom === k)).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select>
      <select id="hvl-sort"><option value="stars">Giống nhất trước</option><option value="root">Gom theo âm gốc đầu</option><option value="hsk">HSK thấp trước</option><option value="dom">Theo lĩnh vực</option></select>
    </div>
    <div id="hvl-count" class="text-muted" style="font-size:12px;margin:8px 0"></div>
    <div id="hvl-list"></div>
    <button class="btn ghost block mt-16" id="hvl-more">Xem thêm</button>
    <div class="text-muted" style="font-size:12px;margin-top:12px">★★★: mọi âm tiết đều khớp quy luật âm đầu + vần + thanh; ★★: khớp ít nhất một nửa số âm tiết; ★: nhiều ngoại lệ. "Bạn giả" = cùng chữ Hán-Việt nhưng nghĩa lệch; "đảo trật tự" = tiếng Việt ghép ngược (nhiệt náo → náo nhiệt).</div>`;

  const listEl = body.querySelector("#hvl-list");
  const moreBtn = body.querySelector("#hvl-more");
  const countEl = body.querySelector("#hvl-count");

  function filtered() {
    const q = plain(st.q.trim());
    const out = items.filter((i) => (!q || i.hay.includes(q) || i.han.includes(st.q.trim()))
      && (!st.kind || i.kind === st.kind) && (!st.stars || i.stars >= st.stars)
      && (!st.hsk || i.hsk === Number(st.hsk)) && (!st.dom || i.dom === st.dom));
    const KIND_RANK = { same: 0, reversed: 1, drift: 2, partial: 3 };
    const cmp = {
      stars: (a, b) => b.stars - a.stars || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.hsk - b.hsk || a.han.length - b.han.length,
      root: (a, b) => a.hv.split(" ")[0].localeCompare(b.hv.split(" ")[0], "vi") || a.han.length - b.han.length || a.han.localeCompare(b.han),
      hsk: (a, b) => a.hsk - b.hsk || b.stars - a.stars,
      dom: (a, b) => String(a.dom).localeCompare(String(b.dom)) || b.stars - a.stars,
    }[st.sort];
    return out.sort(cmp);
  }
  let current = [];
  function rowHtml(i, idx) {
    return `<div class="hvl-row" data-i="${idx}">
      <div class="hvl-main"><span class="hvl-han">${esc(i.han)}</span><span class="hvl-py">${esc(i.py)}</span><button class="speak-btn small" data-say="${encodeURIComponent(i.han)}" title="Nghe">🔊</button><span class="hvl-eq">≈</span><span class="hvl-vn">${esc(i.vn || i.hv)}</span></div>
      <div class="hvl-vi">${esc(i.vi)}</div>
      <div class="hvl-tags"><span class="tag">${"★".repeat(i.stars)}</span>${i.kind !== "same" ? `<span class="tag warn">${esc(KIND_BADGE[i.kind] || i.kind)}</span>` : ""}<span class="tag">${i.hsk === 7 ? "HSK 7+" : "HSK " + i.hsk}</span><span class="tag">${esc(domains[i.dom] || "")}</span></div>
      ${i.note ? `<div class="hvl-note">${esc(i.note)}</div>` : ""}
      <div class="hvl-detail" hidden></div></div>`;
  }
  function draw(reset = true) {
    if (reset) { current = filtered(); st.shown = PAGE; }
    countEl.textContent = `Hiển thị ${Math.min(st.shown, current.length)} / ${current.length} từ`;
    listEl.innerHTML = current.slice(0, st.shown).map(rowHtml).join("") || `<div class="empty-state">Không có từ nào khớp bộ lọc.</div>`;
    moreBtn.hidden = st.shown >= current.length;
  }
  listEl.addEventListener("click", (e) => {
    const say = e.target.closest("[data-say]");
    if (say) { sayZh(decodeURIComponent(say.dataset.say)); return; }
    const row = e.target.closest(".hvl-row");
    if (!row) return;
    const d = row.querySelector(".hvl-detail");
    if (d.hidden) {
      const it = current[Number(row.dataset.i)];
      const h = it.hv.split(" "), p = it.py.split(" ");
      d.innerHTML = it.chars.map((c, k) => syllableCard(analyzeSyllable(c, h[k], p[k], rules))).join("");
    }
    d.hidden = !d.hidden;
  });
  moreBtn.addEventListener("click", () => { st.shown += PAGE; draw(false); });
  let timer = null;
  body.querySelector("#hvl-q").addEventListener("input", (e) => { st.q = e.target.value; clearTimeout(timer); timer = setTimeout(draw, 150); });
  for (const [id, key] of [["hvl-kind", "kind"], ["hvl-stars", "stars"], ["hvl-hsk", "hsk"], ["hvl-dom", "dom"], ["hvl-sort", "sort"]]) {
    body.querySelector(`#${id}`).addEventListener("change", (e) => { st[key] = key === "stars" ? Number(e.target.value) : e.target.value; draw(); });
  }
  draw();
}

export async function renderHvBox(blockEl, w, appWords) {
  if (!blockEl) return;
  const box = blockEl.querySelector("#hv-box");
  const a = alignWord(w);
  if (!a) { blockEl.hidden = true; return; }
  const { rules, rows } = await loadHvData();
  if (!rules || !blockEl.isConnected) { blockEl.hidden = true; return; }

  const syls = a.han.map((h, i) => analyzeSyllable(h, a.hv[i], a.py[i], rules));
  let html = `<div class="hv-summary">Đọc âm Hán-Việt <b>${esc(a.hv.join(" "))}</b> là đoán được pinyin <b>${esc(a.py.join(" "))}</b>:</div>`;
  html += syls.map(syllableCard).join("");

  const { bySyl, byHan } = buildIndex(rows, appWords);
  const me = byHan.get(a.hanStr);
  if (me && me.kind !== "same" && me.note) html += `<div class="hv-warn">${KIND_BADGE[me.kind] || ""}: ${esc(me.note)}</div>`;

  const related = [];
  for (const s of new Set(a.hv)) {
    const list = (bySyl.get(s) || []).filter((e) => e.han !== a.hanStr)
      .sort((x, y) => (y.stt ? 1 : 0) - (x.stt ? 1 : 0) || x.hsk - y.hsk || x.han.length - y.han.length)
      .slice(0, 8);
    const coreCount = (bySyl.get(s) || []).filter((e) => e.stt).length;
    const famLink = coreCount >= 2 ? ` <a class="hv-fam-link" href="#/family/${encodeURIComponent(s.normalize("NFC").toLowerCase())}">Học cả họ từ này (${coreCount} từ) →</a>` : "";
    if (list.length) related.push(`<div class="hv-fam"><div class="hv-fam-title">Cùng âm gốc <b>${esc(s)}</b>${famLink}</div><div class="hv-fam-list">${list.map((e) => `
      <span class="hv-word ${e.stt ? "link" : ""}" ${e.stt ? `data-stt="${e.stt}"` : ""}><span class="hv-word-han">${esc(e.han)}</span><span class="hv-word-py">${esc(e.py)} <button class="speak-btn small" data-say="${encodeURIComponent(e.han)}" title="Nghe">🔊</button></span><span class="hv-word-vn">${esc(e.hv.split(" ").map((x) => (x === s ? `[${x}]` : x)).join(" "))} · ${esc(e.vi)}</span>${e.kind && e.kind !== "same" ? `<span class="hv-flag">${KIND_BADGE[e.kind] || ""}</span>` : ""}</span>`).join("")}</div></div>`);
  }
  html += related.join("");

  box.innerHTML = html;
  blockEl.hidden = false;
  box.querySelectorAll("[data-say]").forEach((b) => b.addEventListener("click", (ev) => { ev.stopPropagation(); sayZh(decodeURIComponent(b.dataset.say)); }));
  box.querySelectorAll(".hv-word.link").forEach((el) => el.addEventListener("click", () => { location.hash = `#/word/${el.dataset.stt}`; }));
}
