/** Bell-badge seen store — desktop-style "unseen announcements" that resets per
    login and per day, so the badge reappears on the next session instead of
    staying hidden forever (PWA/Capacitor webviews never reload the page).

    Stored shape: { ownerKey: "<user_id>:<YYYY-MM-DD>", ids: number[] }.
    ownerKey mismatch (new day / different user / fresh login) ⇒ seen resets. */

const NOTIFY_SEEN_KEY = "m-notify-seen";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function notifySeenOwnerKey(userId) {
  return `${userId ?? "anon"}:${todayKey()}`;
}

export function readNotifySeen() {
  if (typeof localStorage === "undefined") return { ownerKey: "", ids: [] };
  try {
    const raw = localStorage.getItem(NOTIFY_SEEN_KEY);
    if (!raw) return { ownerKey: "", ids: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.ids)) {
      return { ownerKey: "", ids: [] };
    }
    return {
      ownerKey: String(parsed.ownerKey || ""),
      ids: parsed.ids.map(Number).filter((n) => Number.isFinite(n) && n > 0),
    };
  } catch {
    return { ownerKey: "", ids: [] };
  }
}

export function saveNotifySeen(ownerKey, ids) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      NOTIFY_SEEN_KEY,
      JSON.stringify({ ownerKey: String(ownerKey || ""), ids: [...ids] }),
    );
  } catch {
    /* quota — badge simply resets next boot */
  }
}

/** Called on successful login so every session starts with the badge visible. */
export function resetNotifySeen() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(NOTIFY_SEEN_KEY);
  } catch {
    /* ignore */
  }
}
