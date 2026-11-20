// "Hack Hán-Việt": 10 initial-consonant rules with their root syllables (the
// learner's own table, corrected), a quick guess-the-pinyin drill, HSK 4–6
// compounds, word-order reversals and false friends.
import { zhSwitcher, hackTabs, sayZh, analyzeSyllable, syllableTags, loadHvData, pyParts, RULE_OF } from "./hanviet.js";
import { Store } from "./db.js";
import { COMPOUND_BASE } from "./data.js";
import { wireTileFlags } from "./vocab-tab.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

let corePromise = null;
const loadCore = () => (corePromise ||= fetch("data/hv-core.json").then((r) => r.json()));

const RULE_TIPS = {
  1: "Hầu hết → W (Văn→Wén, Vọng→Wàng). Nhóm Viên, Viện, Viễn, Vĩnh, Vận → Y (Yuán, Yuàn, Yuǎn, Yǒng, Yùn).",
  2: "Đ → D (Đại→Dà, Địa→Dì). Một số → T: Đồng, Đầu, Đặc, Đề, Đồ, Đoàn (Tóng, Tóu, Tè, Tí, Tú, Tuán).",
  3: "Th → Sh là phổ biến nhất (Thời→Shí, Thư→Shū). Thiên, Thiết, Thông, Thống, Thái, Thể → T. Thành, Thừa, Thường → Ch. Ngoại lệ → Q: Thanh→Qīng, Thân 亲→Qīn.",
  4: "Nh → R (Nhân→Rén, Nhật→Rì, Nhiệt→Rè). Nhã, Nhạc, Nhãn → Y. Nhi, Nhĩ → Er.",
  5: "T + vần i/iê/inh → X, Q hoặc J (Tâm→Xīn, Tình→Qíng, Tích→Jī). T + vần khác → Z, S hoặc C (Tự→Zì, Tạo→Zào, Tốc→Sù, Tài→Cái).",
  6: "Ph → F (Pháp→Fǎ, Phát→Fā, Phí→Fèi). Ngoại lệ → P: Phẩm, Phê, Phối, Phổ, Phá, Phán (Pǐn, Pī, Pèi, Pǔ, Pò, Pàn).",
  7: "K và Gi + vần i/iê → J (Kinh→Jīng, Giải→Jiě). C và Qu → G (Công→Gōng, Quốc→Guó). Kh → Q hoặc K (Khí→Qì, Khởi→Qǐ).",
  8: "Ng → W (Ngã→Wǒ, Ngũ→Wǔ, Ngoại→Wài). Ngh và Ng + vần i/iê/ữ/ôn → Y (Nghĩa→Yì, Ngôn→Yán, Ngữ→Yǔ).",
  9: "Tr, Ch → Zh (Trung→Zhōng, Chủ→Zhǔ, Chính→Zhèng). Truyền, Trường, Triều → Ch. S, X → Ch hoặc Sh (Xuất→Chū, Siêu→Chāo).",
  10: "H + vần i/iê/inh/anh/ọc → X (Học→Xué, Hình→Xíng, Hiện→Xiàn). Số còn lại giữ H (Hải→Hǎi, Hậu→Hòu, Hóa→Huà, Hội→Huì).",
};

function analyze(root, rules) {
  return analyzeSyllable(root.han, root.hv.toLowerCase(), root.py, rules);
}
const rootTags = (root, rules) => syllableTags(analyze(root, rules));

// Some roots have two characters/readings ("员 / 园", "Yuán" or "Shēn / Qīn"): split them
// so each reading can be analysed and drilled on its own.
function expand(root) {
  const hs = root.han.split(" / "), ps = root.py.split(" / ");
  if (ps.length > 1 && hs.length === ps.length) return hs.map((h, i) => ({ ...root, han: h, py: ps[i] }));
  if (ps.length > 1) return [{ ...root, py: ps[0] }];
  return [{ ...root, han: hs[0], py: ps[0] }];
}
const hasException = (root, rules) => expand(root).some((v) => analyze(v, rules).init.status === "ex");

// ---------------- drill ----------------
function buildPool(rows, core) {
  const set = new Set();
  const add = (py) => String(py).split(/\s+/).forEach((s) => { if (s) set.add(s.toLowerCase()); });
  core.rules.forEach((r) => r.roots.forEach((x) => add(x.py)));
  rows.forEach((r) => add(r[1]));
  return [...set].map((s) => ({ s, ...pyParts(s) }));
}

