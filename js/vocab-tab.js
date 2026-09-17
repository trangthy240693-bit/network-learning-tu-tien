import { Store } from "./db.js";
import { speak, isTtsSupported, hasVoiceFor, missingVoiceMessage } from "./tts.js";
import { createRecognizer, isSttSupported } from "./stt.js";
import { mascotBubble, mascotSay } from "./mascot.js";
import { LANG_META } from "./data.js";
import { rankForPct, nextRank } from "./ranks.js";

const BATCH_SIZE = 20;

// ---------- Visual mnemonics for the Từ vựng detail screen ----------
// A curated English-keyword → emoji map for a quick "visual anchor" next to
// the meaning. Only used when there's a confident match — no guessing, so
// abstract/rare words simply show no icon rather than a wrong one.
const EMOJI_MAP = {
  "i": "🙋", "me": "🙋", "you": "👉", "he": "👨", "she": "👩", "it": "📦",
  "we": "🧑‍🤝‍🧑", "they": "👥", "this": "👇", "that": "👉",
  "who": "❓", "what": "❓", "where": "📍", "when": "⏰", "why": "❓", "how": "❓",
  "one": "1️⃣", "two": "2️⃣", "three": "3️⃣", "four": "4️⃣", "five": "5️⃣",
  "six": "6️⃣", "seven": "7️⃣", "eight": "8️⃣", "nine": "9️⃣", "ten": "🔟",
  "hundred": "💯", "thousand": "🔢",
  "today": "📅", "tomorrow": "🌅", "yesterday": "🌇", "morning": "🌄",
  "afternoon": "☀️", "evening": "🌆", "night": "🌙", "week": "🗓️",
  "month": "🗓️", "year": "📆", "hour": "🕐", "minute": "⏱️", "second": "⏱️", "time": "⏰",
  "father": "👨", "mother": "👩", "parents": "👪", "older brother": "🧑",
  "younger brother": "🧒", "older sister": "👩", "younger sister": "👧",
  "son": "👦", "daughter": "👧", "husband": "🤵", "wife": "👰",
  "grandfather": "👴", "grandmother": "👵", "friend": "🧑‍🤝‍🧑",
  "teacher": "🧑‍🏫", "student": "🧑‍🎓",
  "eat": "🍽️", "drink": "🥤", "go": "🚶", "come": "🚶‍♂️", "see": "👀",
  "look": "👀", "watch": "📺", "listen": "👂", "hear": "👂", "speak": "🗣️",
  "talk": "🗣️", "say": "💬", "read": "📖", "write": "✍️", "learn": "📚",
  "study": "📚", "work": "💼", "sleep": "😴", "wake up": "⏰", "sit": "🪑",
  "stand": "🧍", "walk": "🚶", "run": "🏃", "buy": "🛒", "sell": "🏷️",
  "give": "🤲", "take": "🤏", "want": "🙏", "need": "❗", "like": "👍",
  "love": "❤️", "hate": "💔", "know": "🧠", "understand": "💡",
  "think": "🤔", "remember": "🧠", "forget": "🤯", "open": "🔓",
  "close": "🔒", "start": "▶️", "begin": "▶️", "finish": "🏁", "end": "🏁",
  "stop": "🛑", "wait": "⏳", "help": "🆘", "ask": "❓", "answer": "💬",
  "call": "📞", "meet": "🤝", "live": "🏠", "die": "⚰️", "born": "👶",
  "big": "🐘", "small": "🐜", "long": "📏", "short": "📏", "tall": "📏",
  "high": "⬆️", "low": "⬇️", "hot": "🔥", "cold": "🥶", "warm": "🌤️",
  "cool": "❄️", "new": "🆕", "old": "👴", "good": "👍", "bad": "👎",
  "beautiful": "🌸", "pretty": "🌸", "ugly": "😖", "happy": "😄",
  "sad": "😢", "angry": "😠", "tired": "😪", "hungry": "🍽️",
  "thirsty": "🥤", "busy": "🏃", "free": "🆓", "easy": "😌",
  "difficult": "😖", "hard": "😖", "expensive": "💸", "cheap": "🪙",
  "fast": "⚡", "slow": "🐢", "near": "📍", "far": "🛣️", "many": "🔢", "few": "🔢",
  "red": "🔴", "blue": "🔵", "green": "🟢", "yellow": "🟡", "black": "⚫",
  "white": "⚪", "orange": "🟠", "purple": "🟣", "pink": "🩷", "gray": "⚪", "grey": "⚪",
  "brown": "🟤",
  "home": "🏠", "house": "🏠", "school": "🏫", "hospital": "🏥",
  "restaurant": "🍽️", "hotel": "🏨", "airport": "✈️", "station": "🚉",
  "market": "🏪", "shop": "🏪", "store": "🏪", "bank": "🏦", "park": "🌳",
  "city": "🏙️", "country": "🌍", "road": "🛣️", "street": "🛣️", "room": "🚪",
  "water": "💧", "tea": "🍵", "coffee": "☕", "rice": "🍚", "bread": "🍞",
  "noodles": "🍜", "meat": "🥩", "fish": "🐟", "chicken": "🍗", "egg": "🥚",
  "fruit": "🍎", "vegetable": "🥦", "milk": "🥛", "wine": "🍷", "beer": "🍺",
  "dog": "🐶", "cat": "🐱", "bird": "🐦", "horse": "🐴", "cow": "🐮", "pig": "🐷",
  "sun": "☀️", "moon": "🌙", "star": "⭐", "sky": "🌌", "rain": "🌧️",
  "snow": "❄️", "wind": "💨", "cloud": "☁️", "mountain": "⛰️",
  "river": "🏞️", "sea": "🌊", "tree": "🌳", "flower": "🌸", "fire": "🔥",
  "head": "🧠", "eye": "👁️", "ear": "👂", "nose": "👃", "mouth": "👄",
  "hand": "✋", "foot": "🦶", "leg": "🦵", "heart": "❤️", "hair": "💇",
  "money": "💰", "book": "📖", "phone": "📱", "computer": "💻", "car": "🚗",
  "bicycle": "🚲", "clothes": "👕", "door": "🚪", "window": "🪟",
  "table": "🪑", "chair": "🪑", "bed": "🛏️", "key": "🔑", "bag": "🎒",
  "gift": "🎁", "present": "🎁", "letter": "✉️", "question": "❓",
  "name": "📛", "language": "🗣️", "music": "🎵", "movie": "🎬", "photo": "📷", "picture": "📷",
};

