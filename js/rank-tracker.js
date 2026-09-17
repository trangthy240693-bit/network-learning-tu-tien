// Listens for word-learned events and fires the breakthrough celebration
// whenever the learner's % crosses into a new Tu Tiên rank.
import { Store } from "./db.js";
import { rankForPct } from "./ranks.js";
import { showBreakthroughOverlay } from "./breakthrough.js";

const TOTAL_WORDS = 625;

export async function currentRank(lang) {
  const all = await Store.getAllProgress(lang);
  const learned = all.filter((p) => p.status === "learned").length;
  const pct = (learned / TOTAL_WORDS) * 100;
  return { rank: rankForPct(pct), pct, learned };
}

async function checkRankUp(lang) {
  const { rank } = await currentRank(lang);
  const metaKey = `rank_${lang}`;
  const storedId = await Store.getMeta(metaKey);
  if (storedId === rank.id) return;
  await Store.setMeta(metaKey, rank.id);
  if (storedId !== null) showBreakthroughOverlay(rank);
}

// Call once at boot so a brand-new learner's baseline is recorded before any
// real crossing happens — otherwise the very first breakthrough would look
// like "first check ever" and get silently skipped.
export async function ensureRankBaseline(lang) {
  const metaKey = `rank_${lang}`;
  const storedId = await Store.getMeta(metaKey);
  if (storedId === null) {
    const { rank } = await currentRank(lang);
    await Store.setMeta(metaKey, rank.id);
  }
}

let wired = false;
export function initRankTracker() {
  if (wired) return;
  wired = true;
  window.addEventListener("nl:progress-changed", (e) => checkRankUp(e.detail.lang));
}
