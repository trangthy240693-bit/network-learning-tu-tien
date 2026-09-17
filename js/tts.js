// Web Speech API text-to-speech wrapper. Works best in Chrome.
let voicesReady = false;
let voiceList = [];

function loadVoices() {
  return new Promise((resolve) => {
    const v = speechSynthesis.getVoices();
    if (v.length) {
      voiceList = v;
      voicesReady = true;
      resolve(v);
      return;
    }
    speechSynthesis.onvoiceschanged = () => {
      voiceList = speechSynthesis.getVoices();
      voicesReady = true;
      resolve(voiceList);
    };
  });
}

// True/false once voices are loaded; null if we haven't checked yet. A
// missing voice means the OS has no installed TTS voice for that language —
// speechSynthesis will otherwise silently fall back to the default voice
// (usually English) and either stay silent or mispronounce the text, with
// no error thrown, so callers need this to show an honest message instead.
export async function hasVoiceFor(langCode) {
  if (!voicesReady) await loadVoices();
  return !!(voiceList.find((v) => v.lang === langCode) ||
    voiceList.find((v) => v.lang.startsWith(langCode.split("-")[0])));
}

export function missingVoiceMessage(langLabel) {
  return `⚠️ Máy chưa cài giọng đọc ${langLabel}. Vào Cài đặt Windows ▸ Giờ & Ngôn ngữ ▸ Giọng nói (Speech) ▸ Quản lý giọng nói ▸ Thêm giọng nói, chọn ${langLabel}, tải về rồi quay lại đây.`;
}

export async function speak(text, langCode, rate = 0.95) {
  if (!("speechSynthesis" in window)) {
    console.warn("Web Speech API not supported in this browser.");
    return { ok: false, hadVoice: false };
  }
  if (!voicesReady) await loadVoices();
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = langCode;
  utter.rate = rate;
  const match = voiceList.find((v) => v.lang === langCode) ||
    voiceList.find((v) => v.lang.startsWith(langCode.split("-")[0]));
  if (match) utter.voice = match;
  speechSynthesis.speak(utter);
  return new Promise((resolve) => {
    utter.onend = () => resolve({ ok: true, hadVoice: !!match });
    utter.onerror = () => resolve({ ok: false, hadVoice: !!match });
  });
}

export function isTtsSupported() {
  return "speechSynthesis" in window;
}
