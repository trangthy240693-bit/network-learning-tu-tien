// Loads vocab JSON per branch and parses the packed "examples" field into
// structured {n, target, pron, vi} entries.
const cache = {};

// Chinese/Korean examples are 3-line blocks (sentence / pinyin-romanization /
// Vietnamese). English examples are 2-line blocks (sentence / Vietnamese) —
// sentence-level IPA would only add noise, word-level IPA lives in `pron`.
export function parseExamples(raw, lang) {
  if (!raw) return [];
  const blocks = raw.split("──────────").map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    // First line looks like "1. 我是越南人。" -> strip leading "N. "
    let first = lines[0] || "";
    const m = first.match(/^\d+\.\s*(.*)$/);
    const target = m ? m[1] : first;
    if (lang === "en") return { target, pron: "", vi: lines.slice(1).join(" ") || "" };
    const pron = lines[1] || "";
    const vi = lines.slice(2).join(" ") || "";
    return { target, pron, vi };
  });
}

export function parseExpand(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function loadWords(lang) {
  if (cache[lang]) return cache[lang];
  const res = await fetch(`data/${lang}.json`);
  const rows = await res.json();
  const words = rows.map((r) => ({
    ...r,
    hanvietDisplay: r.hanviet && r.hanviet !== "—" ? r.hanviet : null,
    exampleList: parseExamples(r.examples, lang),
    expandList: parseExpand(r.expand),
    tier: r.section ? (r.section === "core" ? "super" : "low") : (r.stt <= 179 ? "super" : "low"),
  }));
  cache[lang] = words;
  return words;
}

// Compound words of the Hack Hán-Việt section: full learning cards with the same
// shape as the core words, kept in their own file with ids from 1001 so the 625
// core words (and everyone's progress on them) are never renumbered.
export const COMPOUND_BASE = 1000;
let compoundPromise = null;
export function loadCompounds() {
  if (!compoundPromise) {
    compoundPromise = fetch("data/zhc.json")
      .then((r) => r.json())
      .then((rows) => rows.map((r) => ({
        ...r,
        hanvietDisplay: r.hanviet || null,
        exampleList: parseExamples(r.examples, "zh"),
        expandList: parseExpand(r.expand),
        tier: "low",
        section: "compound",
      })))
      .catch(() => []);
  }
  return compoundPromise;
}

// Tiny file so the home page can show "x / total" without downloading a whole
// vocabulary file (English is several MB).
let countsPromise = null;
export function wordCounts() {
  if (!countsPromise) {
    countsPromise = fetch("data/counts.json")
      .then((r) => r.json())
      .catch(() => ({ zh: 625, ko: 625, en: 625 }));
  }
  return countsPromise;
}
export async function wordCount(lang) {
  const c = await wordCounts();
  return c[lang] || 625;
}

export function batchesOf(words, batchSize = 20) {
  const out = [];
  for (let i = 0; i < words.length; i += batchSize) {
    out.push(words.slice(i, i + batchSize));
  }
  return out;
}

const ACCENT_KEY = "nl_en_accent";
export function getEnAccent() {
  try { return localStorage.getItem(ACCENT_KEY) === "en-GB" ? "en-GB" : "en-US"; } catch { return "en-US"; }
}
export function setEnAccent(code) {
  try { localStorage.setItem(ACCENT_KEY, code === "en-GB" ? "en-GB" : "en-US"); } catch { /* private mode */ }
}

export const LANG_META = {
  zh: {
    label: "Tiếng Trung",
    glyph: "🀄",
    voiceLang: "zh-CN",
    sttLang: "zh-CN",
    targetCol: "中文",
  },
  ko: {
    label: "Tiếng Hàn",
    glyph: "🇰🇷",
    voiceLang: "ko-KR",
    sttLang: "ko-KR",
    targetCol: "한국어",
  },
  en: {
    label: "Tiếng Anh",
    glyph: "🔤",
    // US/UK accent is the learner's choice, so the codes are read live.
    get voiceLang() { return getEnAccent(); },
    get sttLang() { return getEnAccent(); },
    targetCol: "English",
  },
};
