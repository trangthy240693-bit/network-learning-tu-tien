// Rank-up "đột phá" (breakthrough) celebration: Tom shouts first (excitable,
// calls Gạo "đại nhân", himself "nô tài"), then Gạo confirms — short, dignified,
// always "Ding~". Never any threat/penalty/loss language, per spec.
import { tomAvatar, gaoAvatar } from "./mascot.js";

const SCRIPTED = {
  "luyen-khi": {
    tom: "Ting ting ting! Có... có động tĩnh linh khí! Đại nhân đại nhân, ký chủ vừa cảm ứng được linh khí rồi ạ!!",
    gao: "Ding. Chúc mừng ký chủ. Chính thức bước vào Luyện Khí kỳ. Con đường tu tiên bắt đầu từ đây.",
  },
  "ket-dan": {
    tom: "TRỜI ƠI KIM ĐAN THÀNH RỒI!! Đại nhân ơi mau xem, ký chủ vừa ngưng đan thành công, nô tài xúc động quá!!",
    gao: "Ding~ Chúc mừng ký chủ kết thành Kim Đan, chính thức trở thành cao thủ tông môn. Đây là bước ngoặt — từ giờ tu vi sẽ tăng nhanh hơn.",
  },
  "do-kiep": {
    tom: "Sấm sét đánh mà ký chủ vẫn đứng vững, nô tài phục sát đất luôn á!!",
    gao: "Ding! Thiên kiếp đã tan. Ký chủ chính thức phi thăng, bước chân vào Tiên Giới. Đại nhân, từ nay xưng hô đã khác.",
  },
  "dao-to": {
    tom: "Đạo Tổ giáng lâm!!! Nô tài xin được làm đệ tử ghi danh từ hôm nay ạ!!",
    gao: "Ding~~~ Chúc mừng ký chủ chứng đạo Đạo Tổ. 625 từ đã trong lòng bàn tay. Từ hôm nay, ký chủ chính là truyền kỳ.",
  },
};

const TOM_EXCLAIM = [
  "Oa oa oa, có chuyện lớn rồi! Đại nhân đại nhân, mau ra xem ký chủ nè!!",
  "Ting ting! Nô tài cảm nhận được biến động tu vi cực mạnh luôn á!!",
  "Hình như... hình như ký chủ sắp đột phá rồi, đại nhân ơi!!",
  "Nô tài chạy muốn hụt hơi luôn, ký chủ mạnh lên nhanh quá trời!!",
];

function genericDialogue(rank) {
  return {
    tom: `${TOM_EXCLAIM[Math.floor(Math.random() * TOM_EXCLAIM.length)]} Ký chủ vừa đột phá lên ${rank.icon} ${rank.name} rồi ạ!!`,
    gao: `Con Tom dạt ra. Ding~ Chúc mừng ký chủ đột phá ${rank.name}. ${rank.desc}`,
  };
}

function dialogueFor(rank) {
  return SCRIPTED[rank.id] || genericDialogue(rank);
}

export function showBreakthroughOverlay(rank) {
  const { tom, gao } = dialogueFor(rank);
  const overlay = document.createElement("div");
  overlay.className = "breakthrough-overlay";
  overlay.innerHTML = `
    <div class="breakthrough-burst"></div>
    <div class="breakthrough-card">
      <div class="breakthrough-icon">${rank.icon}</div>
      <div class="breakthrough-stage">${rank.stage}</div>
      <div class="breakthrough-name">${rank.name}</div>
      <div class="breakthrough-lines">
        <div class="breakthrough-line tom" style="opacity:0">
          <div class="mascot-img">${tomAvatar(40)}</div>
          <div class="bubble">${tom}</div>
        </div>
        <div class="breakthrough-line gao" style="opacity:0">
          <div class="mascot-img">${gaoAvatar(40)}</div>
          <div class="bubble">${gao}</div>
        </div>
      </div>
      <button class="btn block mt-16" id="breakthrough-close" style="opacity:0">Tu luyện tiếp thôi!</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const fadeIn = (sel, delay) => {
    setTimeout(() => {
      const el = overlay.querySelector(sel);
      if (el) { el.style.transition = "opacity 0.4s ease"; el.style.opacity = "1"; }
    }, delay);
  };
  fadeIn(".tom", 500);
  fadeIn(".gao", 1500);
  fadeIn("#breakthrough-close", 2200);

  overlay.querySelector("#breakthrough-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
}
