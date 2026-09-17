import { Store } from "./db.js";
import { speak, missingVoiceMessage } from "./tts.js";
import { mascotSay } from "./mascot.js";
import { LANG_META } from "./data.js";

const BATCH_SIZE = 20;

const SUBTABS = [
  { id: "list", label: "Danh sách", emoji: "📋", desc: "Từ đã học & đang học", cls: "c1" },
  { id: "flash", label: "Flashcard", emoji: "🗂️", desc: "Lật thẻ ôn nhanh", cls: "c2" },
  { id: "listen", label: "Nghe chọn từ", emoji: "🎧", desc: "Nghe rồi chọn đúng nghĩa", cls: "c3" },
  { id: "story", label: "Chuyện chêm", emoji: "📖", desc: "Đọc chuyện xen từ đã học", cls: "c4" },
];

export async function renderReview(root, ctx, sub) {
  if (!sub) {
    const progressAll = await Store.getAllProgress(ctx.lang);
    const now = Date.now();
    const dueCount = progressAll.filter((p) => (p.srs?.due ?? 0) <= now).length;

    let html = `<h2 style="margin:0 0 4px">Ôn tập</h2><p class="text-muted" style="font-size:13px;margin:0 0 14px">Chọn một mục để ôn tập nhé!</p>`;
    html += `<div class="review-hub">`;
    SUBTABS.forEach((t) => {
      const desc = t.id === "listen" && dueCount > 0 ? `${dueCount} từ cần ôn hôm nay` : t.desc;
      html += `<a href="#/review/${t.id}" class="review-tile ${t.cls}"><span class="emoji">${t.emoji}</span><strong>${t.label}</strong><span>${desc}</span></a>`;
    });
    html += `</div>`;
    root.innerHTML = html;
    return;
  }

  let html = `<a href="#/review" class="review-back">← Ôn tập</a><div id="review-body"></div>`;
  root.innerHTML = html;

  const body = document.getElementById("review-body");
  if (sub === "list") return renderList(body, ctx);
  if (sub === "flash") return renderFlash(body, ctx);
  if (sub === "listen") return renderListenQuiz(body, ctx);
  if (sub === "story") return renderStory(body, ctx);
}

async function renderList(root, ctx) {
  const { lang, words } = ctx;
  const progressAll = await Store.getAllProgress(lang);
  const progressMap = new Map(progressAll.map((p) => [p.stt, p]));

  const learned = words.filter((w) => progressMap.get(w.stt)?.status === "learned").sort((a, b) => (progressMap.get(b.stt)?.lastSeen || 0) - (progressMap.get(a.stt)?.lastSeen || 0));
  const learning = words.filter((w) => {
    const p = progressMap.get(w.stt);
    return p && p.status !== "learned";
  }).sort((a, b) => (progressMap.get(b.stt)?.lastSeen || 0) - (progressMap.get(a.stt)?.lastSeen || 0));

  let html = `<input class="search-box" id="search" placeholder="Tìm từ..." />`;
  html += `<div class="two-col">
    <div>
      <h4>Đã học (${learned.length})</h4>
      <div id="col-learned"></div>
    </div>
    <div>
      <h4>Đang học (${learning.length})</h4>
      <div id="col-learning"></div>
    </div>
  </div>`;
  root.innerHTML = html;

  function row(w) {
    const p = progressMap.get(w.stt);
    return `<div class="word-row" data-stt="${w.stt}"><span class="l">${p?.flag ? "🚩" : ""}${w.target}</span><span class="r">${w.meaning}</span></div>`;
  }
  function draw(filter = "") {
    const f = filter.trim().toLowerCase();
    const matchFn = (w) => !f || w.target.toLowerCase().includes(f) || w.en.toLowerCase().includes(f) || w.meaning.toLowerCase().includes(f);
    document.getElementById("col-learned").innerHTML = learned.filter(matchFn).map(row).join("") || `<div class="text-muted" style="font-size:13px">Chưa có từ nào</div>`;
    document.getElementById("col-learning").innerHTML = learning.filter(matchFn).map(row).join("") || `<div class="text-muted" style="font-size:13px">Chưa có từ nào</div>`;
    root.querySelectorAll(".word-row").forEach((el) => el.addEventListener("click", () => { location.hash = `#/word/${el.dataset.stt}`; }));
  }
  draw();
  document.getElementById("search").addEventListener("input", (e) => draw(e.target.value));
}