function emojiFor(en) {
  if (!en) return "";
  const clean = (s) => s.toLowerCase().replace(/^to\s+/, "").trim();
  for (const part of en.split(/[\/,;]/)) {
    const key = clean(part);
    if (EMOJI_MAP[key]) return EMOJI_MAP[key];
  }
  return "";
}

let hanziWriterLoading = null;
function ensureHanziWriter() {
  if (window.HanziWriter) return Promise.resolve();
  if (!hanziWriterLoading) {
    hanziWriterLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/hanzi-writer@3/dist/hanzi-writer.min.js";
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return hanziWriterLoading;
}

function primaryHanzi(target) {
  const first = target.split("/")[0].trim();
  return Array.from(first).filter((ch) => /[一-鿿]/.test(ch));
}

// Standard Hangul syllable decomposition (choseong/jungseong/jongseong) —
// a deterministic Unicode-algorithm breakdown, not guessed data, so it's
// always accurate for any modern Hangul syllable block.
const HANGUL_CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const HANGUL_JUNG = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
const HANGUL_JONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

function decomposeHangul(ch) {
  const code = ch.codePointAt(0);
  if (code < 0xac00 || code > 0xd7a3) return null;
  const sIndex = code - 0xac00;
  return {
    cho: HANGUL_CHO[Math.floor(sIndex / (21 * 28))],
    jung: HANGUL_JUNG[Math.floor((sIndex % (21 * 28)) / 28)],
    jong: HANGUL_JONG[sIndex % 28],
  };
}

function renderHangulBreakdown(target) {
  const syllables = Array.from(target.split("/")[0].trim()).filter((ch) => /[가-힣]/.test(ch));
  if (!syllables.length) return "";
  return `<div class="hangul-breakdown">${syllables.map((ch) => {
    const d = decomposeHangul(ch);
    if (!d) return "";
    return `<div class="hangul-block">
      <div class="hangul-syllable">${ch}</div>
      <div class="jamo-row">
        <span class="jamo-chip jamo-cho">${d.cho}</span>
        <span class="jamo-chip jamo-jung">${d.jung}</span>
        ${d.jong ? `<span class="jamo-chip jamo-jong">${d.jong}</span>` : ""}
      </div>
    </div>`;
  }).join("")}</div>`;
}

function statusClass(p) {
  if (!p) return "";
  return p.status === "learned" ? "learned" : p.status === "learning" ? "learning" : "";
}

export async function renderBatchList(root, ctx) {
  const { lang, words } = ctx;
  const meta = LANG_META[lang];
  const batches = [];
  for (let i = 0; i < words.length; i += BATCH_SIZE) batches.push(words.slice(i, i + BATCH_SIZE));

  const progressAll = await Store.getAllProgress(lang);
  const progressMap = new Map(progressAll.map((p) => [p.stt, p]));

  const learnedTotal = progressAll.filter((p) => p.status === "learned").length;
  const pctTotal = (learnedTotal / words.length) * 100;
  const rank = rankForPct(pctTotal);
  const next = nextRank(rank.id);
  const rankBanner = `
    <div class="rank-banner">
      <div class="rank-icon">${rank.icon}</div>
      <div class="rank-info">
        <div class="rank-stage">${rank.stage}</div>
        <div class="rank-name">${rank.name}</div>
        <div class="progress-track"><div class="progress-fill" style="width:${Math.round(pctTotal)}%;background:var(--gold)"></div></div>
        ${next ? `<div class="rank-next">${Math.round(pctTotal)}% · còn ${Math.max(0, next.threshold - Math.round(pctTotal))}% nữa để đột phá ${next.icon} ${next.name}</div>` : `<div class="rank-next">Đã viên mãn — 100%!</div>`}
      </div>
    </div>`;

  let html = rankBanner + mascotBubble("welcome");
  html += `<div class="row between mt-16"><h2 style="margin:0">Các nhóm từ vựng</h2></div>`;
  html += `<div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">`;
  batches.forEach((batch, idx) => {
    const learnedCount = batch.filter((w) => progressMap.get(w.stt)?.status === "learned").length;
    const pct = Math.round((learnedCount / batch.length) * 100);
    const tierTag = batch[0].tier === "super" ? "🌟 Từ tần suất cao" : "";
    html += `
      <a href="#/batch/${idx}" class="card" style="text-decoration:none;color:inherit;display:block;">
        <div class="row between">
          <strong>Nhóm ${idx + 1} · ${batch[0].stt}–${batch[batch.length - 1].stt}</strong>
          <span class="chip">${learnedCount}/${batch.length} thuộc</span>
        </div>
        ${tierTag ? `<div class="text-muted" style="font-size:12px;margin-top:4px">${tierTag}</div>` : ""}
        <div class="progress-track mt-8"><div class="progress-fill" style="width:${pct}%"></div></div>
      </a>`;
  });
  html += `</div>`;
  root.innerHTML = html;
}

export async function renderBatch(root, ctx, batchIndex) {
  const { lang, words } = ctx;
  const start = batchIndex * BATCH_SIZE;
  const batch = words.slice(start, start + BATCH_SIZE);
  if (!batch.length) {
    root.innerHTML = `<div class="empty-state"><div class="big-emoji">🎉</div>Bạn đã xem hết các nhóm rồi!</div>`;
    return;
  }
  const progressAll = await Store.getAllProgress(lang);
  const progressMap = new Map(progressAll.map((p) => [p.stt, p]));

  let html = `<a href="#/batches" class="text-muted" style="text-decoration:none;font-size:13px">← Tất cả các nhóm</a>`;
  html += mascotBubble("batchStart");
  const SEASON_TAGS = [["🌸", "Xuân"], ["🌿", "Hạ"], ["🍁", "Thu"], ["❄️", "Đông"]];
  const [seasonEmoji, seasonName] = SEASON_TAGS[batchIndex % 4];
  html += `<div class="batch-header"><h2>Nhóm ${batchIndex + 1}</h2><span class="chip">${seasonEmoji} ${seasonName} · ${batch.length} từ</span></div>`;
  html += `<div class="word-grid">`;
  batch.forEach((w) => {
    const p = progressMap.get(w.stt);
    html += `
      <div class="word-tile" data-nav="#/word/${w.stt}">
        ${p?.flag ? `<span class="flag-icon">🚩</span>` : ""}
        <span class="status-dot ${statusClass(p)}"></span>
        <div class="target">${w.target}</div>
        <div class="pron">${w.pron}</div>
        <div class="meaning">${w.meaning}</div>
      </div>`;
  });
  html += `</div>`;

  html += `
    <a href="#/freetalk/${batchIndex}" class="freetalk-entry">
      <span class="emoji">🐾</span>
      <div class="txt"><strong>Hệ thống Tom</strong><span>Chơi với em đi mà, chơi đi mà~ Em sẽ giúp ký chủ củng cố từ vựng, luyện nói, ưu tiên các từ ngữ trong nhóm này.</span></div>
    </a>`;

  root.innerHTML = html;
  root.querySelectorAll(".word-tile").forEach((el) => {
    el.addEventListener("click", () => { location.hash = el.dataset.nav; });
  });
}

function toPinyin(hanzi) {
  try {
    if (window.pinyinPro && window.pinyinPro.pinyin) {
      return window.pinyinPro.pinyin(hanzi, { toneType: "symbol", type: "string" });
    }
  } catch (e) { /* library not loaded yet */ }
  return "";
}

// Each expansion term arrives as "汉字 (nghĩa tiếng Việt)" or
// "한국어 (nghĩa)". For Chinese we auto-compute Pinyin per term via
// pinyin-pro so the data file itself never needed re-annotating by hand.
function renderExpandItems(expandList, lang) {
  if (!expandList.length) return `<div class="text-muted" style="font-size:13px">(không có)</div>`;
  return expandList.map((item) => {
    const m = item.match(/^([^(]+)\s*\(([^)]*)\)\s*$/);
    if (!m) return `<div class="expand-item"><span class="expand-target">${item}</span></div>`;
    const term = m[1].trim();
    const rest = m[2].trim();
    if (lang === "zh") {
      const py = toPinyin(term);
      // Source data packs "Hán Việt — nghĩa" together inside the parens;
      // split them so the gloss reads first and the Hán Việt reading is
      // clearly labeled, instead of three dash-joined phrases in a row.
      const parts = rest.split(/\s*—\s*/);
      const hanviet = parts.length > 1 ? parts[0] : "";
      const nghia = parts.length > 1 ? parts.slice(1).join(" — ") : rest;
      return `<div class="expand-item">
        <span class="expand-target">${term}</span>
        <span class="expand-pron">${py}</span>
        <span class="expand-vi">— ${nghia}</span>
        ${hanviet ? `<span class="expand-hanviet">Hán Việt: ${hanviet}</span>` : ""}
      </div>`;
    }
    return `<div class="expand-item">
      <span class="expand-target">${term}</span>
      <span class="expand-vi">— ${rest}</span>
    </div>`;
  }).join("");
}

function toneHintChips(lang) {
  if (lang !== "zh") return "";
  const tones = ["ā", "á", "ǎ", "à", "ē", "é", "ě", "è", "ī", "í", "ǐ", "ì", "ō", "ó", "ǒ", "ò", "ū", "ú", "ǔ", "ù", "ü"];
  return `<div class="tone-hint">${tones.map((t) => `<span class="tone-chip" data-ch="${t}">${t}</span>`).join("")}</div>`;
}

// Full Pinyin alphabet (initials + finals), not just the toned vowels —
// lets the learner build any syllable with on-screen taps.
function pinyinAlphaChips(lang) {
  if (lang !== "zh") return "";
  const letters = ["a", "o", "e", "i", "u", "ü", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "zh", "ch", "sh", "r", "z", "c", "s", "y", "w"];
  return `<div class="tone-hint">${letters.map((t) => `<span class="tone-chip" data-ch="${t}">${t}</span>`).join("")}</div>`;
}

// Word-level diff for Korean (space-separated 어절), char-level for Chinese
// (no spaces) — used by the Đọc skill's mic pronunciation check.
function diffSentence(expected, recognized, lang) {
  const strip = (s) => s.replace(/[\s.,。！!?？、，]/g, "");
  if (lang === "zh") {
    const exp = Array.from(strip(expected));
    const rec = Array.from(strip(recognized));
    return exp.map((ch, i) => `<span class="${rec[i] === ch ? "diff-ok" : "diff-wrong"}">${ch}</span>`).join("");
  }
  const exp = expected.trim().split(/\s+/);
  const rec = recognized.trim().split(/\s+/);
  return exp.map((word, i) => `<span class="${rec[i] === word ? "diff-ok" : "diff-wrong"}">${word}</span>`).join(" ");
}

export async function renderWordDetail(root, ctx, stt) {
  const { lang, words } = ctx;
  const w = words.find((x) => x.stt === Number(stt));
  const meta = LANG_META[lang];
  if (!w) { root.innerHTML = `<div class="empty-state">Không tìm thấy từ này.</div>`; return; }
  const p = await Store.ensureProgress(lang, w.stt);

  const batchIndex = Math.floor((w.stt - 1) / BATCH_SIZE);

  let html = `<a href="#/batch/${batchIndex}" class="text-muted" style="text-decoration:none;font-size:13px">← Quay lại nhóm từ</a>`;
  html += `
    <div class="word-detail-head">
      <div class="target-big">
        <span>${w.target}</span>
        <button class="speak-btn" id="btn-speak-main">🔊</button>
      </div>
      <div class="pron-big">${w.pron}</div>
      <div class="en-tag">${w.en} · ${w.meaning}${w.hanvietDisplay ? ` · <span class="hanviet-pill">Hán Việt: ${w.hanvietDisplay}</span>` : ""}</div>
      <div id="voice-warn" class="text-muted" style="font-size:12px;margin-top:6px"></div>
    </div>

    <div class="info-block">
      <h4>🖼️ Hình ảnh minh họa</h4>
      <div class="visual-mnemonic">
        ${emojiFor(w.en) ? `<div class="visual-emoji">${emojiFor(w.en)}</div>` : ""}
        ${lang === "zh"
          ? `<div class="hanzi-strokes">${primaryHanzi(w.target).map((ch, i) => `
              <div class="stroke-box-wrap">
                <div class="stroke-box" id="stroke-box-${i}" data-char="${ch}"></div>
                <button class="btn ghost" style="font-size:12px;padding:6px 10px;margin-top:6px" data-replay="${i}">▶ Xem nét</button>
              </div>`).join("")}</div>`
          : renderHangulBreakdown(w.target)}
      </div>
    </div>

    <div class="info-block">
      <h4>🧠 Mẹo nhớ nhanh</h4>
      <div class="body">${w.note || ""}</div>
    </div>

    <div class="info-block">
      <h4>Mở rộng</h4>
      <div class="expand-list">${renderExpandItems(w.expandList, lang)}</div>
    </div>

    <div class="skill-tabs">
      <div class="skill-tab ${p.skills.listen ? "done" : ""}" data-skill="listen"><span class="emoji">🎧</span>Nghe</div>
      <div class="skill-tab ${p.skills.speak ? "done" : ""}" data-skill="speak"><span class="emoji">🗣️</span>Nói</div>
      <div class="skill-tab ${p.skills.read ? "done" : ""}" data-skill="read"><span class="emoji">📖</span>Đọc</div>
      <div class="skill-tab ${p.skills.write ? "done" : ""}" data-skill="write"><span class="emoji">✍️</span>Viết</div>
    </div>

    <div id="skill-panel"></div>
  `;
  root.innerHTML = html;

  document.getElementById("btn-speak-main").addEventListener("click", async () => {
    const r = await speak(w.target, meta.voiceLang);
    if (!r.hadVoice) document.getElementById("voice-warn").textContent = missingVoiceMessage(meta.label);
  });

  if (lang === "zh") {
    const chars = primaryHanzi(w.target);
    if (chars.length) {
      ensureHanziWriter().then(() => {
        const writers = chars.map((ch, i) => {
          const el = document.getElementById(`stroke-box-${i}`);
          if (!el) return null;
          const writer = window.HanziWriter.create(el, ch, {
            width: 84, height: 84, padding: 6,
            showOutline: true, strokeAnimationSpeed: 1, delayBetweenStrokes: 200,
          });
          writer.animateCharacter();
          return writer;
        });
        root.querySelectorAll("[data-replay]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const w2 = writers[Number(btn.dataset.replay)];
            w2 && w2.animateCharacter();
          });
        });
      }).catch(() => {});
    }
  }

  const panel = document.getElementById("skill-panel");
  const tabs = root.querySelectorAll(".skill-tab");
  tabs.forEach((t) => t.addEventListener("click", () => {
    tabs.forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    renderSkillPanel(panel, ctx, w, t.dataset.skill, () => {
      t.classList.add("done");
    });
  }));
}

