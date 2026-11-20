// "Họ từ đồng âm": group the 625 core words by a shared Hán-Việt syllable
// (时间, 时候, 小时 all contain "thời") so one root helps remember many words.
// Word order and progress ids are untouched — this is only another view.
import { Store } from "./db.js";
import { speak } from "./tts.js";
import { LANG_META } from "./data.js";
import { alignWord, zhSwitcher } from "./hanviet.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const norm = (s) => s.normalize("NFC").toLowerCase();

export function familyToggle(active) {
  return `<div class="seg-row">
    <a href="#/batches" class="seg ${active === "batches" ? "active" : ""}">📚 Theo nhóm 20 từ</a>
    <a href="#/family" class="seg ${active === "family" ? "active" : ""}">🔗 Theo họ từ đồng âm</a>
  </div>`;
}

let memo = { words: null, data: null };
function analyzeAll(words) {
  if (memo.words === words) return memo.data;
  const items = [];
  for (const w of words) {
    const a = alignWord(w);
    if (a) items.push({ w, a, syls: [...new Set(a.hv.map(norm))] });
  }
  return (memo = { words, data: items }).data;
}

// Every core word containing this Hán-Việt syllable (used by the family page).
export function familyMembers(words, syl) {
  const s = norm(syl);
  return analyzeAll(words).filter((it) => it.syls.includes(s));
}

// Greedy grouping for browsing: biggest shared syllable first, each word once.
export function buildFamilies(words) {
  const items = analyzeAll(words);
  const left = new Set(items.map((_, i) => i));
  const groups = [];
  for (;;) {
    const cnt = new Map();
    for (const i of left) for (const s of items[i].syls) (cnt.get(s) || cnt.set(s, []).get(s)).push(i);
    let best = null;
    for (const [s, list] of cnt) if (list.length >= 2 && (!best || list.length > best.list.length)) best = { s, list };
    if (!best) break;
    groups.push({ syl: best.s, items: best.list.map((i) => items[i]) });
    best.list.forEach((i) => left.delete(i));
  }
  groups.sort((a, b) => b.items.length - a.items.length || a.syl.localeCompare(b.syl, "vi"));
  const singles = [...left].map((i) => items[i]);
  const noHv = words.filter((w) => !alignWord(w));
  return { groups, singles, noHv };
}

const rootChars = (items, syl) => [...new Set(items.flatMap((it) => it.a.hv.map((h, i) => (norm(h) === norm(syl) ? it.a.han[i] : null)).filter(Boolean)))];

export async function renderFamilyList(root, ctx) {
  const { lang, words } = ctx;
  const progress = new Map((await Store.getAllProgress(lang)).map((p) => [p.stt, p]));
  const { groups, singles, noHv } = buildFamilies(words);
  const done = (items) => items.filter((it) => progress.get(it.w.stt)?.status === "learned").length;

  root.innerHTML = `${zhSwitcher("speed")}${familyToggle("family")}
    <h2 style="margin:10px 0 4px">🔗 Họ từ đồng âm</h2>
    <p class="text-muted" style="font-size:13px;margin:0 0 10px">Các từ trong 625 từ Tốc Biến được gom theo <b>âm Hán-Việt gốc</b> chung. Học cả họ một lượt: nhớ một chữ gốc là nhớ được nhiều từ. (${groups.length} họ từ gồm ${groups.reduce((s, g) => s + g.items.length, 0)} từ.)</p>
    <input class="search-box" id="fam-q" placeholder="Tìm âm gốc, chữ Hán hoặc nghĩa..." />
    <div id="fam-list" style="margin-top:10px"></div>
    <div class="text-muted" style="font-size:12.5px;margin-top:14px">Còn ${singles.length} từ chưa có từ nào cùng âm gốc trong 625 từ, và ${noHv.length} từ không có âm Hán-Việt (ví dụ 我们, 他们) nên không nằm trong các họ từ.</div>`;

  const list = root.querySelector("#fam-list");
  const draw = (q = "") => {
    const f = q.trim().toLowerCase();
    const shown = groups.filter((g) => !f || g.syl.includes(f) || rootChars(g.items, g.syl).join("").includes(f) || g.items.some((it) => it.w.target.includes(f) || it.w.meaning.toLowerCase().includes(f)));
    list.innerHTML = shown.map((g) => `
      <a href="#/family/${encodeURIComponent(g.syl)}" class="fam-card">
        <div class="fam-card-head"><span class="fam-root">${esc(g.syl)}</span><span class="fam-chars">${esc(rootChars(g.items, g.syl).join(" "))}</span><span class="chip">${done(g.items)}/${g.items.length} thuộc</span></div>
        <div class="fam-preview">${g.items.map((it) => `<span>${esc(it.w.target.split(" / ")[0])}</span>`).join("")}</div>
      </a>`).join("") || `<div class="empty-state">Không có họ từ nào khớp.</div>`;
  };
  draw();
  root.querySelector("#fam-q").addEventListener("input", (e) => draw(e.target.value));
}

