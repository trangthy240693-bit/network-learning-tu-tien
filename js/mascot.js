// Tom (border collie, "hệ thống quèn" — junior/batch-level assistant) and
// Gạo (Pomeranian, "chủ hệ thống" — the boss, app-wide companion). Real
// photos cropped to circle avatars, plus each one's message bank.

export function tomAvatar(size = 52) {
  return `<img src="assets/tom.jpg" alt="Tom" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;display:block;flex-shrink:0;" />`;
}
export function gaoAvatar(size = 52) {
  return `<img src="assets/gao.jpg" alt="Gạo" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;display:block;flex-shrink:0;" />`;
}
// Backward-compatible alias — existing call sites treat mascotSvg as Tom.
export const mascotSvg = tomAvatar;

const TOM_MESSAGES = {
  welcome: [
    "Chào ký chủ! Em là Tom 🐾 Học từ từ thôi, không vội đâu nhé!",
    "Hôm nay học gì cũng được, em luôn ở đây cùng ký chủ.",
  ],
  batchStart: [
    "Nhóm từ mới đây ạ! Ký chủ thích luyện kỹ năng nào trước cũng được nha.",
    "Không cần làm hết mọi kỹ năng đâu, ký chủ chọn cái thấy hợp nhất thôi.",
  ],
  correct: ["Chuẩn luôn! 🎉", "Ký chủ giỏi ghê đó!", "Đúng rồi, tiếp tục nhé!", "Quá tốt!"],
  wrong: [
    "Không sao cả, ký chủ thử lại nhé!",
    "Gần đúng rồi, ký chủ cố thêm chút nữa!",
    "Chưa đúng nhưng không vấn đề gì, em ghi lại để ký chủ học lại từ này sau nhé.",
  ],
  skip: ["Ok, bỏ qua từ này, ký chủ học từ khác trước nhé!", "Không sao, em để dành từ này lại sau."],
  flagSet: ["Từ này em sẽ nhắc ký chủ ôn lại thêm vài lần nhé."],
  flagCleared: ["Ký chủ nhớ từ này rồi đó! Em gỡ cờ nha 🚩➡️✅"],
  freetalkDone: ["Nói chuyện vui ghê! Những từ ký chủ dùng đúng, em đã đánh dấu là thuộc rồi."],
  encourageGeneric: ["Cứ từ từ, mỗi ngày một chút là ổn rồi ký chủ ơi!", "Ký chủ đang làm rất tốt đó!"],
};

export function mascotSay(kind) {
  const list = TOM_MESSAGES[kind] || TOM_MESSAGES.encourageGeneric;
  return list[Math.floor(Math.random() * list.length)];
}

export function mascotBubble(kind, size = 52) {
  const text = mascotSay(kind);
  return `<div class="mascot-bubble">
    <div class="mascot-img">${tomAvatar(size)}</div>
    <div class="bubble">${text}</div>
  </div>`;
}

const GAO_MESSAGES = {
  worldIntro: [
    "Ký chủ đến rồi à~ Hệ thống là Gạo, quản toàn bộ thế giới tu tiên này. Chọn một nhánh tiếng Trung hoặc tiếng Hàn bên dưới để bắt đầu con đường tu luyện của ký chủ nhé. Nếu ký chủ muốn sớm đắc đạo thành tiên thì tu cả 2 môn công pháp luôn cũng được. Hệ thống sẽ luôn cấp tài nguyên bàn tay vàng cho ký chủ, đảm bảo thăng cấp hị hị.",
  ],
};

export function gaoSay(kind) {
  const list = GAO_MESSAGES[kind] || GAO_MESSAGES.worldIntro;
  return list[Math.floor(Math.random() * list.length)];
}

export function gaoBubble(text, size = 52) {
  return `<div class="mascot-bubble">
    <div class="mascot-img">${gaoAvatar(size)}</div>
    <div class="bubble">${text}</div>
  </div>`;
}
