/** Scope entries: company/group × currency × date (session-sized LRU). */
const MAX_ENTRIES = 512;
/** Per-company dashboard_api payload dedupe (session-sized LRU). */
const MAX_PAYLOAD_ENTRIES = 1024;

let sessionOwnerKey = "";
let sessionBootstrapDone = false;
let sessionWarmDone = false;

/** @type {Map<string, { current: unknown, previous: unknown, earnings?: Array<{ code: string, earnings: number }> }>} */
const store = new Map();

/** In-memory dedupe for dashboard_api.php payloads (same query = one network call). */
/** @type {Map<string, unknown>} */
const payloadStore = new Map();

export function buildDashboardCacheKey({
  companyId,
  dateFrom,
  dateTo,
  currencyCode,
  selectedGroup,
  groupAllMode,
  mergedSubsetIds,
  showAllCurrencies = false,
  conversionBaseCurrency = "",
}) {
  const subset = mergedSubsetIds?.length
    ? [...mergedSubsetIds].sort((a, b) => a - b).join(",")
    : "";
  const currencyKey = showAllCurrencies
    ? `ALL:${conversionBaseCurrency || currencyCode || ""}`
    : currencyCode || "";
  return [
    companyId ?? "",
    dateFrom,
    dateTo,
    currencyKey,
    selectedGroup || "",
    groupAllMode ? "1" : "0",
    subset,
  ].join("|");
}

export function bindDashboardSessionCache(ownerKey) {
  const key = String(ownerKey || "").trim();
  if (!key) return;
  if (sessionOwnerKey && sessionOwnerKey !== key) {
    store.clear();
    payloadStore.clear();
    sessionBootstrapDone = false;
  }
  sessionOwnerKey = key;
}

export function isDashboardSessionBootstrapped(ownerKey) {
  const key = String(ownerKey || "").trim();
  return Boolean(key && sessionBootstrapDone && sessionOwnerKey === key);
}

export function markDashboardSessionBootstrapped(ownerKey) {
  const key = String(ownerKey || "").trim();
  if (!key) return;
  sessionOwnerKey = key;
  sessionBootstrapDone = true;
}

export function isDashboardSessionWarmDone() {
  return sessionWarmDone;
}

export function markDashboardSessionWarmDone() {
  sessionWarmDone = true;
}

export function resetDashboardSessionCaches() {
  store.clear();
  payloadStore.clear();
  sessionOwnerKey = "";
  sessionBootstrapDone = false;
  sessionWarmDone = false;
}

export function getDashboardCache(key) {
  return store.get(key) ?? null;
}

export function setDashboardCache(key, entry) {
  if (store.has(key)) store.delete(key);
  store.set(key, entry);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

export function patchDashboardCache(key, patch) {
  const prev = store.get(key);
  if (!prev) {
    setDashboardCache(key, patch);
    return;
  }
  setDashboardCache(key, { ...prev, ...patch });
}

/** Earnings rows are identical across display-currency scopes — reuse from a sibling cache entry. */
export function findSharedDashboardEarnings(scopeKeys, expectedCount) {
  const keys = Array.isArray(scopeKeys) ? scopeKeys : [scopeKeys];
  for (const key of keys) {
    if (!key) continue;
    const earnings = store.get(key)?.earnings;
    if (!Array.isArray(earnings) || !earnings.length) continue;
    if (expectedCount > 0 && earnings.length !== expectedCount) continue;
    return earnings;
  }
  return null;
}

export function getDashboardPayloadCache(queryString) {
  return payloadStore.get(queryString) ?? null;
}

export function setDashboardPayloadCache(queryString, data) {
  if (payloadStore.has(queryString)) payloadStore.delete(queryString);
  payloadStore.set(queryString, data);
  while (payloadStore.size > MAX_PAYLOAD_ENTRIES) {
    payloadStore.delete(payloadStore.keys().next().value);
  }
}

export function clearDashboardPayloadCache() {
  payloadStore.clear();
}

export function clearDashboardCache() {
  store.clear();
}