export async function renderFamily(root, ctx, syl) {
  const { lang, words } = ctx;
  const meta = LANG_META[lang];
  const members = familyMembers(words, syl);
  if (!members.length) { root.innerHTML = `${zhSwitcher("speed")}${familyToggle("family")}<div class="empty-state">Không có từ nào chứa âm gốc "${esc(syl)}" trong 625 từ.</div>`; return; }
  const progress = new Map((await Store.getAllProgress(lang)).map((p) => [p.stt, p]));
  const chars = rootChars(members, syl);

  root.innerHTML = `${zhSwitcher("speed")}${familyToggle("family")}
    <a href="#/family" class="text-muted" style="text-decoration:none;font-size:13px">← Tất cả họ từ</a>
    <div class="fam-hero"><span class="fam-root big">${esc(syl)}</span><span class="fam-chars big">${esc(chars.join(" "))}</span></div>
    <p class="text-muted" style="font-size:13px;margin:0 0 10px">Âm gốc <b>${esc(syl)}</b> có mặt trong <b>${members.length}</b> từ. Đọc lướt cả họ rồi đánh dấu: ⭐ đang học, ⏭ đã biết.</p>
    <div id="fam-words"></div>`;

  const box = root.querySelector("#fam-words");
  // Same sound, different characters (死 / 子 / 紫 all "tử") are different roots:
  // keep words of the same character together, biggest character first.
  const byChar = new Map();
  for (const m of members) {
    const i = m.a.hv.findIndex((h) => norm(h) === norm(syl));
    const key = m.a.han[i];
    if (!byChar.has(key)) byChar.set(key, { ch: key, py: m.a.py[i], list: [] });
    byChar.get(key).list.push(m);
  }
  const sections = [...byChar.values()].sort((x, y) => y.list.length - x.list.length);
  const rowHtml = ({ w, a }) => {
    const st = progress.get(w.stt)?.status;
    const ex = w.exampleList?.[0];
    return `
      <div class="fam-word" data-stt="${w.stt}">
        <div class="fam-main"><span class="fam-han">${esc(w.target.split(" / ")[0])}</span><span class="fam-py">${esc(w.pron.split(" / ")[0])}</span><button class="speak-btn small" data-say="${encodeURIComponent(w.target.split(" / ")[0])}">🔊</button></div>
        <div class="fam-hv">${a.hv.map((h) => (norm(h) === norm(syl) ? `<b class="fam-hit">${esc(h)}</b>` : esc(h))).join(" ")} <span class="text-muted">· ${esc(w.meaning)}</span></div>
        ${ex ? `<div class="fam-ex">${esc(ex.target)}<br><span class="text-muted">${esc(ex.vi)}</span></div>` : ""}
        <div class="fam-actions">
          <button class="fam-btn ${st === "learning" ? "on" : ""}" data-set="learning">⭐ Đang học</button>
          <button class="fam-btn ${st === "learned" ? "on" : ""}" data-set="learned">⏭ Biết rồi</button>
          <a href="#/word/${w.stt}" class="fam-more">Chi tiết →</a>
        </div>
      </div>`;
  };
  box.innerHTML = sections.map((s) => `
    <div class="fam-sec"><span class="fam-sec-han">${esc(s.ch)}</span><span class="fam-sec-py">${esc(s.py)}</span><span class="text-muted">${s.list.length} từ chứa chữ này</span></div>
    ${s.list.map(rowHtml).join("")}`).join("");

  box.querySelectorAll("[data-say]").forEach((b) => b.addEventListener("click", () => speak(decodeURIComponent(b.dataset.say), meta.voiceLang)));
  box.querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", async () => {
    const row = b.closest(".fam-word");
    await Store.setStatus(lang, Number(row.dataset.stt), b.dataset.set);
    row.querySelectorAll("[data-set]").forEach((x) => x.classList.toggle("on", x === b));
  }));
}