async function renderFlash(root, ctx) {
  const { lang, words } = ctx;
  const progressAll = await Store.getAllProgress(lang);
  const progressMap = new Map(progressAll.map((p) => [p.stt, p]));
  const flagged = words.filter((w) => progressMap.get(w.stt)?.flag);
  const rest = words.filter((w) => !progressMap.get(w.stt)?.flag && progressMap.get(w.stt));
  const deck = [...flagged, ...rest];

  if (!deck.length) {
    root.innerHTML = `<div class="empty-state"><div class="big-emoji">📇</div>Ký chủ chưa có từ nào để ôn — học vài từ ở Tab Từ vựng trước nhé!</div>`;
    return;
  }
  let idx = 0;
  let flipped = false;
  const meta = LANG_META[lang];

  function draw() {
    const w = deck[idx];
    const p = progressMap.get(w.stt);
    root.innerHTML = `
      <div class="card flash-card" id="flash-card">
        ${p?.flag ? `<span style="position:absolute;top:14px;left:14px">🚩</span>` : ""}
        ${!flipped
          ? `<div class="big">${w.en}</div><div class="hint">Bấm thẻ để lật</div>`
          : `<div class="big">${w.target}</div><div class="sub">${w.pron} · ${w.meaning}</div><div class="hint">Bấm thẻ để lật lại</div>`}
      </div>
      <div class="row" style="justify-content:center;margin:6px 0"><button class="speak-btn" id="flash-speak">🔊</button></div>
      <div class="flash-nav">
        <button class="btn secondary block" id="flash-prev">← Trước</button>
        <button class="btn block" id="flash-next">Tiếp →</button>
      </div>
      <div class="text-center text-muted" style="font-size:12px;margin-top:8px">${idx + 1} / ${deck.length}</div>
    `;
    document.getElementById("flash-card").addEventListener("click", () => { flipped = !flipped; draw(); });
    document.getElementById("flash-speak").addEventListener("click", (e) => { e.stopPropagation(); speak(w.target, meta.voiceLang); });
    document.getElementById("flash-prev").addEventListener("click", () => { idx = (idx - 1 + deck.length) % deck.length; flipped = false; draw(); });
    document.getElementById("flash-next").addEventListener("click", () => { idx = (idx + 1) % deck.length; flipped = false; draw(); });
  }
  draw();
}