function distractors(correct, pool) {
  const c = pyParts(correct);
  const scored = pool.filter((p) => p.s !== correct.toLowerCase()).map((p) => ({ p, sc: (p.init === c.init ? 1 : 0) + (p.rest === c.rest ? 2 : 0) + (p.tone === c.tone ? 1 : 0) + Math.random() * 0.5 }));
  return scored.sort((a, b) => b.sc - a.sc).slice(0, 3).map((x) => x.p.s);
}

function runDrill(host, roots, ctx, onExit) {
  const { rules, pool, title } = ctx;
  let queue = shuffle(roots).slice(0, 10), i = 0, score = 0;
  const missed = [];

  function question() {
    if (i >= queue.length) return summary();
    const r = queue[i];
    const ruleId = RULE_OF[analyze(r, rules).init.hvInit];
    const opts = shuffle([r.py, ...distractors(r.py, pool)]);
    host.innerHTML = `
      <div class="hk-drill">
        <div class="row between"><strong>${esc(title)}</strong><span class="chip">Câu ${i + 1}/${queue.length} · đúng ${score}</span></div>
        <div class="hk-q-label">Âm Hán-Việt</div>
        <div class="hk-q-big">${esc(r.hv)}</div>
        <div class="hk-q-meaning">nghĩa: ${esc(r.vi)}${ruleId ? ` · Quy luật ${ruleId}` : ""}</div>
        <div class="hk-opts">${opts.map((o) => `<button class="hk-opt" data-py="${esc(o)}">${esc(o)}</button>`).join("")}</div>
        <div class="hk-feedback" id="hk-fb"></div>
        <button class="btn block mt-16" id="hk-exit" style="background:transparent;color:var(--text-muted);border:1px solid var(--border)">Thoát luyện tập</button>
      </div>`;
    host.querySelector("#hk-exit").addEventListener("click", onExit);
    host.querySelectorAll(".hk-opt").forEach((b) => b.addEventListener("click", () => answer(b, r)));
  }

  function answer(btn, r) {
    const ok = btn.dataset.py === r.py;
    host.querySelectorAll(".hk-opt").forEach((b) => { b.disabled = true; if (b.dataset.py === r.py) b.classList.add("good"); });
    if (!ok) btn.classList.add("bad");
    if (ok) score++; else missed.push(r);
    const fb = host.querySelector("#hk-fb");
    fb.innerHTML = `<div class="hk-fb-head ${ok ? "good" : "bad"}">${ok ? "Đúng rồi!" : "Chưa đúng."} <b>${esc(r.hv)}</b> → <b>${esc(r.py)}</b> (${esc(r.han)}) <button class="speak-btn small" data-say="${encodeURIComponent(r.han.split(" / ")[0])}" title="Nghe">🔊</button></div><div class="hv-tags">${rootTags(r, rules)}</div>
      <button class="btn block mt-16" id="hk-next">${i + 1 >= queue.length ? "Xem kết quả" : "Câu tiếp →"}</button>`;
    fb.querySelector("#hk-next").addEventListener("click", () => { i++; question(); });
  }

  function summary() {
    host.innerHTML = `<div class="hk-drill">
      <h3 style="margin:0 0 6px">Kết quả: ${score}/${queue.length}</h3>
      ${missed.length ? `<div class="text-muted" style="font-size:13px;margin-bottom:6px">Cần ôn lại:</div>${missed.map((r) => `<div class="hk-miss"><b>${esc(r.hv)}</b> → <b>${esc(r.py)}</b> ${esc(r.han)} <button class="speak-btn small" data-say="${encodeURIComponent(r.han.split(" / ")[0])}" title="Nghe">🔊</button> <span class="hv-tags">${rootTags(r, rules)}</span></div>`).join("")}` : `<div class="hk-fb-head good">Hoàn hảo, không sai câu nào!</div>`}
      <div class="row gap mt-16"><button class="btn block" id="hk-again">Làm lại</button>${missed.length ? `<button class="btn ghost block" id="hk-redo">Chỉ luyện phần sai</button>` : ""}</div>
      <button class="btn block mt-16" id="hk-exit2" style="background:transparent;color:var(--text-muted);border:1px solid var(--border)">Về danh sách luật</button></div>`;
    host.querySelector("#hk-again").addEventListener("click", () => runDrill(host, roots, ctx, onExit));
    host.querySelector("#hk-redo")?.addEventListener("click", () => runDrill(host, missed, ctx, onExit));
    host.querySelector("#hk-exit2").addEventListener("click", onExit);
  }
  question();
}

