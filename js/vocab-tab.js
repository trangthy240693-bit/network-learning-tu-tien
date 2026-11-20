import { Store } from "./db.js";
import { speak, isTtsSupported, hasVoiceFor, missingVoiceMessage } from "./tts.js";
import { createRecognizer, isSttSupported } from "./stt.js";
import { mascotBubble, mascotSay } from "./mascot.js";
import { LANG_META, getEnAccent, setEnAccent, COMPOUND_BASE } from "./data.js";
import { rankForPct, nextRank } from "./ranks.js";
import { renderHvBox, zhSwitcher } from "./hanviet.js";
import { familyToggle } from "./hvfamily.js";

const BATCH_SIZE = 20;

const SECTION_LABEL = {
  core: "🌟 625 từ thông dụng",
  A1: "A1 · Sơ cấp",
  A2: "A2 · Cơ bản",
  B1: "B1 · Trung cấp",
  B2: "B2 · Trung cao cấp",
  C1: "C1 · Cao cấp",
};

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

  const learnedTotal = progressAll.filter((p) => p.status === "learned" && p.stt <= words.length).length;
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

  let html = (lang === "zh" ? zhSwitcher("speed") : "") + rankBanner + mascotBubble("welcome");
  html += `<div class="row between mt-16"><h2 style="margin:0">${lang === "zh" ? "⚡ Tốc Biến — 625 từ thông dụng nhất" : "Các nhóm từ vựng"}</h2></div>`;
  if (lang === "zh") html += familyToggle("batches");

  const batchCard = (batch, idx) => {
    const learnedCount = batch.filter((w) => progressMap.get(w.stt)?.status === "learned").length;
    const pct = Math.round((learnedCount / batch.length) * 100);
    let tierTag = batch[0].tier === "super" ? "🌟 Từ tần suất cao" : "";
    if (lang === "en") {
      const a = batch[0].level, b = batch[batch.length - 1].level;
      if (batch[0].section === "core") tierTag = "🌟 Từ tần suất cao";
      else tierTag = a === b ? `Mức ${a}` : `Mức ${a} → ${b}`;
    }
    return `
      <a href="#/batch/${idx}" class="card" style="text-decoration:none;color:inherit;display:block;">
        <div class="row between">
          <strong>Nhóm ${idx + 1} · ${batch[0].stt}–${batch[batch.length - 1].stt}</strong>
          <span class="chip">${learnedCount}/${batch.length} thuộc</span>
        </div>
        ${tierTag ? `<div class="text-muted" style="font-size:12px;margin-top:4px">${tierTag}</div>` : ""}
        <div class="progress-track mt-8"><div class="progress-fill" style="width:${pct}%"></div></div>
      </a>`;
  };

  if (lang !== "en") {
    html += `<div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">`;
    batches.forEach((batch, idx) => { html += batchCard(batch, idx); });
    html += `</div>`;
    root.innerHTML = html;
    return;
  }

  // English has thousands of words: group the batches by section (625 core
  // words, then A1 → C1) as collapsible blocks; open the one still in progress.
  const groups = [];
  batches.forEach((batch, idx) => {
    const sec = batch[0].section || "core";
    let g = groups[groups.length - 1];
    if (!g || g.sec !== sec) { g = { sec, items: [] }; groups.push(g); }
    g.items.push({ batch, idx });
  });
  // Count by the words' own section: a 20-word batch can straddle two sections.
  groups.forEach((g) => {
    const own = words.filter((w) => (w.section || "core") === g.sec);
    g.total = own.length;
    g.learned = own.filter((w) => progressMap.get(w.stt)?.status === "learned").length;
  });
  const openIdx = Math.max(0, groups.findIndex((g) => g.learned < g.total));
  html += `<div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">`;
  groups.forEach((g, gi) => {
    const open = gi === openIdx;
    html += `
      <div class="sec-group ${open ? "open" : ""}">
        <button class="sec-head" data-sec="${gi}">
          <span class="sec-title">${SECTION_LABEL[g.sec] || g.sec}</span>
          <span class="chip">${g.learned}/${g.total} thuộc</span>
          <span class="sec-caret">▾</span>
        </button>
        <div class="sec-body">${g.items.map((x) => batchCard(x.batch, x.idx)).join("")}</div>
      </div>`;
  });
  html += `</div>`;
  root.innerHTML = html;
  root.querySelectorAll(".sec-head").forEach((b) => b.addEventListener("click", () => b.parentElement.classList.toggle("open")));
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
        <button class="tile-flag ${p?.flag ? "on" : ""}" data-flag-stt="${w.stt}" title="Gắn/bỏ cờ từ này" aria-label="Gắn cờ">🚩</button>
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
  wireTileFlags(root, lang);
}

