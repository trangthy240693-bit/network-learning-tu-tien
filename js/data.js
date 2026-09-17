// Loads vocab JSON per branch and parses the packed "examples" field into
// structured {n, target, pron, vi} entries.
const cache = {};

export function parseExamples(raw) {
  if (!raw) return [];
  const blocks = raw.split("──────────").map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    // First line looks like "1. 我是越南人。" -> strip leading "N. "
    let first = lines[0] || "";
    const m = first.match(/^\d+\.\s*(.*)$/);
    const target = m ? m[1] : first;
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
    exampleList: parseExamples(r.examples),
    expandList: parseExpand(r.expand),
    tier: r.stt <= 179 ? "super" : "low",
  }));
  cache[lang] = words;
  return words;
}

export function batchesOf(words, batchSize = 20) {
  const out = [];
  for (let i = 0; i < words.length; i += batchSize) {
    out.push(words.slice(i, i + batchSize));
  }
  return out;
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
};
