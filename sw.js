// Offline support. Same-origin files: network-first (so a fresh deploy is
// picked up immediately when online) with cache fallback (so the app still
// opens with no connection). Cross-origin libraries (pinyin-pro, HanziWriter
// and its stroke data) are cached as they're first used.
const CACHE = "nl-cache-v1";
const CORE = [
  "./", "./index.html", "./branch.html", "./manifest.webmanifest",
  "./css/style.css",
  "./js/breakthrough.js", "./js/data.js", "./js/db.js", "./js/freetalk.js",
  "./js/hanviet.js", "./js/main.js", "./js/mascot.js", "./js/profiles.js", "./js/quiz-chat.js",
  "./js/rank-tracker.js", "./js/ranks.js", "./js/review-tab.js", "./js/stt.js",
  "./js/support-widget.js", "./js/tts.js", "./js/vocab-tab.js",
  "./data/zh.json", "./data/ko.json", "./data/counts.json", "./data/hv.json", "./data/hv-rules.json",
  "./assets/gao.jpg", "./assets/tom.jpg", "./assets/swirl-gray.jpg", "./assets/swirl-blue.jpg",
  "./assets/icon-192.png", "./assets/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(CORE.map((u) => c.add(u)))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;
  const sameOrigin = url.origin === location.origin;

  if (sameOrigin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  // Cross-origin static libs: cache-first, refresh in background.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok || res.type === "opaque") caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
