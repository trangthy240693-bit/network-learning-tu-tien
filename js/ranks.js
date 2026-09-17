// Tu Tiên (cultivation) rank ladder — 16 realms mapped to % of the 625-word
// core path learned. Order and thresholds are authoritative per the user's
// spec; descriptions are the flavor text they provided, condensed.
export const RANKS = [
  { id: "pham-nhan", name: "Phàm Nhân", stage: "Hạ cảnh giới", icon: "🌱", threshold: 0,
    desc: "Người bình thường, chưa cảm ứng được linh khí trời đất." },
  { id: "luyen-khi", name: "Luyện Khí (Tụ Khí)", stage: "Hạ cảnh giới", icon: "💨", threshold: 6,
    desc: "Cảm ứng và hấp thụ linh khí vào cơ thể, tích tụ trong đan điền. Tuổi thọ tăng nhẹ (khoảng 100–120 tuổi)." },
  { id: "truc-co", name: "Trúc Cơ", stage: "Hạ cảnh giới", icon: "🪨", threshold: 12,
    desc: "Hóa lỏng linh khí trong đan điền, xây nền móng vững chắc. Thọ nguyên tăng lên 200–300 tuổi, có thể ngự kiếm phi hành." },
  { id: "ket-dan", name: "Kết Đan (Kim Đan Kỳ)", stage: "Hạ cảnh giới", icon: "🟡", threshold: 19,
    desc: "Nén linh khí thể lỏng thành một viên Kim Đan cốt lõi — cao thủ của các tông môn nhỏ. Tuổi thọ đạt 500–800 tuổi." },
  { id: "nguyen-anh", name: "Nguyên Anh (Lão Quái)", stage: "Trung cảnh giới", icon: "👶", threshold: 25,
    desc: "Phá vỡ Kim Đan để sinh ra Nguyên Anh nằm trong đan điền. Tuổi thọ trên 1.000 tuổi." },
  { id: "hoa-than", name: "Hóa Thần", stage: "Trung cảnh giới", icon: "🔥", threshold: 31,
    desc: "Nguyên Anh trưởng thành, thần thức bao phủ cả một tòa thành. Bắt đầu vận dụng Quy luật/Đạo pháp trời đất. Tuổi thọ hơn 2.000 tuổi." },
  { id: "luyen-hu", name: "Luyện Hư", stage: "Trung cảnh giới", icon: "🌫️", threshold: 38,
    desc: "Cơ thể và linh hồn hòa quyện vào hư không, có thể thuấn di (dịch chuyển tức thời) ở khoảng cách xa." },
  { id: "hop-the", name: "Hợp Thể", stage: "Thượng cảnh giới", icon: "⚡", threshold: 44,
    desc: "Thần hồn và nhục thân hoàn toàn hợp nhất làm một, năng lượng vô hạn." },
  { id: "dai-thua", name: "Đại Thừa", stage: "Thượng cảnh giới", icon: "🌕", threshold: 50,
    desc: "Cảnh giới viên mãn của nhân gian — sức mạnh đạt đỉnh cao nhất mà thế giới phàm trần có thể chịu đựng." },
  { id: "do-kiep", name: "Độ Kiếp (Phi Thăng Kỳ)", stage: "Thượng cảnh giới", icon: "⛈️", threshold: 56,
    desc: "Hứng chịu Thiên Kiếp. Vượt qua thành công sẽ cải tạo thành Tiên thể và phi thăng lên Tiên giới." },
  { id: "chan-tien", name: "Chân Tiên", stage: "Tiên Giới", icon: "✨", threshold: 63,
    desc: "Chính thức trở thành Tiên nhân, bước những bước đầu tiên nơi Thượng giới." },
  { id: "kim-tien", name: "Kim Tiên", stage: "Tiên Giới", icon: "🌟", threshold: 69,
    desc: "Đạo hạnh thâm hậu, danh tiếng vang khắp Tiên giới." },
  { id: "dai-la-kim-tien", name: "Đại La Kim Tiên", stage: "Tiên Giới", icon: "💫", threshold: 75,
    desc: "Một trong những cảnh giới cao nhất của hàng Tiên nhân." },
  { id: "tien-vuong", name: "Tiên Vương", stage: "Tiên Giới", icon: "👑", threshold: 81,
    desc: "Đứng đầu một phương Tiên giới, quyền năng trải rộng." },
  { id: "tien-ton", name: "Tiên Tôn", stage: "Tiên Giới", icon: "🏯", threshold: 88,
    desc: "Bậc tôn kính của cả Tiên giới, ít ai sánh kịp." },
  { id: "dao-to", name: "Đạo Tổ (Thần Minh)", stage: "Tiên Giới", icon: "☯️", threshold: 100,
    desc: "625 từ đã trong lòng bàn tay. Từ nay, ký chủ chính là truyền kỳ." },
];

export function rankForPct(pct) {
  let current = RANKS[0];
  for (const r of RANKS) {
    if (pct >= r.threshold) current = r;
  }
  return current;
}

export function rankIndex(rankId) {
  return RANKS.findIndex((r) => r.id === rankId);
}

export function nextRank(rankId) {
  const i = rankIndex(rankId);
  return i >= 0 && i < RANKS.length - 1 ? RANKS[i + 1] : null;
}