// Flag button on word tiles: toggles the word-level 🚩 without opening the word.
export function wireTileFlags(root, lang) {
  root.querySelectorAll(".tile-flag").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const p = await Store.toggleWordFlag(lang, Number(btn.dataset.flagStt));
      btn.classList.toggle("on", !!p.flag);
    });
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
// Normalizes spoken/typed text before comparing it with the expected text.
// English: case-insensitive, punctuation-free, spaces kept (speech recognizers
// return lower-case text without punctuation). zh/ko: all spaces removed.
export function normCompare(s, lang) {
  if (lang === "en") {
    // Apostrophes are dropped (don't = dont): recognizers are inconsistent about them.
    return (s || "").toLowerCase().replace(/[’‘']/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }
  return (s || "").replace(/[\s.,。！!?？、，]/g, "");
}

// English word-level diff via longest-common-subsequence, so one missed or
// extra word doesn't mark every following word wrong.
function diffSentenceEn(expected, recognized) {
  const expToks = expected.trim().split(/\s+/).filter(Boolean);
  const exp = expToks.map((t) => normCompare(t, "en"));
  const rec = normCompare(recognized, "en").split(" ").filter(Boolean);
  const dp = Array.from({ length: exp.length + 1 }, () => new Array(rec.length + 1).fill(0));
  for (let i = exp.length - 1; i >= 0; i--) {
    for (let j = rec.length - 1; j >= 0; j--) {
      dp[i][j] = exp[i] === rec[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ok = new Set();
  let i = 0, j = 0;
  while (i < exp.length && j < rec.length) {
    if (exp[i] === rec[j]) { ok.add(i); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return expToks.map((t, k) => `<span class="${ok.has(k) || !exp[k] ? "diff-ok" : "diff-wrong"}">${t}</span>`).join(" ");
}

export function diffSentence(expected, recognized, lang) {
  if (lang === "en") return diffSentenceEn(expected, recognized);
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

// One unified page — every task (nói/đọc/viết) visible and usable at once,
// no tab-clicking. "Nghe & đoán nghĩa" is deliberately NOT duplicated here —
// that quiz already lives in Ôn tập ▸ Nghe chọn từ, so it isn't repeated
// twice and doesn't cost the learner extra time on this screen.
// "Nói" lives next to the 🔊 button, "Viết" lives next to the stroke box,
// "Đọc" (with per-sentence flagging) is an always-open section below.
export async function renderWordDetail(root, ctx, stt) {
  const { lang, words } = ctx;
  const extra = ctx.extra || [];
  const w = words.find((x) => x.stt === Number(stt)) || extra.find((x) => x.stt === Number(stt));
  const meta = LANG_META[lang];
  if (!w) { root.innerHTML = `<div class="empty-state">Không tìm thấy từ này.</div>`; return; }
  // Compound cards (Hack Hán-Việt) live outside the 20-word batches of the core list.
  const isCompound = w.stt > COMPOUND_BASE;
  const p = await Store.ensureProgress(lang, w.stt);
  const sttOk = isSttSupported();
  const readFlags = p.readFlags || [];

  const batchIndex = Math.floor((w.stt - 1) / BATCH_SIZE);

  let html = `<a href="${isCompound ? "#/hv/words" : `#/batch/${batchIndex}`}" class="text-muted" style="text-decoration:none;font-size:13px">← ${isCompound ? "Quay lại từ ghép" : "Quay lại nhóm từ"}</a>`;
  html += `
    <div class="word-detail-head">
      <div class="target-big">
        <span>${w.target}</span>
        <button class="speak-btn" id="btn-speak-main" title="Nghe">🔊</button>
        ${lang === "en" ? `<button class="speak-btn" id="btn-speak-slow" title="Nghe chậm">🐢</button>` : ""}
        ${sttOk ? `<button class="speak-btn" id="btn-speak-record" title="Nói theo">🎤</button>` : ""}
        <button class="word-flag-btn ${p.flag ? "active" : ""}" id="btn-word-flag" title="Gắn/bỏ cờ từ này (ưu tiên ôn)">🚩</button>
      </div>
      <div class="pron-big">${w.pron}</div>
      ${lang === "en" && w.ptip ? `<div class="ptip">🗣️ ${w.ptip}</div>` : ""}
      ${lang === "en"
        ? `<div class="en-tag">${w.pos ? `<em>${w.pos}</em> · ` : ""}${w.meaning} · <span class="hanviet-pill">${w.level}</span></div>
           <div class="accent-row">
             <button class="accent-btn ${getEnAccent() === "en-US" ? "on" : ""}" data-accent="en-US">🇺🇸 Giọng Mỹ</button>
             <button class="accent-btn ${getEnAccent() === "en-GB" ? "on" : ""}" data-accent="en-GB">🇬🇧 Giọng Anh</button>
           </div>`
        : `<div class="en-tag">${w.en} · ${w.meaning}${w.hanvietDisplay ? ` · <span class="hanviet-pill">Hán Việt: ${w.hanvietDisplay}</span>` : ""}</div>`}
      <div id="voice-warn" class="text-muted" style="font-size:12px;margin-top:6px"></div>
      <div id="speak-fb" class="feedback-banner" style="text-align:left"></div>
    </div>

    ${lang === "zh" ? `<div class="info-block hv-block" id="hv-block" hidden><h4>🔗 Mẹo Hán-Việt</h4><div id="hv-box"></div></div>` : ""}

    <div class="info-block">
      <div class="section-title-row">
        <h4 style="margin:0">${lang === "en" ? "✍️ Luyện viết" : "🖼️ Hình ảnh minh họa"}</h4>
        <button class="btn ghost" id="btn-toggle-write" style="font-size:12px;padding:5px 10px">✍️ ${lang === "en" ? "Mở bài tập" : "Tập viết"}</button>
      </div>
      ${lang === "en" && !emojiFor(w.en) ? "" : `<div class="visual-mnemonic">
        ${emojiFor(w.en) ? `<div class="visual-emoji">${emojiFor(w.en)}</div>` : ""}
        ${lang === "zh"
          ? `<div class="hanzi-strokes">${primaryHanzi(w.target).map((ch, i) => `
              <div class="stroke-box-wrap">
                <div class="stroke-box" id="stroke-box-${i}" data-char="${ch}"></div>
                <button class="btn ghost" style="font-size:12px;padding:6px 10px;margin-top:6px" data-replay="${i}">▶ Xem nét</button>
              </div>`).join("")}</div>`
          : lang === "ko" ? renderHangulBreakdown(w.target) : ""}
      </div>`}
      ${lang === "en" ? `
      <div class="write-panel hidden" id="write-panel">
        <div class="text-muted" style="font-size:13px">1 · Chính tả — bấm 🔊 nghe rồi gõ lại đúng từ:</div>
        <div class="row gap" style="margin-top:6px">
          <button class="speak-btn" id="write-listen" title="Nghe">🔊</button>
          <input class="type-input" id="write-input" placeholder="Gõ từ bạn vừa nghe..." autocomplete="off" autocapitalize="off" spellcheck="false"/>
        </div>
        <button class="btn block mt-8" id="write-check">Kiểm tra chính tả</button>
        <div class="feedback-banner" id="fb-w"></div>
        <div class="text-muted" style="font-size:13px;margin-top:16px">2 · Đặt câu — viết một câu của riêng bạn có dùng "<strong>${w.target}</strong>":</div>
        <textarea class="type-input" id="sentence-input" rows="2" placeholder="Viết câu của bạn..." autocomplete="off" spellcheck="false" style="margin-top:6px"></textarea>
        <button class="btn ghost block mt-8" id="sentence-check">Kiểm tra câu</button>
        <div class="feedback-banner" id="fb-s"></div>
      </div>` : `
      <div class="write-panel hidden" id="write-panel">
        <div class="text-muted" style="font-size:13px">Gõ đúng ${lang === "zh" ? "Pinyin" : "phiên âm La-tinh"} của từ này:</div>
        <input class="type-input" id="write-input" placeholder="Gõ vào đây..." autocomplete="off"/>
        ${lang === "zh" ? `<div class="text-muted" style="font-size:11px;margin-top:10px">Bảng chữ cái Pinyin</div>` : ""}
        ${pinyinAlphaChips(lang)}
        ${lang === "zh" ? `<div class="text-muted" style="font-size:11px;margin-top:8px">Nguyên âm có dấu thanh</div>` : ""}
        ${toneHintChips(lang)}
        <button class="btn block mt-16" id="write-check">Kiểm tra</button>
        <div class="feedback-banner" id="fb-w"></div>
      </div>`}
    </div>

    <div class="info-block">
      <h4>🧠 Mẹo nhớ nhanh</h4>
      <div class="body">${w.note || ""}</div>
    </div>

    <div class="info-block">
      <h4>${lang === "en" ? "Họ từ &amp; cụm từ đi kèm" : "Mở rộng"}</h4>
      <div class="expand-list">${renderExpandItems(w.expandList, lang)}</div>
    </div>

    <div class="info-block">
      <h4>📖 Đọc câu ví dụ ${p.skills.read ? '<span class="section-check">✓ đã luyện</span>' : ""}</h4>
      <div class="text-muted" style="font-size:13px;margin-bottom:6px">Bấm 🔊 để nghe mẫu${sttOk ? ", bấm 🎤 để kiểm tra bạn đọc đúng chưa" : ""}, bấm 🚩 để tự đánh dấu câu cần ôn lại.</div>
      ${w.exampleList.map((ex, i) => `
        <div class="example-block ${readFlags.includes(i) ? "flagged" : ""}" id="ex-block-${i}">
          <div class="ex-target">${ex.target}
            <button class="speak-btn small" data-t="${encodeURIComponent(ex.target)}">🔊</button>
            ${lang === "en" ? `<button class="speak-btn small" data-slow="${encodeURIComponent(ex.target)}" title="Nghe chậm">🐢</button>` : ""}
            ${sttOk ? ` <button class="speak-btn small" data-rec="${i}">🎤</button>` : ""}
            <button class="flag-toggle-btn ${readFlags.includes(i) ? "active" : ""}" data-flag="${i}" title="Gắn/bỏ cờ câu này">🚩</button>
          </div>
          ${ex.pron ? `<div class="ex-pron">${ex.pron}</div>` : ""}
          <div class="ex-vi">${ex.vi}</div>
          <div class="diff-result" id="diff-${i}"></div>
        </div>`).join("")}
      ${sttOk ? "" : `<div class="text-muted" style="font-size:12px;margin:2px 0 10px">Trình duyệt này chưa hỗ trợ nhận diện giọng nói để kiểm tra — thử Chrome nhé.</div>`}
    </div>

    <div class="word-verdict">
      <button class="verdict-btn star ${p.status === "learning" ? "on" : ""}" id="verdict-learning">
        <span class="v-icon">⭐</span><strong>Đang học</strong><span class="v-sub">Chưa thuộc, để ôn tiếp</span>
      </button>
      <button class="verdict-btn known ${p.status === "learned" ? "on" : ""}" id="verdict-known">
        <span class="v-icon">⏭</span><strong>Biết rồi</strong><span class="v-sub">Chuyển vào Đã học</span>
      </button>
    </div>
  `;
  root.innerHTML = html;

  const goNext = () => {
    const nextStt = w.stt + 1;
    if (isCompound) {
      location.hash = extra.some((x) => x.stt === nextStt) ? `#/word/${nextStt}` : "#/hv/words";
      return;
    }
    const batchEnd = (batchIndex + 1) * BATCH_SIZE;
    location.hash = nextStt <= batchEnd && nextStt <= words.length ? `#/word/${nextStt}` : `#/batch/${batchIndex}`;
  };
  document.getElementById("verdict-learning").addEventListener("click", async () => {
    await Store.setStatus(lang, w.stt, "learning");
    goNext();
  });
  document.getElementById("verdict-known").addEventListener("click", async () => {
    await Store.setStatus(lang, w.stt, "learned");
    goNext();
  });

  const wordFlagBtn = document.getElementById("btn-word-flag");
  wordFlagBtn.addEventListener("click", async () => {
    const np = await Store.toggleWordFlag(lang, w.stt);
    wordFlagBtn.classList.toggle("active", !!np.flag);
  });

  const markDone = (skill) => Store.markSkillDone(lang, w.stt, skill);

  if (lang === "zh") renderHvBox(document.getElementById("hv-block"), w, ctx.all || words).catch(() => {});

  // 🔊 main listen
  document.getElementById("btn-speak-main").addEventListener("click", async () => {
    const r = await speak(w.target, meta.voiceLang);
    const warnEl = document.getElementById("voice-warn");
    if (!r.hadVoice && warnEl) warnEl.textContent = missingVoiceMessage(meta.label);
  });

  if (lang === "en") {
    // 🐢 slow playback for pronunciation practice, and US/UK accent choice.
    document.getElementById("btn-speak-slow").addEventListener("click", () => speak(w.target, meta.voiceLang, 0.55));
    root.querySelectorAll(".accent-btn").forEach((b) => b.addEventListener("click", () => {
      setEnAccent(b.dataset.accent);
      root.querySelectorAll(".accent-btn").forEach((x) => x.classList.toggle("on", x === b));
      speak(w.target, meta.voiceLang);
    }));
  }

  // 🎤 main speak-and-check (next to the listen button)
  if (sttOk) {
    const recordBtn = document.getElementById("btn-speak-record");
    const fb = document.getElementById("speak-fb");
    recordBtn.addEventListener("click", () => {
      recordBtn.classList.add("recording");
      const rec = createRecognizer(meta.sttLang, {
        onResult: async (transcript) => {
          const said = normCompare(transcript, lang);
          const target = normCompare(w.target.split("/")[0], lang);
          const close = !!said && (said.includes(target) || target.includes(said));
          fb.classList.add("show", close ? "good" : "retry");
          fb.textContent = close ? `Nghe được: "${transcript}" — ${mascotSay("correct")}` : `Nghe được: "${transcript}" — gần đúng rồi, thử lại xem sao?`;
          if (close) await markDone("speak");
        },
        onError: () => { fb.classList.add("show", "retry"); fb.textContent = "Không nghe rõ, thử lại nhé."; },
        onEnd: () => recordBtn.classList.remove("recording"),
      });
      rec && rec.start();
    });
  }

  // ✍️ inline write-practice toggle (next to stroke box)
  const writePanel = document.getElementById("write-panel");
  document.getElementById("btn-toggle-write").addEventListener("click", () => {
    writePanel.classList.toggle("hidden");
  });
  const writeInput = document.getElementById("write-input");
  writePanel.querySelectorAll(".tone-chip").forEach((c) => c.addEventListener("click", () => {
    writeInput.value += c.dataset.ch;
    writeInput.focus();
  }));
  if (lang === "en") {
    // Writing practice: (1) dictation/spelling of the word, (2) own sentence.
    document.getElementById("write-listen").addEventListener("click", () => speak(w.target, meta.voiceLang));
    document.getElementById("write-check").addEventListener("click", async () => {
      const correct = normCompare(writeInput.value, "en") === normCompare(w.target, "en");
      const fb = document.getElementById("fb-w");
      fb.classList.remove("good", "retry");
      fb.classList.add("show", correct ? "good" : "retry");
      fb.textContent = correct ? `${mascotSay("correct")} (${w.target})` : `${mascotSay("wrong")} Đáp án: ${w.target}`;
      if (correct) await markDone("write");
    });
    document.getElementById("sentence-check").addEventListener("click", async () => {
      const text = document.getElementById("sentence-input").value.trim();
      const fb = document.getElementById("fb-s");
      fb.classList.remove("good", "retry");
      fb.classList.add("show");
      const tokens = normCompare(text, "en").split(" ").filter(Boolean);
      const parts = normCompare(w.target, "en").split(" ").filter(Boolean);
      const stemOf = (t) => (t.length > 5 ? t.slice(0, t.length - 2) : t.length > 3 ? t.slice(0, t.length - 1) : t);
      const hasWord = parts.every((part, i) => tokens.some((tk) => (i === 0 ? tk.startsWith(stemOf(part)) : tk === part)));
      if (tokens.length < 4) {
        fb.classList.add("retry");
        fb.textContent = "Câu hơi ngắn — thử viết một câu đầy đủ (ít nhất 4 từ) nhé.";
      } else if (!hasWord) {
        fb.classList.add("retry");
        fb.textContent = `Câu chưa có từ "${w.target}" — thử lại nhé.`;
      } else {
        fb.classList.add("good");
        const sample = w.exampleList[0] ? ` Câu mẫu để so sánh: "${w.exampleList[0].target}"` : "";
        fb.textContent = `Có dùng "${w.target}" rồi, tốt lắm! (App chưa chấm được ngữ pháp, bạn tự đọc lại câu nhé.)${sample}`;
        await markDone("write");
      }
    });
  } else {
    document.getElementById("write-check").addEventListener("click", async () => {
      const norm = (s) => s.toLowerCase().replace(/\s+/g, "");
      const correct = norm(writeInput.value) === norm(w.pron);
      const fb = document.getElementById("fb-w");
      fb.classList.add("show", correct ? "good" : "retry");
      fb.textContent = correct ? mascotSay("correct") + ` (${w.pron})` : `${mascotSay("wrong")} Đáp án: ${w.pron}`;
      if (correct) await markDone("write");
    });
  }

  // stroke order (zh only)
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

  // 📖 read examples with mic pronunciation check + per-sentence flag tracking
  root.querySelectorAll(".example-block [data-t]").forEach((b) => b.addEventListener("click", () => speak(decodeURIComponent(b.dataset.t), meta.voiceLang)));
  root.querySelectorAll(".example-block [data-slow]").forEach((b) => b.addEventListener("click", () => speak(decodeURIComponent(b.dataset.slow), meta.voiceLang, 0.55)));

  root.querySelectorAll(".flag-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.dataset.flag);
      await Store.toggleReadFlag(lang, w.stt, idx);
      btn.classList.toggle("active");
      document.getElementById(`ex-block-${idx}`).classList.toggle("flagged");
    });
  });

  if (sttOk) {
    root.querySelectorAll(".example-block [data-rec]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.rec);
        const ex = w.exampleList[idx];
        const out = document.getElementById(`diff-${idx}`);
        btn.classList.add("recording");
        out.innerHTML = `<span class="text-muted">Đang nghe...</span>`;
        const rec = createRecognizer(meta.sttLang, {
          onResult: async (transcript) => {
            const isCorrect = normCompare(transcript, lang) === normCompare(ex.target, lang);
            out.innerHTML = `<div>${diffSentence(ex.target, transcript, lang)}</div><div class="diff-transcript">Bạn đọc: "${transcript}"</div>`;
            const wasFlagged = readFlags.includes(idx);
            const rp = await Store.recordReadResult(lang, w.stt, idx, isCorrect);
            if (isCorrect) await markDone("read");
            if (rp.readFlags.includes(idx) && !wasFlagged) renderWordDetail(root, ctx, stt);
          },
          onError: () => { out.innerHTML = `<span class="text-muted">Không nghe rõ, thử lại nhé.</span>`; },
          onEnd: () => btn.classList.remove("recording"),
        });
        rec && rec.start();
      });
    });
  }
}
