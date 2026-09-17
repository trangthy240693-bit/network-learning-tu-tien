import { Store } from "./db.js";
import { speak } from "./tts.js";
import { createRecognizer, isSttSupported } from "./stt.js";
import { tomAvatar, gaoAvatar } from "./mascot.js";
import { LANG_META } from "./data.js";

export const KEY_STORAGE = "nl_anthropic_api_key";
const BATCH_SIZE = 20;

export function getApiKey() {
  return localStorage.getItem(KEY_STORAGE) || "";
}

export async function callClaude(apiKey, systemPrompt, history) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 400,
      system: systemPrompt,
      messages: history,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API lỗi (${res.status}): ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// Shared chat UI for "Hệ thống Tom" (batch-restricted) and "Hệ thống Boss
// Gạo" (unrestricted) — same mic/chat wiring, different persona, avatar,
// system prompt, word pool (for auto-marking usage) and intro copy.
export async function renderChatShell(root, ctx, opts) {
  const { lang } = ctx;
  const meta = LANG_META[lang];
  const apiKey = getApiKey();
  const avatar = opts.avatar || tomAvatar;

  let html = "";
  if (opts.backHref) html += `<a href="${opts.backHref}" class="text-muted" style="text-decoration:none;font-size:13px">← ${opts.backLabel}</a>`;
  if (opts.title) html += `<h2>${opts.title}</h2>`;
  if (opts.introDesc) html += `<div class="chat-intro-desc">${opts.introDesc}</div>`;
  if (opts.chip) html += `<div class="chip" style="margin-bottom:10px">${opts.chip}</div>`;
  if (opts.wordListHtml) html += opts.wordListHtml;

  if (!apiKey) {
    html += `
      <div class="card">
        <strong>Cần thêm API key để bật hội thoại AI</strong>
        <p class="text-muted" style="font-size:13px">Dán Anthropic API key vào đây (chỉ lưu trên máy ký chủ, không gửi đi đâu khác). Nếu chưa có, ký chủ vẫn dùng được các Tab khác bình thường.</p>
        <input class="type-input" id="key-input" placeholder="sk-ant-..." />
        <button class="btn block mt-16" id="key-save">Lưu key</button>
      </div>`;
    root.innerHTML = html;
    document.getElementById("key-save").addEventListener("click", () => {
      const v = document.getElementById("key-input").value.trim();
      if (v) { localStorage.setItem(KEY_STORAGE, v); opts.rerender(); }
    });
    return;
  }

  const sttOk = isSttSupported();
  html += `
    <div class="card msg-card">
      <div id="chat-log" class="msg-log"></div>
      <div class="msg-input-row">
        ${sttOk ? `<button class="msg-mic-btn" id="msg-mic" title="Đọc để điền vào ô nhắn">🎤</button>` : ""}
        <input class="type-input msg-input" id="msg-input" placeholder="Nhắn tin cho ${opts.name}..." autocomplete="off" />
        <button class="msg-send-btn" id="msg-send" title="Gửi">➤</button>
      </div>
      <div class="text-center text-muted" id="talk-status" style="font-size:12px;margin-top:6px"></div>
    </div>
    <button class="btn ghost block mt-16" id="key-reset">Đổi API key</button>
  `;
  root.innerHTML = html;
  document.getElementById("key-reset").addEventListener("click", () => { localStorage.removeItem(KEY_STORAGE); opts.rerender(); });

  const log = document.getElementById("chat-log");
  const history = [];
  const usedWordsThisSession = new Set();

  function addBubble(text, who) {
    const div = document.createElement("div");
    div.style.cssText = who === "ai" ? "display:flex;gap:8px;align-items:flex-start" : "text-align:right";
    if (who === "ai") {
      div.innerHTML = `<div style="width:36px;flex-shrink:0">${avatar(36)}</div><div class="bubble msg-bubble-ai">${text}<button class="msg-listen-btn" data-t="${encodeURIComponent(text.replace(/\(.*?\)/g, "").trim())}" title="Nghe">🔊</button></div>`;
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
  }

  function detectUsedWords(text) {
    opts.wordPool.forEach((w) => {
      if (text.includes(w.target) && !usedWordsThisSession.has(w.stt)) {
        usedWordsThisSession.add(w.stt);
        Store.markUsedInFreeTalk(lang, w.stt);
      }
    });
  }

  const statusEl = document.getElementById("talk-status");
  const inputEl = document.getElementById("msg-input");
  const sendBtn = document.getElementById("msg-send");

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = "";
    addBubble(text, "me");
    detectUsedWords(text);
    history.push({ role: "user", content: text });
    statusEl.textContent = `${opts.name} đang nhắn lại...`;
    sendBtn.disabled = true;
    try {
      const reply = await callClaude(apiKey, opts.systemPrompt, history);
      history.push({ role: "assistant", content: reply });
      addBubble(reply, "ai");
    } catch (err) {
      addBubble(`⚠️ ${err.message}`, "ai");
    }
    statusEl.textContent = "";
    sendBtn.disabled = false;
    inputEl.focus();
  }

  sendBtn.addEventListener("click", sendMessage);
  inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

  if (sttOk) {
    const micBtn = document.getElementById("msg-mic");
    micBtn.addEventListener("click", () => {
      micBtn.classList.add("recording");
      statusEl.textContent = "Đang nghe...";
      const rec = createRecognizer(meta.sttLang, {
        onResult: (transcript) => {
          inputEl.value = transcript;
          inputEl.focus();
          statusEl.textContent = "Bấm gửi khi ký chủ sẵn sàng.";
        },
        onError: () => { statusEl.textContent = "Không nghe rõ, thử lại nhé."; },
        onEnd: () => micBtn.classList.remove("recording"),
      });
      rec && rec.start();
    });
  }

  addBubble(opts.introMessage, "ai");
}

