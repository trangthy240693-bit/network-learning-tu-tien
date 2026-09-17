import { Store } from "./db.js";
import { speak } from "./tts.js";
import { tomAvatar, gaoAvatar } from "./mascot.js";
import { LANG_META } from "./data.js";

const BATCH_SIZE = 20;

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip tone/diacritic marks
    .replace(/\s+/g, " ")
    .trim();
}

function meaningCandidates(w) {
  return [w.meaning, w.en].flatMap((v) => (v || "").split(/[\/,;]/)).map(normalize).filter(Boolean);
}

function checkMeaning(answer, w) {
  const ans = normalize(answer);
  if (!ans) return false;
  return meaningCandidates(w).some((c) => ans === c || (ans.length > 2 && (ans.includes(c) || c.includes(ans))));
}

function checkPron(answer, w) {
  const ans = normalize(answer);
  return !!ans && ans === normalize(w.pron);
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDistractors(pool, correct, n = 3) {
  const others = pool.filter((w) => w.stt !== correct.stt);
  return shuffled(others).slice(0, n);
}

// Prioritize words that are actually due (SM-2), fall back to the whole
// known pool once nothing is due yet.
function pickDueWord(pool, progressMap) {
  const now = Date.now();
  const due = pool.filter((w) => (progressMap.get(w.stt)?.srs?.due ?? 0) <= now);
  const source = due.length ? due : pool;
  return source[Math.floor(Math.random() * source.length)];
}

// Shared offline quiz-in-chat-bubbles engine — no AI, no API key, instant.
// Questions are drawn only from words the learner has already started
// (learning/learned), which naturally scales difficulty to their real
// progress instead of needing AI to guess a level.
async function renderQuizShell(root, ctx, opts) {
  const { lang } = ctx;
  const meta = LANG_META[lang];
  const progressAll = await Store.getAllProgress(lang);
  const progressMap = new Map(progressAll.map((p) => [p.stt, p]));
  const pool = opts.words.filter((w) => progressMap.get(w.stt));

  let html = "";
  if (opts.backHref) html += `<a href="${opts.backHref}" class="text-muted" style="text-decoration:none;font-size:13px">← ${opts.backLabel}</a>`;
  if (opts.title) html += `<h2>${opts.title}</h2>`;
  if (opts.introDesc) html += `<div class="chat-intro-desc">${opts.introDesc}</div>`;
  if (opts.chip) html += `<div class="chip" style="margin-bottom:10px">${opts.chip}</div>`;
  if (opts.wordListHtml) html += opts.wordListHtml;

  if (pool.length < 3) {
    html += `<div class="empty-state"><div class="big-emoji">💬</div>Ký chủ mới có ${pool.length} từ để luyện — học thêm vài từ ở Tab Từ vựng rồi quay lại nhắn tin với ${opts.name} nhé!</div>`;
    root.innerHTML = html;
    return;
  }

  html += `
    <div class="card msg-card">
      <div id="chat-log" class="msg-log"></div>
      <div class="msg-input-row" id="msg-row">
        <input class="type-input msg-input" id="msg-input" placeholder="Nhắn câu trả lời..." autocomplete="off" />
        <button class="msg-send-btn" id="msg-send" title="Gửi">➤</button>
      </div>
    </div>
    ${opts.aiHref ? `<a href="${opts.aiHref}" class="text-muted" style="display:block;text-align:center;font-size:12px;margin-top:10px;text-decoration:none">💬 Muốn trò chuyện tự do với AI? (cần API key) →</a>` : ""}
  `;
  root.innerHTML = html;

  const log = document.getElementById("chat-log");
  const inputRow = document.getElementById("msg-row");
  let current = null; // { w, kind }
  let awaitingNext = false;

  function addBubble(text, who) {
    const div = document.createElement("div");
    div.style.cssText = who === "ai" ? "display:flex;gap:8px;align-items:flex-start" : "text-align:right";
    if (who === "ai") {
      div.innerHTML = `<div style="width:36px;flex-shrink:0">${opts.avatar(36)}</div><div class="bubble msg-bubble-ai">${text}<button class="msg-listen-btn" data-t="${encodeURIComponent(text.replace(/<[^>]+>/g, "").trim())}" title="Nghe">🔊</button></div>`;
    } else {
      div.innerHTML = `<div class="bubble msg-bubble-me">${text}</div>`;
    }
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    if (who === "ai") {
      div.querySelector(".msg-listen-btn").addEventListener("click", (e) => {
        speak(decodeURIComponent(e.currentTarget.dataset.t), meta.voiceLang);
      });
    }
    return div;
  }

  async function markResult(w, correct) {
    await Store.recordListenResult(lang, w.stt, correct);
  }

  function askNext() {
    awaitingNext = false;
    const w = pickDueWord(pool, progressMap);
    const kinds = ["meaning", "target", "pron"];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    current = { w, kind };

    if (kind === "meaning") {
      addBubble(`${w.target} (${w.pron}) nghĩa là gì?`, "ai");
      inputRow.classList.remove("hidden");
    } else if (kind === "pron") {
      addBubble(`Gõ phiên âm của ${w.target}?`, "ai");
      inputRow.classList.remove("hidden");
    } else {
      const choices = shuffled([w, ...pickDistractors(pool, w, 3)]);
      const q = document.createElement("div");
      q.style.cssText = "display:flex;gap:8px;align-items:flex-start";
      q.innerHTML = `<div style="width:36px;flex-shrink:0">${opts.avatar(36)}</div><div class="bubble msg-bubble-ai">Từ nào nghĩa là "${w.meaning}"?</div>`;
      log.appendChild(q);
      const choiceRow = document.createElement("div");
      choiceRow.className = "msg-choice-row";
      choiceRow.innerHTML = choices.map((c) => `<button class="msg-choice-btn" data-stt="${c.stt}">${c.target}</button>`).join("");
      log.appendChild(choiceRow);
      log.scrollTop = log.scrollHeight;
      inputRow.classList.add("hidden");
      choiceRow.querySelectorAll(".msg-choice-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (awaitingNext) return;
          awaitingNext = true;
          choiceRow.querySelectorAll(".msg-choice-btn").forEach((b) => (b.disabled = true));
          const correct = Number(btn.dataset.stt) === w.stt;
          btn.classList.add(correct ? "correct" : "wrong");
          addBubble(w.target, "me");
          addBubble(correct ? "Đúng rồi! 🎉" : `Chưa đúng, đáp án là ${w.target} (${w.meaning}).`, "ai");
          await markResult(w, correct);
          setTimeout(askNext, 900);
        });
      });
    }
  }

  const inputEl = document.getElementById("msg-input");
  const sendBtn = document.getElementById("msg-send");
  async function submit() {
    if (awaitingNext || !current) return;
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = "";
    addBubble(text, "me");
    const { w, kind } = current;
    const correct = kind === "meaning" ? checkMeaning(text, w) : checkPron(text, w);
    awaitingNext = true;
    if (correct) {
      addBubble("Đúng rồi! 🎉", "ai");
    } else if (kind === "meaning") {
      addBubble(`Chưa đúng, ${w.target} nghĩa là "${w.meaning}".`, "ai");
    } else {
      addBubble(`Chưa đúng, phiên âm đúng là "${w.pron}".`, "ai");
    }
    await markResult(w, correct);
    setTimeout(askNext, 900);
  }
  sendBtn.addEventListener("click", submit);
  inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

  addBubble(opts.introMessage, "ai");
  askNext();
}

