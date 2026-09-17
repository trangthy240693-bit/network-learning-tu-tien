// Web Speech API speech-to-text wrapper. Best support in Chrome.
export function isSttSupported() {
  return "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
}

export function createRecognizer(langCode, { onResult, onEnd, onError } = {}) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return null;
  const rec = new Recognition();
  rec.lang = langCode;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    onResult && onResult(transcript);
  };
  rec.onend = () => onEnd && onEnd();
  rec.onerror = (e) => onError && onError(e);
  return rec;
}

// Records raw audio (for sending to a pronunciation-feedback API later).
export async function recordAudio(maxMs = 6000) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: "audio/webm" }));
    };
  });
  recorder.start();
  return {
    stop: () => recorder.stop(),
    blobPromise: done,
    autoStopTimer: setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, maxMs),
  };
}
