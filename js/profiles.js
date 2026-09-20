// Multiple learners on one device: each profile gets its own IndexedDB
// database and its own auto-backup slot. The original single-user data
// lives on as the "default" profile, so nothing existing is lost.
const LIST_KEY = "nl_profiles_v1";
const CUR_KEY = "nl_current_profile_v1";

function readList() {
  try {
    const l = JSON.parse(localStorage.getItem(LIST_KEY));
    if (Array.isArray(l) && l.length) return l;
  } catch { /* fall through */ }
  return [{ id: "default", name: "Ký chủ" }];
}
function writeList(list) {
  try { localStorage.setItem(LIST_KEY, JSON.stringify(list)); } catch { /* private mode */ }
}

export function listProfiles() { return readList(); }

export function currentProfileId() {
  let cur = null;
  try { cur = localStorage.getItem(CUR_KEY); } catch { /* ignore */ }
  const list = readList();
  return list.some((p) => p.id === cur) ? cur : list[0].id;
}

export function currentProfile() {
  const id = currentProfileId();
  return readList().find((p) => p.id === id);
}

export function dbNameFor(id) { return id === "default" ? "nl_app_db" : `nl_app_db_${id}`; }
export function mirrorKeyFor(id) { return id === "default" ? "nl_auto_backup_v1" : `nl_auto_backup_v1_${id}`; }

export function setCurrentProfile(id) {
  try { localStorage.setItem(CUR_KEY, id); } catch { /* ignore */ }
}

export function addProfile(name) {
  const list = readList();
  const id = "p" + Date.now().toString(36);
  list.push({ id, name: name.trim() || "Người học mới" });
  writeList(list);
  setCurrentProfile(id);
  return id;
}

export function renameProfile(id, name) {
  const list = readList().map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p));
  writeList(list);
}

export async function deleteProfile(id) {
  const list = readList();
  if (list.length <= 1) return false;
  writeList(list.filter((p) => p.id !== id));
  try { localStorage.removeItem(mirrorKeyFor(id)); } catch { /* ignore */ }
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(dbNameFor(id));
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  if (currentProfileId() === id) setCurrentProfile(readList()[0].id);
  return true;
}