function pickDistractors(words, correct, n = 3) {
  const pool = words.filter((w) => w.stt !== correct.stt);
  const picked = [];
  while (picked.length < n && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

async function renderSkillPanel(panel, ctx, w, skill, onDone) {
  const { lang, words } = ctx;
  const meta = LANG_META[lang];

  if (skill === "listen") {
    const choices = [w, ...pickDistractors(words, w, 3)].sort(() => Math.random() - 0.5);
    panel.innerHTML = `
      <div class="skill-panel">
        <div class="row gap"><button class="btn round" id="listen-play">🔊</button><span class="text-muted">Nghe rồi chọn đúng nghĩa</span></div>
        <div class="choice-list">
          ${choices.map((c) => `<button class="choice-btn" data-correct="${c.stt === w.stt}">${c.meaning}</button>`).join("")}
        </div>
        <div id="voice-warn" class="text-muted" style="font-size:12px"></div>
        <div class="feedback-banner" id="fb"></div>
      </div>`;
    const play = async () => {
      const r = await speak(w.target, meta.voiceLang);
      if (!r.hadVoice) panel.querySelector("#voice-warn").textContent = missingVoiceMessage(meta.label);
    };
    panel.querySelector("#listen-play").addEventListener("click", play);
    play();
    panel.querySelectorAll(".choice-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const correct = btn.dataset.correct === "true";
        const fb = panel.querySelector("#fb");
        fb.classList.add("show", correct ? "good" : "retry");
        fb.textContent = mascotSay(correct ? "correct" : "wrong");
        btn.classList.add(correct ? "correct" : "wrong");
        await Store.recordListenResult(lang, w.stt, correct);
        if (correct) { await Store.markSkillDone(lang, w.stt, "listen"); onDone(); }
      });
    });
    return;
  }

  if (skill === "read") {
    const sttOk = isSttSupported();
    panel.innerHTML = `
      <div class="skill-panel">
        <div class="text-muted" style="font-size:13px;margin-bottom:6px">Đọc các câu ví dụ (bấm 🔊 để nghe mẫu${sttOk ? ", bấm 🎤 để Tom kiểm tra bạn đọc đúng chưa" : ""})</div>
        ${w.exampleList.map((ex, i) => `
          <div class="example-block">
            <div class="ex-target">${ex.target} <button class="speak-btn small" data-t="${encodeURIComponent(ex.target)}">🔊</button>${sttOk ? ` <button class="speak-btn small" data-rec="${i}">🎤</button>` : ""}</div>
            <div class="ex-pron">${ex.pron}</div>
            <div class="ex-vi">${ex.vi}</div>
            <div class="diff-result" id="diff-${i}"></div>
          </div>`).join("")}
        ${sttOk ? "" : `<div class="text-muted" style="font-size:12px;margin:2px 0 10px">Trình duyệt này chưa hỗ trợ nhận diện giọng nói để Tom kiểm tra — thử Chrome nhé.</div>`}
        <button class="btn block" id="read-done">Mình đã đọc xong</button>
      </div>`;
    panel.querySelectorAll("[data-t]").forEach((b) => b.addEventListener("click", () => speak(decodeURIComponent(b.dataset.t), meta.voiceLang)));
    if (sttOk) {
      panel.querySelectorAll("[data-rec]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.dataset.rec);
          const ex = w.exampleList[idx];
          const out = panel.querySelector(`#diff-${idx}`);
          btn.classList.add("recording");
          out.innerHTML = `<span class="text-muted">Đang nghe...</span>`;
          const rec = createRecognizer(meta.sttLang, {
            onResult: (transcript) => {
              out.innerHTML = `<div>${diffSentence(ex.target, transcript, lang)}</div><div class="diff-transcript">Bạn đọc: "${transcript}"</div>`;
            },
            onError: () => { out.innerHTML = `<span class="text-muted">Không nghe rõ, thử lại nhé.</span>`; },
            onEnd: () => btn.classList.remove("recording"),
          });
          rec && rec.start();
        });
      });
    }
    panel.querySelector("#read-done").addEventListener("click", async () => {
      await Store.markSkillDone(lang, w.stt, "read");
      onDone();
    });
    return;
  }

  if (skill === "write") {
    const supportNote = "";
    panel.innerHTML = `
      <div class="skill-panel">
        <div class="text-muted" style="font-size:13px">Gõ đúng ${lang === "zh" ? "Pinyin" : "phiên âm La-tinh"} của từ này:</div>
        <div style="font-size:26px;font-weight:700;margin-top:8px">${w.target}</div>
        <input class="type-input" id="write-input" placeholder="Gõ vào đây..." autocomplete="off"/>
        ${lang === "zh" ? `<div class="text-muted" style="font-size:11px;margin-top:10px">Bảng chữ cái Pinyin</div>` : ""}
        ${pinyinAlphaChips(lang)}
        ${lang === "zh" ? `<div class="text-muted" style="font-size:11px;margin-top:8px">Nguyên âm có dấu thanh</div>` : ""}
        ${toneHintChips(lang)}
        <button class="btn block mt-16" id="write-check">Kiểm tra</button>
        <div class="feedback-banner" id="fb-w"></div>
      </div>`;
    const input = panel.querySelector("#write-input");
    panel.querySelectorAll(".tone-chip").forEach((c) => c.addEventListener("click", () => {
      input.value += c.dataset.ch;
      input.focus();
    }));
    panel.querySelector("#write-check").addEventListener("click", async () => {
      const norm = (s) => s.toLowerCase().replace(/\s+/g, "");
      const correct = norm(input.value) === norm(w.pron);
      const fb = panel.querySelector("#fb-w");
      fb.classList.add("show", correct ? "good" : "retry");
      fb.textContent = correct ? mascotSay("correct") + ` (${w.pron})` : `${mascotSay("wrong")} Đáp án: ${w.pron}`;
      if (correct) { await Store.markSkillDone(lang, w.stt, "write"); onDone(); }
    });
    return;
  }

  if (skill === "speak") {
    const sttOk = isSttSupported();
    panel.innerHTML = `
      <div class="skill-panel">
        <div class="row gap"><button class="btn round" id="speak-play">🔊</button><span class="text-muted">Nghe mẫu rồi bấm mic để đọc theo</span></div>
        <div class="mic-row">
          <button class="mic-btn" id="mic-btn">🎤</button>
          <div id="mic-status" class="text-muted" style="font-size:13px">${sttOk ? "Sẵn sàng ghi âm" : "Trình duyệt này chưa hỗ trợ nhận diện giọng nói — thử Chrome nhé."}</div>
        </div>
        <div class="feedback-banner" id="fb-s"></div>
      </div>`;
    panel.querySelector("#speak-play").addEventListener("click", async () => {
      const r = await speak(w.target, meta.voiceLang);
      if (!r.hadVoice) panel.querySelector("#mic-status").textContent = missingVoiceMessage(meta.label);
    });
    if (sttOk) {
      const micBtn = panel.querySelector("#mic-btn");
      const status = panel.querySelector("#mic-status");
      const fb = panel.querySelector("#fb-s");
      micBtn.addEventListener("click", () => {
        micBtn.classList.add("recording");
        status.textContent = "Đang nghe...";
        const rec = createRecognizer(meta.sttLang, {
          onResult: async (transcript) => {
            const said = transcript.replace(/[.,。！!?？\s]/g, "");
            const target = w.target.replace(/[.,。！!?？\s]/g, "");
            const close = said.includes(target) || target.includes(said);
            fb.classList.add("show", "good");
            fb.textContent = close
              ? `Nghe được: "${transcript}" — ${mascotSay("correct")}`
              : `Nghe được: "${transcript}" — gần đúng rồi, thử lại xem sao? Nếu muốn AI nhận xét phát âm chi tiết hơn, cần thêm API key.`;
            status.textContent = "Sẵn sàng ghi âm";
            micBtn.classList.remove("recording");
            await Store.markSkillDone(lang, w.stt, "speak");
            onDone();
          },
          onError: () => { status.textContent = "Không nghe rõ, thử lại nhé."; micBtn.classList.remove("recording"); },
          onEnd: () => micBtn.classList.remove("recording"),
        });
        rec && rec.start();
      });
    }
    return;
  }
}
