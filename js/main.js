import { loadWords, LANG_META } from "./data.js";
import { renderBatchList, renderBatch, renderWordDetail } from "./vocab-tab.js";
import { renderReview } from "./review-tab.js";
import { renderFreeTalk, renderTalkWithGao } from "./freetalk.js";
import { ensureRankBaseline, initRankTracker } from "./rank-tracker.js";
import { mountGaoSupportWidget } from "./support-widget.js";

const params = new URLSearchParams(location.search);
const lang = params.get("lang") === "ko" ? "ko" : "zh";
const meta = LANG_META[lang];

document.getElementById("lang-badge").textContent = meta.label;
document.title = `${meta.label} · Network Learning`;

const ctx = { lang, words: [] };
const root = document.getElementById("main-content");
const tabLinks = document.querySelectorAll(".tabbar a");
const appShell = document.querySelector(".app-shell");
const SEASONS = ["xuan", "ha", "thu", "dong"];

function setActiveTab(section) {
  tabLinks.forEach((a) => a.classList.toggle("active", a.dataset.section === section));
}

function applySeason(batchIndex) {
  if (appShell) appShell.dataset.season = SEASONS[batchIndex % 4];
}

async function route() {
  const hash = location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);

  if (!parts.length || parts[0] === "batches") {
    setActiveTab("vocab");
    return renderBatchList(root, ctx);
  }
  if (parts[0] === "batch" && parts[1] !== undefined) {
    setActiveTab("vocab");
    applySeason(Number(parts[1]));
    return renderBatch(root, ctx, Number(parts[1]));
  }
  if (parts[0] === "word" && parts[1] !== undefined) {
    setActiveTab("vocab");
    applySeason(Math.floor((Number(parts[1]) - 1) / 20));
    return renderWordDetail(root, ctx, parts[1]);
  }
  if (parts[0] === "review") {
    setActiveTab("review");
    return renderReview(root, ctx, parts[1]);
  }
  if (parts[0] === "freetalk" && parts[1] !== undefined) {
    setActiveTab("freetalk");
    return renderFreeTalk(root, ctx, Number(parts[1]));
  }
  if (parts[0] === "talk") {
    setActiveTab("freetalk");
    return renderTalkWithGao(root, ctx);
  }
  setActiveTab("vocab");
  return renderBatchList(root, ctx);
}

async function boot() {
  root.innerHTML = `<div class="empty-state">Đang tải dữ liệu...</div>`;
  ctx.words = await loadWords(lang);
  await ensureRankBaseline(lang);
  initRankTracker();
  mountGaoSupportWidget(ctx);
  if (!location.hash) location.hash = "#/batches";
  route();
}

window.addEventListener("hashchange", route);
boot();