// Tom — nhân viên hỗ trợ cấp nhóm: luyện chỉ trong 20 từ của nhóm hiện tại.
export async function renderTomQuiz(root, ctx, batchIndex) {
  const { words } = ctx;
  const start = batchIndex * BATCH_SIZE;
  const batch = words.slice(start, start + BATCH_SIZE);

  return renderQuizShell(root, ctx, {
    name: "Tom",
    avatar: tomAvatar,
    words: batch,
    backHref: `#/batch/${batchIndex}`,
    backLabel: "Quay lại nhóm từ",
    title: `🐾 Hệ thống Tom — Nhóm ${batchIndex + 1}`,
    introDesc: "Chơi với em đi mà, chơi đi mà~ Em sẽ hỏi đúng từ trong nhóm này để ký chủ ôn cho chắc nhé.",
    chip: `Luyện trong ${batch.length} từ của nhóm này`,
    introMessage: "Chào ký chủ! Mình bắt đầu ôn từ nha, em hỏi ký chủ trả lời thôi 🐾",
    aiHref: `#/freetalk-ai/${batchIndex}`,
  });
}

// Gạo — chủ hệ thống: luyện trên toàn bộ vốn từ đã học/đang học của cả
// nhánh, nên độ khó tự leo theo đúng tiến độ thật, không cần AI đoán trình độ.
export async function renderGaoQuiz(root, ctx) {
  const { words } = ctx;
  return renderQuizShell(root, ctx, {
    name: "Gạo",
    avatar: gaoAvatar,
    words,
    backHref: "#/batches",
    backLabel: "Về Từ vựng",
    title: "👑 Hệ thống Boss Gạo",
    introDesc: "Em ôn theo đúng những từ ký chủ đã học trong cả nhánh — học càng nhiều, câu hỏi càng khó dần, không cần đoán trình độ đâu ạ.",
    chip: "Luyện trên toàn bộ vốn từ đã học của ký chủ",
    introMessage: "Chào ký chủ, Gạo đây ạ 👑 Ôn bài thôi nào!",
    aiHref: "#/talk-ai",
  });
}