function pickDistractors(words, correct, n = 3) {
  const pool = words.filter((w) => w.stt !== correct.stt);
  const picked = [];
  while (picked.length < n && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}

async function renderListenQuiz(root, ctx) {
  const { lang, words } = ctx;
  const progressAll = await Store.getAllProgress(lang);
  const progressMap = new Map(progressAll.map((p) => [p.stt, p]));
  const known = words.filter((w) => progressMap.get(w.stt));
  if (!known.length) {
    root.innerHTML = `<div class="empty-state"><div class="big-emoji">🎧</div>Ký chủ chưa có từ nào để luyện nghe — học vài từ ở Tab Từ vựng trước nhé!</div>`;
    return;
  }
  // Spaced repetition: prioritize words that are actually due; only fall
  // back to the full known pool once nothing is due yet (new learner).
  const now = Date.now();
  const due = known.filter((w) => (progressMap.get(w.stt)?.srs?.due ?? 0) <= now);
  const pool = due.length ? due : known;
  const meta = LANG_META[lang];
  let current = null;

  function next() {
    const w = pool[Math.floor(Math.random() * pool.length)];
    current = w;
    const choices = [w, ...pickDistractors(words, w, 3)].sort(() => Math.random() - 0.5);
    root.innerHTML = `
      <div class="card">
        <div class="row gap"><button class="btn round" id="quiz-play">🔊</button><span class="text-muted">Nghe rồi chọn đúng nghĩa</span></div>
        <div id="voice-warn" class="text-muted" style="font-size:12px"></div>
        <div class="choice-list">${choices.map((c) => `<button class="choice-btn" data-correct="${c.stt === w.stt}">${c.meaning}</button>`).join("")}</div>
        <div class="feedback-banner" id="fb"></div>
      </div>`;
    const play = async () => {
      const r = await speak(w.target, meta.voiceLang);
      if (!r.hadVoice) document.getElementById("voice-warn").textContent = missingVoiceMessage(meta.label);
    };
    document.getElementById("quiz-play").addEventListener("click", play);
    play();
    root.querySelectorAll(".choice-btn").forEach((btn) => btn.addEventListener("click", async () => {
      const correct = btn.dataset.correct === "true";
      btn.classList.add(correct ? "correct" : "wrong");
      const fb = document.getElementById("fb");
      fb.classList.add("show", correct ? "good" : "retry");
      fb.textContent = mascotSay(correct ? "correct" : "wrong");
      await Store.recordListenResult(lang, w.stt, correct);
      root.querySelectorAll(".choice-btn").forEach((b) => b.disabled = true);
      setTimeout(next, 1100);
    }));
  }
  next();
}

// "Chuyện chêm" — casual Vietnamese sentences with one known word dropped in
// per short continuous narrative (not disjointed one-liners), so the story
// reads as a single coherent scene. Pure client-side template substitution:
// no AI call, no API key, no cost, instant. Only ever pulls from words this
// chapter's learner has already started.
//
// Each skeleton is one whole mini-story with several {w} slots. The FIRST
// time a given word fills a slot it's bold + gets a pinyin/nghĩa gloss;
// later re-appearances of that same word (natural repetition, e.g. a
// pronoun) are plain — no re-bolding, no repeated gloss.
const STORY_SKELETONS = [
  "Sáng nay tôi dậy sớm, pha một cốc trà rồi mở sổ tay ra ôn từ {w}. Đang lẩm nhẩm {w} thì Gạo chạy tới, đuôi vẫy lia lịa, hỏi tôi học đến đâu rồi. Tôi khoe là vừa nhớ thêm được {w}, Gạo gật gù ra vẻ hài lòng lắm. Cả hai đi dạo một vòng, tôi vừa đi vừa lẩm bẩm {w} cho quen miệng. Đến lúc quay về, tôi vẫn còn nhớ rõ {w}, thấy trong lòng vui vui.",
  "Chiều nay tôi ngồi ở quán cà phê quen thuộc, mở sách ra ôn {w}. Cạnh bàn, Tom nằm cuộn tròn, thỉnh thoảng ngóc đầu lên nhìn tôi lẩm bẩm {w}. Tôi thử ghép {w} vào một câu tự nghĩ ra, đọc to lên cho Tom nghe. Nó vẫy đuôi như thể hiểu {w} thật vậy. Uống hết tách cà phê, tôi vẫn tủm tỉm cười vì nhớ được {w}.",
  "Tối qua bạn tôi gọi điện, hỏi dạo này học hành thế nào. Tôi khoe là vừa học được từ {w}, nghe hay lắm. Bạn tôi tò mò hỏi {w} nghĩa là gì, tôi giải thích một hồi. Nói chuyện được một lúc, tôi lại chêm thêm {w} vào câu cho vui miệng. Gác máy rồi, tôi vẫn ngồi lẩm nhẩm {w} một lúc lâu.",
  "Trước khi ngủ, tôi có thói quen viết vài dòng nhật ký. Hôm nay tôi viết: “Mình vừa học được từ {w}.” Viết xong tôi đọc lại, thấy {w} thật sự rất thú vị. Tôi gạch chân từ {w} để mai xem lại. Gấp sổ lại, trong đầu tôi vẫn còn vương vấn {w}.",
  "Trên đường đi học về, tôi vừa đi vừa ôn thầm {w}. Ngang qua tiệm sách, tôi ghé vào tìm cuốn nào có nhắc đến {w}. Cô bán hàng thấy tôi lẩm bẩm {w} thì cười, hỏi tôi đang học tiếng gì. Tôi khoe ngay {w}, giọng đầy tự hào. Về đến nhà, tôi vẫn còn nhớ như in {w}.",
];

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildStory(knownWords) {
  const skeleton = STORY_SKELETONS[Math.floor(Math.random() * STORY_SKELETONS.length)];
  const pool = shuffled(knownWords);
  const seen = new Set();
  let i = 0;
  return skeleton.replace(/\{w\}/g, () => {
    const w = pool[i % pool.length];
    i += 1;
    const isFirst = !seen.has(w.target);
    seen.add(w.target);
    const wordSpan = `<span class="story-word" data-t="${encodeURIComponent(w.target)}">${w.target}</span>`;
    if (!isFirst) return wordSpan;
    return `<b class="story-new">${wordSpan}</b> <i class="story-gloss">(${w.pron} — ${w.meaning})</i>`;
  });
}

async function renderStory(root, ctx) {
  const { lang, words } = ctx;
  const meta = LANG_META[lang];
  const totalChapters = Math.ceil(words.length / BATCH_SIZE);
  const progressAll = await Store.getAllProgress(lang);
  const progressMap = new Map(progressAll.map((p) => [p.stt, p]));

  const savedChapter = await Store.getMeta(`story_chapter_${lang}`);
  let chapter = savedChapter !== null ? Number(savedChapter) : 0;

  async function draw() {
    chapter = Math.max(0, Math.min(totalChapters - 1, chapter));
    await Store.setMeta(`story_chapter_${lang}`, chapter);

    const start = chapter * BATCH_SIZE;
    const batchWords = words.slice(start, start + BATCH_SIZE);
    const knownWords = batchWords.filter((w) => {
      const p = progressMap.get(w.stt);
      return p && p.status !== "new";
    });

    let html = `
      <div class="row between" style="margin-bottom:10px">
        <button class="btn secondary" id="ch-prev" ${chapter === 0 ? "disabled" : ""}>← Chương trước</button>
        <strong>Chương ${chapter + 1} · Nhóm ${chapter + 1}</strong>
        <button class="btn secondary" id="ch-next" ${chapter === totalChapters - 1 ? "disabled" : ""}>Chương sau →</button>
      </div>`;

    if (knownWords.length < 3) {
      html += `<div class="empty-state"><div class="big-emoji">📖</div>Ký chủ mới thuộc ${knownWords.length}/${batchWords.length} từ trong Nhóm ${chapter + 1} — học thêm vài từ ở Tab Từ vựng rồi quay lại đọc chuyện nhé!</div>`;
      root.innerHTML = html;
      wireChapterNav();
      return;
    }

    html += `<div id="story-area"></div>`;
    root.innerHTML = html;
    wireChapterNav();
    const area = document.getElementById("story-area");

    function renderText() {
      area.innerHTML = `
        <div class="card story-card"><p>${buildStory(knownWords)}</p></div>
        <button class="btn ghost block mt-16" id="story-regen">🔄 Đổi câu chuyện khác</button>
        <div class="text-center text-muted" style="font-size:12px;margin-top:8px">Bấm vào từ trong chuyện để nghe phát âm</div>
      `;
      area.querySelectorAll(".story-word").forEach((el) => {
        el.addEventListener("click", () => speak(decodeURIComponent(el.dataset.t), meta.voiceLang));
      });
      document.getElementById("story-regen").addEventListener("click", renderText);
    }

    renderText();
  }

  function wireChapterNav() {
    document.getElementById("ch-prev")?.addEventListener("click", () => { chapter -= 1; draw(); });
    document.getElementById("ch-next")?.addEventListener("click", () => { chapter += 1; draw(); });
  }

  draw();
}
