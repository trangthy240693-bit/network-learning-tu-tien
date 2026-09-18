// Minimal promise-based IndexedDB wrapper for persistent per-branch progress.
const DB_NAME = "nl_app_db";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("progress")) {
        db.createObjectStore("progress", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("reviewLog")) {
        db.createObjectStore("reviewLog", { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

let dbPromise = null;
function getDb() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// SM-2-lite spaced repetition: schedules when a word should resurface in the
// listening quiz, independent of the simpler streak-based "learned" flag
// below (that flag still drives the mnemonic/rank system; this drives *when*
// a due word gets prioritized for review).
function scheduleSM2(srs, correct) {
  let { ease = 2.5, interval = 0, reps = 0 } = srs || {};
  if (correct) {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round(interval * ease);
    ease = Math.min(3.2, ease + 0.1);
  } else {
    reps = 0;
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
  }
  return { ease, interval, reps, due: Date.now() + interval * DAY_MS };
}

function tx(storeName, mode) {
  return getDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

export const Store = {
  async getProgress(lang, stt) {
    const store = await tx("progress", "readonly");
    return new Promise((resolve, reject) => {
      const req = store.get(`${lang}_${stt}`);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async getAllProgress(lang) {
    const store = await tx("progress", "readonly");
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []).filter((p) => p.lang === lang));
      req.onerror = () => reject(req.error);
    });
  },

  async putProgress(p) {
    const store = await tx("progress", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(p);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async ensureProgress(lang, stt) {
    let p = await this.getProgress(lang, stt);
    if (!p) {
      p = {
        id: `${lang}_${stt}`,
        lang,
        stt,
        status: "new", // new | learning | learned
        flag: false,
        listenStreakCorrect: 0,
        listenStreakWrong: 0,
        readWrongCounts: {}, // { exampleIndex: wrongCount }
        readFlags: [],       // [exampleIndex, ...] currently flagged for "Ôn đọc"
        skills: { listen: false, speak: false, read: false, write: false },
        srs: { ease: 2.5, interval: 0, reps: 0, due: Date.now() },
        lastSeen: Date.now(),
      };
      await this.putProgress(p);
    }
    return p;
  },

  async markSkillDone(lang, stt, skill) {
    const p = await this.ensureProgress(lang, stt);
    p.skills[skill] = true;
    p.lastSeen = Date.now();
    const doneCount = Object.values(p.skills).filter(Boolean).length;
    if (p.status === "new") p.status = "learning";
    if (doneCount >= 2 && p.status === "learning") p.status = "learning";
    await this.putProgress(p);
    return p;
  },

  // Auto flag rule from Mục 3 (listening quiz): 3 correct in a row unflags,
  // 2 wrong in a row (re)flags.
  async recordListenResult(lang, stt, correct) {
    const p = await this.ensureProgress(lang, stt);
    p.srs = scheduleSM2(p.srs, correct);
    if (correct) {
      p.listenStreakCorrect += 1;
      p.listenStreakWrong = 0;
      if (p.listenStreakCorrect >= 3) {
        p.flag = false;
        p.status = "learned";
      }
    } else {
      p.listenStreakWrong += 1;
      p.listenStreakCorrect = 0;
      if (p.listenStreakWrong >= 2) {
        p.flag = true;
        if (p.status === "learned") p.status = "learning";
      }
    }
    p.lastSeen = Date.now();
    await this.putProgress(p);
    if (p.status === "learned") window.dispatchEvent(new CustomEvent("nl:progress-changed", { detail: { lang } }));
    return p;
  },

  // Reading (mic pronunciation check on one example sentence): 5 mispronounced
  // attempts on THAT sentence auto-flags it into "Ôn đọc"; a correct read
  // resets its counter. Per-sentence, not per-word — a word can have some
  // flagged examples and some not.
  async recordReadResult(lang, stt, exampleIndex, correct) {
    const p = await this.ensureProgress(lang, stt);
    p.readWrongCounts = p.readWrongCounts || {};
    p.readFlags = p.readFlags || [];
    if (correct) {
      p.readWrongCounts[exampleIndex] = 0;
    } else {
      p.readWrongCounts[exampleIndex] = (p.readWrongCounts[exampleIndex] || 0) + 1;
      if (p.readWrongCounts[exampleIndex] >= 5 && !p.readFlags.includes(exampleIndex)) {
        p.readFlags.push(exampleIndex);
      }
    }
    p.lastSeen = Date.now();
    await this.putProgress(p);
    return p;
  },

  // Manual flag toggle — the learner can flag/unflag any example sentence
  // themselves, independent of the auto-flag-at-5-misses rule.
  async toggleReadFlag(lang, stt, exampleIndex) {
    const p = await this.ensureProgress(lang, stt);
    p.readFlags = p.readFlags || [];
    const i = p.readFlags.indexOf(exampleIndex);
    if (i >= 0) p.readFlags.splice(i, 1);
    else p.readFlags.push(exampleIndex);
    await this.putProgress(p);
    return p;
  },

  async clearReadFlag(lang, stt, exampleIndex) {
    const p = await this.ensureProgress(lang, stt);
    p.readFlags = (p.readFlags || []).filter((i) => i !== exampleIndex);
    if (p.readWrongCounts) p.readWrongCounts[exampleIndex] = 0;
    await this.putProgress(p);
    return p;
  },

  // Used correctly in free-talk -> unflag directly.
  async markUsedInFreeTalk(lang, stt) {
    const p = await this.ensureProgress(lang, stt);
    p.srs = scheduleSM2(p.srs, true);
    p.flag = false;
    p.status = "learned";
    p.lastSeen = Date.now();
    await this.putProgress(p);
    window.dispatchEvent(new CustomEvent("nl:progress-changed", { detail: { lang } }));
    return p;
  },

  async getMeta(key) {
    const store = await tx("meta", "readonly");
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  },

  async setMeta(key, value) {
    const store = await tx("meta", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async addReviewLog(entry) {
    const store = await tx("reviewLog", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.add({ ...entry, ts: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  // Full-DB backup/restore (progress + meta, both languages) so a learner's
  // history survives a cleared cache or a move to another device/browser.
  async exportAll() {
    const db = await getDb();
    const [progress, meta] = await Promise.all([
      new Promise((resolve, reject) => {
        const req = db.transaction("progress", "readonly").objectStore("progress").getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }),
      new Promise((resolve, reject) => {
        const req = db.transaction("meta", "readonly").objectStore("meta").getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }),
    ]);
    return { app: "network-learning", version: 1, exportedAt: Date.now(), progress, meta };
  },

  async importAll(data) {
    if (!data || !Array.isArray(data.progress)) throw new Error("File sao lưu không hợp lệ.");
    const db = await getDb();
    await new Promise((resolve, reject) => {
      const t = db.transaction("progress", "readwrite");
      const store = t.objectStore("progress");
      data.progress.forEach((p) => store.put(p));
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
    if (Array.isArray(data.meta)) {
      await new Promise((resolve, reject) => {
        const t = db.transaction("meta", "readwrite");
        const store = t.objectStore("meta");
        data.meta.forEach((m) => store.put(m));
        t.oncomplete = resolve;
        t.onerror = () => reject(t.error);
      });
    }
  },
};
