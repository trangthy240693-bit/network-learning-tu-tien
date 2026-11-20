// "Mẹo Hán-Việt": guess the pinyin of a Chinese word from its Sino-Vietnamese
// reading, using sound-correspondence statistics measured on real data
// (data/hv-rules.json), flag the exceptions, and list other words that share
// the same Hán-Việt syllable (data/hv.json + the app's own words).
// Parsing helpers mirror hv_build/build_hv.ps1 so the statistics stay valid.

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
    init: { label: `${VN_INIT_LABEL[v.init] || v.init}${conditional && v.front ? " + vần i/ê" : ""}`, predicted: ci.items.map((x) => `${pyIni(x.key)} ${pct(x.share)}`), actual: pyIni(p.init), ...grade(ci, p.init) },
    final: { label: v.final === "V" ? "mở" : `-${v.final}`, predicted: cf.items.map((x) => `${FINAL_LABEL[x.key] || x.key}`), actual: FINAL_LABEL[p.coda], ...grade(cf, p.coda) },
    tone: {
      label: TONE_VN[v.tone],
      predicted: ct.items.map((x) => `${x.key} ${pct(x.share)}`),
      actual: neutral ? "nhẹ" : p.tone,
      ...(neutral ? { status: "na", share: 0 } : grade(ct, p.tone)),
    },
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
  for (const [han, py, hv, vi, kind, note, vn, hsk, dom] of rows) entries.push({ han, py, hv, vi, kind, note, vn, hsk: Number(hsk) || 7, dom });
  for (const w of appWords) {
    const a = alignWord(w);
    if (a) entries.push({ han: a.hanStr, py: a.py.join(" "), hv: a.hv.join(" "), vi: w.meaning, kind: "same", note: "", vn: "", hsk: 0, stt: w.stt });
  }
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
const ICON = { ok: "✓", ex: "⚠", na: "·" };

function chip(label, pred, actual, status, share) {
  const predText = pred.length ? pred.join(" / ") : "chưa đủ dữ liệu";
  const note = status === "ex" ? (share > 0 ? `hiếm gặp (${pct(share)})` : "ngoại lệ") : "";
  return `<div class="hv-chip ${status}"><span class="hv-k">${label}</span><span class="hv-pred">đoán: ${esc(predText)}</span><span class="hv-act">${ICON[status]} thực tế: <b>${esc(actual)}</b>${note ? ` — ${note}` : ""}</span></div>`;
}

const KIND_BADGE = { reversed: "⇄ đảo trật tự", drift: "⚠ bạn giả", partial: "đoán từng chữ" };