// ---------------- page ----------------
export async function renderHvHack(root) {
  root.innerHTML = `${zhSwitcher("hack")}${hackTabs("rules")}<div id="hk-page" class="text-muted">Đang tải...</div>`;
  const [core, hv] = await Promise.all([loadCore(), loadHvData()]);
  const { rules, rows } = hv;
  const page = root.querySelector("#hk-page");
  if (!rules) { page.textContent = "Chưa tải được dữ liệu."; return; }
  page.className = "";
  const pool = buildPool(rows, core);
  const allRoots = core.rules.flatMap((r) => r.roots.flatMap(expand));

  const ruleCard = (r) => `
    <details class="hk-card" data-rule="${r.id}">
      <summary><span class="hk-num">${r.id}</span><span class="hk-title">${esc(r.title.replace(/^Âm đầu\s*/, "").replace("->", "→"))}</span><span class="chip">${r.roots.length} chữ</span></summary>
      <div class="hk-tip">${esc(RULE_TIPS[r.id] || "")}</div>
      <button class="btn ghost hk-drill-btn" data-rule="${r.id}">🎯 Luyện luật này</button>
      <div class="hk-roots">${r.roots.map((x) => `
        <div class="hk-root"><span class="hk-hv">${esc(x.hv)}</span><span class="hk-arrow">→</span><span class="hk-han">${esc(x.han)}</span><b class="hk-py">${esc(x.py)}</b><button class="speak-btn small" data-say="${encodeURIComponent(x.han.split(" / ")[0])}" title="Nghe">🔊</button><span class="hk-vi">${esc(x.vi)}</span>${hasException(x, rules) ? `<span class="hv-tag ex">⚠ ngoại lệ</span>` : ""}</div>`).join("")}
      </div>
    </details>`;

  page.innerHTML = `
    <h2 style="margin:8px 0 4px">🔗 Hack Hán-Việt</h2>
    <p class="text-muted" style="font-size:13px;margin:0 0 10px">Nhìn âm Hán-Việt là đoán được pinyin: <b>thời → shí</b>, <b>kinh tế → jīngjì</b>. Học 10 quy luật dưới đây, luyện đoán vài lượt là quen. Chữ nào đi ngược quy luật thì gắn ⚠ ngoại lệ.</p>
    <div class="hk-steps">
      <div><b>① Âm đầu</b><span>Tra 1 trong 10 quy luật bên dưới.</span></div>
      <div><b>② Vần cuối</b><span>-n → -n · -ng → -ng · -nh → -ng · -m → -n · -c/-t/-ch/-p → bỏ âm cuối.</span></div>
      <div><b>③ Thanh điệu</b><span>huyền → 2 · hỏi, ngã → 3 · nặng, sắc → 4 · ngang → 1 (đúng đa số, có ngoại lệ).</span></div>
    </div>
    <button class="btn block mt-16" id="hk-all">🎯 Luyện đoán pinyin (tất cả luật)</button>
    <div id="hk-drill-host"></div>
    <h3 class="hk-h3">10 quy luật âm đầu</h3>
    ${core.rules.map(ruleCard).join("")}
    <a href="#/hv/words" class="hv-entry"><span class="emoji">📘</span><div class="txt"><strong>Từ ghép HSK 4–6 — học đầy đủ</strong><span>${core.compounds.reduce((s, g) => s + g.items.length, 0)} từ ghép áp dụng ngay các luật trên: pinyin, nghĩa, nghe, nói, ví dụ, nét viết như 625 từ.</span></div></a>
    <h3 class="hk-h3">Đảo trật tự: tiếng Việt ghép ngược</h3>
    <div class="hk-list">${core.reverse.map((x) => `<div class="hk-line"><b>${esc(x.han)}</b> ${esc(x.py)} — Hán-Việt đọc <i>${esc(x.hvChinese)}</i>, tiếng Việt nói <b>${esc(x.vn)}</b> (${esc(x.vi)})</div>`).join("")}</div>
    <p class="text-muted" style="font-size:12.5px;margin:8px 0 4px">Những từ này <b>không</b> đảo, dùng thẳng được: ${core.sameOrder.map((x) => `${esc(x.vn)} = ${esc(x.han)}`).join(" · ")}.</p>
    <h3 class="hk-h3">Bạn giả: giống mà nghĩa khác</h3>
    <div class="hk-list">${core.falseFriends.map((x) => `<div class="hk-line"><b>${esc(x.han)}</b> ${esc(x.py)} ≈ "${esc(x.vn)}" <span class="hv-tag ex">⚠ ${esc(x.trap)}</span></div>`).join("")}</div>
    <a href="#/hv/all" class="text-muted" style="display:block;margin-top:18px;font-size:13px">Kho từ mở rộng (${rows.length} từ do máy sinh, chưa rà kỹ) →</a>`;

  page.addEventListener("click", (e) => { const b = e.target.closest("[data-say]"); if (b) sayZh(decodeURIComponent(b.dataset.say)); });
  const host = page.querySelector("#hk-drill-host");
  const exit = () => { host.innerHTML = ""; page.querySelector("#hk-all").hidden = false; window.scrollTo(0, 0); };
  const start = (roots, title) => { page.querySelector("#hk-all").hidden = true; runDrill(host, roots, { rules, pool, title }, exit); host.scrollIntoView({ block: "start" }); };
  page.querySelector("#hk-all").addEventListener("click", () => start(allRoots, "Luyện đoán pinyin"));
  page.querySelectorAll(".hk-drill-btn").forEach((b) => b.addEventListener("click", (e) => {
    e.preventDefault();
    const r = core.rules.find((x) => x.id === Number(b.dataset.rule));
    start(r.roots.flatMap(expand), `Luật ${r.id}: ${r.title.replace(/^Âm đầu\s*/, "").replace("->", "→")}`);
  }));
}

