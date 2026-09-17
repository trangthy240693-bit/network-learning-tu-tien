// Persistent floating "customer support" widget — Gạo, available on every
// screen, for grammar questions, how-to-use-the-app help, or just casual
// chat while studying. Separate from the full-page "Hệ thống Boss Gạo" tab.
// Draggable: the learner can park it anywhere on screen; position persists
// (per browser) via localStorage.
import { gaoAvatar } from "./mascot.js";
import { renderChatShell } from "./freetalk.js";
import { LANG_META } from "./data.js";

const POS_KEY = "nl_gao_fab_pos";
let mounted = false;

function loadPos() {
  try { return JSON.parse(localStorage.getItem(POS_KEY) || "null"); } catch { return null; }
}
function savePos(x, y) {
  try { localStorage.setItem(POS_KEY, JSON.stringify({ x, y })); } catch {}
}

export function mountGaoSupportWidget(ctx) {
  if (mounted) return;
  mounted = true;

  const fab = document.createElement("button");
  fab.id = "gao-support-fab";
  fab.className = "gao-support-fab";
  fab.innerHTML = gaoAvatar(44);
  fab.title = "Hệ thống Boss Gạo — kéo để di chuyển";
  document.body.appendChild(fab);

  const panel = document.createElement("div");
  panel.id = "gao-support-panel";
  panel.className = "gao-support-panel hidden";
  panel.innerHTML = `
    <div class="gao-support-head">
      <span>👑 Hệ thống Boss Gạo sẵn sàng nhận lệnh</span>
      <button class="icon-btn" id="gao-support-close">✕</button>
    </div>
    <div class="gao-support-body" id="gao-support-body"></div>
  `;
  document.body.appendChild(panel);

  const savedPos = loadPos();
  if (savedPos) {
    fab.style.left = `${savedPos.x}px`;
    fab.style.top = `${savedPos.y}px`;
    fab.style.right = "auto";
    fab.style.bottom = "auto";
  }

  function positionPanelNearFab() {
    const r = fab.getBoundingClientRect();
    const panelW = 340;
    const spaceAbove = r.top;
    const openUpward = spaceAbove > 420;
    panel.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - panelW - 12))}px`;
    panel.style.right = "auto";
    if (openUpward) {
      panel.style.bottom = `${window.innerHeight - r.top + 10}px`;
      panel.style.top = "auto";
    } else {
      panel.style.top = `${r.bottom + 10}px`;
      panel.style.bottom = "auto";
    }
  }

  let loaded = false;
  function open() {
    positionPanelNearFab();
    panel.classList.remove("hidden");
    fab.classList.add("active");
    if (!loaded) {
      loaded = true;
      const meta = LANG_META[ctx.lang];
      const systemPrompt = `Bạn là Gạo, một chú chó Pomeranian đáng yêu, đóng vai trợ lý hỗ trợ nhanh (customer support) cho app học ${meta.label} "Network Learning".
Luôn gọi người học là "ký chủ"; tự xưng bản thân là "em", "Hệ thống", hoặc "người ta" (đổi luân phiên cho tự nhiên, không dùng "tôi/mình").
Nhiệm vụ: trả lời thắc mắc về ngữ pháp, cách dùng từ, cách dùng các tính năng của app (Từ vựng, Ôn tập, Hệ thống Tom/Gạo), hoặc chỉ trò chuyện/tâm sự cùng ký chủ khi cần.
Trả lời ngắn gọn, thân thiện, dễ hiểu, có thể xen tiếng Việt và ${meta.label}. Luôn khích lệ, không bao giờ chê bai.`;
      renderChatShell(document.getElementById("gao-support-body"), ctx, {
        name: "Gạo",
        avatar: gaoAvatar,
        backHref: "",
        backLabel: "",
        title: "",
        introDesc: "",
        chip: "",
        wordListHtml: "",
        systemPrompt,
        wordPool: ctx.words,
        introMessage: "Ký chủ cần em giúp gì nè? Hỏi ngữ pháp, hỏi cách dùng app, hay chỉ muốn tám chuyện cũng được ạ 🐾",
        rerender: () => { loaded = false; open(); },
      });
    }
  }
  function close() {
    panel.classList.add("hidden");
    fab.classList.remove("active");
  }

  // Drag-to-reposition: a real drag (moved beyond a small threshold) repositions
  // the FAB and suppresses the click; anything shorter counts as a tap that
  // opens/closes the panel.
  let dragging = false;
  let moved = false;
  let startX = 0, startY = 0, origX = 0, origY = 0;

  fab.addEventListener("pointerdown", (e) => {
    dragging = true;
    moved = false;
    fab.setPointerCapture(e.pointerId);
    const r = fab.getBoundingClientRect();
    origX = r.left;
    origY = r.top;
    startX = e.clientX;
    startY = e.clientY;
  });
  fab.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
    if (!moved) return;
    const size = 56;
    const x = Math.max(6, Math.min(window.innerWidth - size - 6, origX + dx));
    const y = Math.max(6, Math.min(window.innerHeight - size - 6, origY + dy));
    fab.style.left = `${x}px`;
    fab.style.top = `${y}px`;
    fab.style.right = "auto";
    fab.style.bottom = "auto";
    if (!panel.classList.contains("hidden")) positionPanelNearFab();
  });
  fab.addEventListener("pointerup", (e) => {
    dragging = false;
    fab.releasePointerCapture(e.pointerId);
    if (moved) {
      const r = fab.getBoundingClientRect();
      savePos(r.left, r.top);
    } else {
      panel.classList.contains("hidden") ? open() : close();
    }
  });

  panel.querySelector("#gao-support-close").addEventListener("click", close);
  window.addEventListener("resize", () => { if (!panel.classList.contains("hidden")) positionPanelNearFab(); });
}
