const MAX_ENTRIES = 24;

/** @type {Map<string, { current: unknown, previous: unknown, earnings?: Array<{ code: string, earnings: number }> }>} */
const store = new Map();

export function buildDashboardCacheKey({
  companyId,
  dateFrom,
  dateTo,
  currencyCode,
  selectedGroup,
  groupAllMode,
  mergedSubsetIds,
}) {
  const subset = mergedSubsetIds?.length
    ? [...mergedSubsetIds].sort((a, b) => a - b).join(",")
    : "";
  return [
    companyId ?? "",
    dateFrom,
    dateTo,
    currencyCode || "",
    selectedGroup || "",
    groupAllMode ? "1" : "0",
    subset,
  ].join("|");
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