// ---------------- compound words: full learning cards ----------------
const statusOf = (p) => (p ? (p.status === "learned" ? "learned" : p.status === "learning" ? "learning" : "") : "");

export async function renderCompounds(root, ctx) {
  const items = ctx.extra || [];
  root.innerHTML = `${zhSwitcher("hack")}${hackTabs("words")}<div id="cp-page" class="text-muted">Đang tải...</div>`;
  const page = root.querySelector("#cp-page");
  if (!items.length) { page.textContent = "Chưa có dữ liệu từ ghép."; return; }
  const progress = new Map((await Store.getAllProgress(ctx.lang)).map((p) => [p.stt, p]));
  const groups = new Map();
  for (const w of items) { if (!groups.has(w.group)) groups.set(w.group, []); groups.get(w.group).push(w); }
  const learnedIn = (list) => list.filter((w) => progress.get(w.stt)?.status === "learned").length;
  page.className = "";
  page.innerHTML = `
    <h2 style="margin:8px 0 4px">📘 Từ ghép HSK 4–6</h2>
    <p class="text-muted" style="font-size:13px;margin:0 0 10px">Mỗi từ ghép là một thẻ học đầy đủ như 625 từ: pinyin, nghĩa, nghe 🔊, nói 🎤, ví dụ, nét viết, mẹo Hán-Việt và đánh dấu đã học. Đã thuộc <b>${learnedIn(items)}/${items.length}</b>.</p>
    ${[...groups].map(([name, list]) => `
      <div class="row between mt-16"><h3 class="hk-h3" style="margin:0">${esc(name)}</h3><span class="chip">${learnedIn(list)}/${list.length} thuộc</span></div>
      <div class="word-grid">${list.map((w) => `
        <div class="word-tile" data-nav="#/word/${w.stt}">
          <button class="tile-flag ${progress.get(w.stt)?.flag ? "on" : ""}" data-flag-stt="${w.stt}" title="Gắn/bỏ cờ từ này" aria-label="Gắn cờ">🚩</button>
          <span class="status-dot ${statusOf(progress.get(w.stt))}"></span>
          <div class="target">${esc(w.target)}</div><div class="pron">${esc(w.pron)}</div><div class="meaning">${esc(w.meaning)}</div>
        </div>`).join("")}</div>`).join("")}
    <a href="#/hv/all" class="text-muted" style="display:block;margin-top:18px;font-size:13px">Kho từ mở rộng (tra cứu thêm) →</a>`;
  page.querySelectorAll(".word-tile").forEach((el) => el.addEventListener("click", () => { location.hash = el.dataset.nav; }));
  wireTileFlags(page, ctx.lang);
}