// Batch-scoped mini practice, entered from inside a vocab batch. Tom is the
// "nhân viên hỗ trợ" at the group level — restricted-but-prioritized to that
// batch's vocabulary so it reinforces exactly what was just studied.
export async function renderFreeTalk(root, ctx, batchIndex) {
  const { lang, words } = ctx;
  const meta = LANG_META[lang];
  const start = batchIndex * BATCH_SIZE;
  const batch = words.slice(start, start + BATCH_SIZE);

  const wordListText = batch.map((w) => `${w.target} (${w.pron}) = ${w.meaning}`).join("; ");
  const systemPrompt = `Bạn là Tom, một chú chó border collie — "hệ thống quèn" nhí nhảnh, luôn khích lệ, không bao giờ chê bai.
Luôn gọi người học là "ký chủ" và tự xưng bản thân là "em" trong mọi câu trả lời.
Ưu tiên dùng các từ vựng sau trong hội thoại để giúp ký chủ củng cố đúng nhóm từ này (vẫn có thể dùng thêm từ vựng cơ bản khác nếu cần để câu tự nhiên, không bắt buộc chỉ dùng đúng những từ này): ${wordListText}.
Khi ký chủ nói sai hoặc dùng từ chưa tự nhiên, nhẹ nhàng sửa lại đúng và mở rộng thêm 1 câu ví dụ ngắn ngay trong lúc trò chuyện — không tách riêng thành bài học ngữ pháp.
Trả lời ngắn gọn (1-3 câu bằng ${meta.label}), kèm nghĩa tiếng Việt trong ngoặc ở cuối.`;

  const wordListHtml = `<details style="margin-bottom:14px"><summary style="cursor:pointer;font-size:13px;color:var(--text-muted)">Xem danh sách từ trong nhóm</summary>
    <div class="word-grid mt-8">${batch.map((w) => `<div class="word-tile" style="cursor:default"><div class="target">${w.target}</div><div class="pron">${w.pron}</div><div class="meaning">${w.meaning}</div></div>`).join("")}</div>
  </details>`;

  return renderChatShell(root, ctx, {
    name: "Tom",
    avatar: tomAvatar,
    backHref: `#/batch/${batchIndex}`,
    backLabel: "Quay lại nhóm từ",
    title: `🐾 Hệ thống Tom — Nhóm ${batchIndex + 1}`,
    introDesc: "Chơi với em đi mà, chơi đi mà~ Em sẽ giúp ký chủ củng cố từ vựng, luyện nói, ưu tiên các từ ngữ trong nhóm này.",
    chip: `Ưu tiên ${batch.length} từ trong nhóm này`,
    wordListHtml,
    systemPrompt,
    wordPool: batch,
    introMessage: `Chào ký chủ! Em là Tom. Em sẽ ưu tiên dùng ${batch.length} từ trong nhóm này khi nhắn tin với ký chủ nhé — nhắn gì cũng được, bắt đầu nào! 🐾`,
    rerender: () => renderFreeTalk(root, ctx, batchIndex),
  });
}