function syllableCard(s) {
  return `
    <div class="hv-syl">
      <div class="hv-head"><span class="hv-han">${esc(s.han)}</span><span class="hv-vn">${esc(s.hv)}</span><span class="hv-arrow">→</span><span class="hv-py">${esc(s.py)}</span></div>
      <div class="hv-chips">
        ${chip(`Âm đầu ${esc(s.init.label)}`, s.init.predicted, s.init.actual, s.init.status, s.init.share)}
        ${chip(`Vần ${esc(s.final.label)}`, s.final.predicted, s.final.actual, s.final.status, s.final.share)}
        ${chip(`Thanh ${esc(s.tone.label)}`, s.tone.predicted.map((x) => `thanh ${x}`), s.tone.actual === "nhẹ" ? "thanh nhẹ" : `thanh ${s.tone.actual}`, s.tone.status, s.tone.share)}
      </div>
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

export async function renderHvList(root) {
  root.innerHTML = `<a href="#/batches" class="text-muted" style="text-decoration:none;font-size:13px">← Từ vựng</a>
    <h2 style="margin:8px 0 4px">🔗 Từ Hán-Việt giống tiếng Trung</h2><div id="hvl-body" class="text-muted">Đang tải danh sách...</div>`;
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
    <p class="text-muted" style="font-size:13px;margin:0 0 10px"><b>${items.length}</b> từ: ${count("same")} giống hệt cùng trật tự · ${count("reversed")} đảo trật tự · ${count("drift")} bạn giả (lệch nghĩa) · ${count("partial")} đoán từng chữ. Bấm vào một từ để xem phân tích âm đầu / vần / thanh.</p>
    <input class="search-box" id="hvl-q" placeholder="Tìm chữ Hán, pinyin, âm Hán-Việt hoặc nghĩa..." />
    <div class="hvl-filters">
      <select id="hvl-kind"><option value="">Mọi loại</option>${Object.entries(kinds).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select>
      <select id="hvl-stars"><option value="0">Mọi mức giống</option><option value="3">★★★ giống nhất</option><option value="2">≥ ★★</option></select>
      <select id="hvl-hsk"><option value="">Mọi HSK</option>${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}">${n === 7 ? "HSK 7+" : "HSK " + n}</option>`).join("")}</select>
      <select id="hvl-dom"><option value="">Mọi lĩnh vực</option>${Object.entries(domains).filter(([k]) => items.some((i) => i.dom === k)).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select>
      <select id="hvl-sort"><option value="stars">Giống nhất trước</option><option value="hsk">HSK thấp trước</option><option value="dom">Theo lĩnh vực</option></select>
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
      hsk: (a, b) => a.hsk - b.hsk || b.stars - a.stars,
      dom: (a, b) => String(a.dom).localeCompare(String(b.dom)) || b.stars - a.stars,
    }[st.sort];
    return out.sort(cmp);
  }
  let current = [];
  function rowHtml(i, idx) {
    return `<div class="hvl-row" data-i="${idx}">
      <div class="hvl-main"><span class="hvl-han">${esc(i.han)}</span><span class="hvl-py">${esc(i.py)}</span><span class="hvl-eq">≈</span><span class="hvl-vn">${esc(i.vn || i.hv)}</span></div>
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
  const graded = syls.flatMap((s) => [s.init, s.final, s.tone]).filter((x) => x.status !== "na");
  const okCount = graded.filter((x) => x.status === "ok").length;
  const exCount = graded.length - okCount;

  let html = `<div class="hv-summary">Từ âm Hán-Việt <b>${esc(a.hv.join(" "))}</b>, đoán đúng <b>${okCount}/${graded.length}</b> yếu tố của pinyin <b>${esc(a.py.join(" "))}</b>${exCount ? ` · ⚠ ${exCount} ngoại lệ` : " · không có ngoại lệ"}.</div>`;
  html += syls.map(syllableCard).join("");

  const { bySyl, byHan } = buildIndex(rows, appWords);
  const me = byHan.get(a.hanStr);
  if (me && me.kind !== "same" && me.note) html += `<div class="hv-warn">${KIND_BADGE[me.kind] || ""}: ${esc(me.note)}</div>`;

  const related = [];
  for (const s of new Set(a.hv)) {
    const list = (bySyl.get(s) || []).filter((e) => e.han !== a.hanStr)
      .sort((x, y) => (y.stt ? 1 : 0) - (x.stt ? 1 : 0) || x.hsk - y.hsk || x.han.length - y.han.length)
      .slice(0, 8);
    if (list.length) related.push(`<div class="hv-fam"><div class="hv-fam-title">Cùng âm gốc <b>${esc(s)}</b></div><div class="hv-fam-list">${list.map((e) => `
      <span class="hv-word ${e.stt ? "link" : ""}" ${e.stt ? `data-stt="${e.stt}"` : ""}><span class="hv-word-han">${esc(e.han)}</span><span class="hv-word-py">${esc(e.py)}</span><span class="hv-word-vn">${esc(e.hv.split(" ").map((x) => (x === s ? `[${x}]` : x)).join(" "))} · ${esc(e.vi)}</span>${e.kind && e.kind !== "same" ? `<span class="hv-flag">${KIND_BADGE[e.kind] || ""}</span>` : ""}</span>`).join("")}</div></div>`);
  }
  html += related.join("");
  html += `<details class="hv-help"><summary>Cách đọc hộp này</summary><div>Tỉ lệ lấy từ ${rules.n} cặp chữ–âm đã đối chiếu. ✓ = khớp quy luật thường gặp (≥10%), ⚠ = ngoại lệ hoặc rất hiếm. Đây là mẹo đoán, không thay thế việc học pinyin: vần và thanh điệu đoán khá chắc, âm đầu kém chắc hơn.</div></details>`;

  box.innerHTML = html;
  blockEl.hidden = false;
  box.querySelectorAll(".hv-word.link").forEach((el) => el.addEventListener("click", () => { location.hash = `#/word/${el.dataset.stt}`; }));
}