// Unrestricted — peer tab to Từ vựng / Ôn tập. Gạo is the "chủ hệ thống",
// app-wide companion: no vocabulary limit, no fixed task — general support,
// free talk, review, or just casual chat, adapting to the learner's level.
export async function renderTalkWithGao(root, ctx) {
  const { lang, words } = ctx;
  const meta = LANG_META[lang];
  const systemPrompt = `Bạn là Gạo, một chú chó Pomeranian — "chủ hệ thống" thân thiện, đáng yêu, hỗ trợ ký chủ trong mọi việc: luyện nói ${meta.label}, ôn từ vựng, giải đáp thắc mắc, hoặc chỉ đơn giản là tâm sự.
Luôn gọi người học là "ký chủ"; tự xưng bản thân là "em", "Hệ thống", hoặc "người ta" (đổi luân phiên cho tự nhiên, không dùng "tôi/mình").
Không giới hạn chủ đề hay vốn từ — hãy tự nhận biết trình độ hiện tại của ký chủ qua cách họ nói và điều chỉnh độ khó câu trả lời cho phù hợp, không hỏi trình độ HSK/TOPIK.
Luôn khích lệ, không bao giờ chê bai. Khi ký chủ nói sai hoặc dùng từ chưa tự nhiên, nhẹ nhàng sửa lại đúng ngay trong lúc trò chuyện, không tách riêng thành bài học ngữ pháp.
Nếu ký chủ có vẻ bí chủ đề hoặc chủ động hỏi xin gợi ý, hãy đề xuất 1-2 chủ đề hoặc câu hỏi mở để họ nói tiếp — nhưng đừng ép nếu không cần.
Trả lời ngắn gọn (1-3 câu bằng ${meta.label}), kèm nghĩa tiếng Việt trong ngoặc ở cuối.`;

  return renderChatShell(root, ctx, {
    name: "Gạo",
    avatar: gaoAvatar,
    backHref: "#/batches",
    backLabel: "Về Từ vựng",
    title: "👑 Hệ thống Boss Gạo",
    introDesc: "Em sẽ hỗ trợ ký chủ trong mọi nhiệm vụ, app, tâm sự, nói chuyện, ôn bài cùng ký chủ. Em đa năng hơn con Tom nhiều, sen trung thành đây ạ ^^",
    chip: "Không giới hạn từ vựng — Gạo tự điều chỉnh theo trình độ của ký chủ",
    wordListHtml: "",
    systemPrompt,
    wordPool: words,
    introMessage: `Chào ký chủ, Gạo đây ạ 👑 Cứ nói chuyện thoải mái bằng ${meta.label} nhé, em sẽ theo kịp trình độ của ký chủ. Cần gợi ý chủ đề hay tâm sự gì cũng được, em nghe hết!`,
    rerender: () => renderTalkWithGao(root, ctx),
  });
}
